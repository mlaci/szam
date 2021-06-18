import {
  fit,
  ease,
  createCanvas,
  createCanvasFrom,
  getPixel,
  getBufferValue,
  setBufferValue,
  logScale,
  randomize,
  compose
} from "./util.js"

import { getBitmaps, drawBitmapTo, maskBitmapColorsFrom } from "./bitmap.js"

const SMALLEST_FONT = 7
const ANIMATION = true
const MIN_VALUE = 0.0001
const BACKGROUND_COLOR = [255, 255, 255]
const ALPHABET = [..."0123456789"]

//https://www.w3.org/TR/css-color-4/#color-conversion-code
function gam_sRGB(val){
  if (val > 0.0031308){
    return 1.055 * Math.pow(val, 1/2.4) - 0.055
  }

  return 12.92 * val
}
function lin_sRGB(val){
  if (val < 0.04045){
    return val / 12.92
  }
  return Math.pow((val + 0.055) / 1.055, 2.4)
}
const lin_sRGBLookup = [...Array(256)].map((_,i)=>lin_sRGB(i/255)*255)
const gam_sRGBLookup = [...Array(256)].map((_,i)=>gam_sRGB(i/255)*255)

function linearColor(color){
  return [
    lin_sRGBLookup[color[0]],
    lin_sRGBLookup[color[1]],
    lin_sRGBLookup[color[2]],
    color[3]
  ]
}

function linearImage(image){
  const buffer = new Uint8ClampedArray(image.data.length)
  for(let i = 0; i < image.data.length; i = i + 4){
    buffer[i + 0] = lin_sRGBLookup[image.data[i + 0]]
    buffer[i + 1] = lin_sRGBLookup[image.data[i + 1]]
    buffer[i + 2] = lin_sRGBLookup[image.data[i + 2]]
    buffer[i + 3] = image.data[i + 3]
  }
  return new ImageData(buffer, image.width)
}

function blendTo(color, background){
  const alpha = color[3] / 255
  return [
    color[0] * alpha + background[0] * (1 - alpha),
    color[1] * alpha + background[1] * (1 - alpha),
    color[2] * alpha + background[2] * (1 - alpha),
    255
  ]
}

//https://en.wikipedia.org/wiki/Alpha_compositing
function alphaBlendTo(color, background){
  const alpha = color[3]
  const bgAlpha = background[3]
  const ratio = alpha/255
  const bgRatio = bgAlpha/255*(1-ratio)
  const newAlpha = ratio + bgRatio
  return [
    (color[0]*ratio + background[0]*bgRatio)/newAlpha,
    (color[1]*ratio + background[1]*bgRatio)/newAlpha,
    (color[2]*ratio + background[2]*bgRatio)/newAlpha,
    newAlpha*255
  ]
}

const blobCanvas = createCanvas()
async function blobToImageData(blob, widthMax, heightMax){
  const img = document.createElement("img")
  img.decoding = "async"
  img.src = URL.createObjectURL(blob)
  await new Promise(resolve=>img.addEventListener("load", resolve))
  const {width, height} = fit(img.width, img.height, widthMax, heightMax)
  blobCanvas.width = width
  blobCanvas.height = height
  const context = blobCanvas.getContext("2d")
  context.drawImage(img, 0, 0, blobCanvas.width, blobCanvas.height)
  URL.revokeObjectURL(img.src)
  return context.getImageData(0, 0, blobCanvas.width, blobCanvas.height)
}

const blobRequest = fetch("https://upload.wikimedia.org/wikipedia/commons/1/1c/1998_Chevrolet_Corvette_C5_at_Hatfield_Heath_Festival_2017.jpg").then(response=>response.blob())

const canvas = document.querySelector("canvas")
const context = canvas.getContext("2d", {alpha: true})

async function main(){
  const {width: widthMax, height: heightMax} = canvas.getClientRects()[0]

  const blob = await blobRequest
  const original = await blobToImageData(blob, widthMax, heightMax)
  const originalCanvas = createCanvasFrom(original)
  const originalLinear = linearImage(original)
  
  canvas.width = original.width
  canvas.height = original.height
  const canvasDim = [0, 0, canvas.width, canvas.height]

  context.clearRect(...canvasDim)
  context.textAlign = "center"
  context.textBaseline = "middle"

  const image = new ImageData(canvas.width, canvas.height)
  const diffArray = new Float32Array(canvas.width*canvas.height)
  diffArray.width = canvas.width
  diffArray.height = canvas.height
  for(let offset = 0; offset < diffArray.length; offset++){
    const originalColor = getPixel(originalLinear, offset)
    setBufferValue(diffArray, offset, colorDistance(originalColor, BACKGROUND_COLOR))
  }

  console.time("total")
  for (let cellHeight of logScale(canvas.height, SMALLEST_FONT)){
    console.log(cellHeight)
    const ratio = ease(Math.log2(canvas.height/cellHeight) / Math.log2(canvas.height/SMALLEST_FONT), 20)
    const fontWeight = Math.round(400 + 200*ratio)
    const fontFamily = ["'Work Sans'", "Arial", "san-serif"]
    const fontPadding = {
      x: size => {
        const small = -0.3
        const point = 15
        const big = -0.05
        const ratio = (point - size) / (point - SMALLEST_FONT)
        return size<point ? ratio * small + (1 - ratio) * big : big
      },
      y: 0.02
    }
    const bitmaps = await getBitmaps(ALPHABET, cellHeight, fontWeight, fontFamily, true, fontPadding)
    cellHeight = bitmaps[0].height
    const cellWidth = bitmaps[0].width
    console.time("layer")
    const cells = []
    const padding = {
      x: Math.floor((canvas.width % cellWidth) / 2),
      y: Math.floor((canvas.height % cellHeight) / 2)
    }
    const grid = {
      offsetZ: 0,
      offsetW: 0,
      width: Math.floor(canvas.width / cellWidth),
      height: Math.floor(canvas.height / cellHeight),
      length: Math.floor(canvas.width / cellWidth) * Math.floor(canvas.height / cellHeight)
    }
    const cell = {
      width: cellWidth,
      height: cellHeight,
      length: cellWidth*cellHeight
    }
    const originalFlat = flattenImage(originalLinear, padding, grid, cell)
    const imageFlat = flattenImage(image,  padding, grid, cell)
    const diffArrayFlat = new Float32Array(flatten(diffArray, diffArray.width, padding, grid, cell).buffer)
    for (let w = 0; w < grid.height; w++){
      for (let z = 0; z < grid.width; z++){
        const alphabet = [...randomize(bitmaps)]
        const p = {
          best: {
            penalty: Infinity,
            color: [255, 255, 255],
            bitmap: alphabet[0]
          }, 
          offset: (z + w * grid.width) * cell.length,
          alphabet
        }
        cells.push(p)
      }
    }
    const lettersFlat2 = flattenImage(image, padding, grid, cell)
    for(let i = 0; i< ALPHABET.length; i++){
      const letters = new ImageData(image.data.slice(0), image.width, image.height)
      const lettersFlat = new ImageData(lettersFlat2.data.slice(0), lettersFlat2.width, lettersFlat2.height)
      for(let cell of cells){
        const {offset, alphabet} = cell
        const bitmap = alphabet[i]
        const colors = maskBitmapColorsFrom(originalFlat, offset, bitmap)
        cell.color = getColor(colors).map(val=>gam_sRGB(val/255)*255)
        drawBitmapTo(lettersFlat, offset, bitmap, cell.color)
      }
      unflattenImageTo(letters, lettersFlat, padding, grid, cell)
      context.putImageData(letters, 0, 0)
      for(let {alphabet, color, offset, best} of cells){
        const bitmap = alphabet[i]
        const diffPenalty = getPenalty(originalFlat, lettersFlat, diffArrayFlat, offset, bitmap)
        if (diffPenalty < best.penalty) {
          best.penalty = diffPenalty
          best.bitmap = bitmap
          best.color = color
        }
      }
      if(ANIMATION){
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    for(let {best: {bitmap, color}, offset} of cells){
      drawBitmapTo(imageFlat, offset, bitmap, color)
      setDiff(imageFlat, originalFlat, diffArrayFlat, offset, bitmap)
    }
    unflattenImageTo(image, imageFlat, padding, grid, cell)
    unflattenTo(diffArray, diffArrayFlat, diffArray.width, padding, grid, cell)
    context.putImageData(image, 0, 0)
    console.timeEnd("layer")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  console.timeEnd("total")
  compose(canvas, originalCanvas, "destination-over")
  const final = context.getImageData(...canvasDim)
  while(true){
    context.putImageData(original, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
    context.putImageData(final, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}
main()

//Math.hypot
//https://www.w3.org/TR/css-color-4/#rgb-to-lab
function colorDistance(color1, color2){
  const dr = color1[0] - color2[0]
  const dg = color1[1] - color2[1]
  const db = color1[2] - color2[2]
  return Math.sqrt(dr*dr + dg*dg + db*db)
  /*if(dr<128){
    return Math.sqrt(2*dr*dr + 4*dg*dg + 3*db*db)
  }
  else{
    return Math.sqrt(3*dr*dr + 4*dg*dg + 2*db*db)
  }*/
}

function getPenalty(original, image, diffArray, cellOffset, bitmap){
  let penalty = 0
  for(let offset = 0; offset < bitmap.width*bitmap.height; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const imageColor = blendTo(linearColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = getBufferValue(diffArray, pixelOffset)
    penalty = penalty - prevDiff + colorDistance(originalColor, imageColor)
  }
  return penalty
}

function setDiff(image, original, diffArray, cellOffset, bitmap){
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const color = blendTo(linearColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    setBufferValue(diffArray, pixelOffset, colorDistance(originalColor, color))
  }
}

function centroid(vectors){
  const sum = [0, 0, 0]
  for(const vector of vectors){
    sum[0] = sum[0] + vector[0]
    sum[1] = sum[1] + vector[1]
    sum[2] = sum[2] + vector[2]
  }
  return [sum[0]/vectors.length, sum[1]/vectors.length, sum[2]/vectors.length]
}

function weiszfeld(vectors, prev){
  const numerator = [0, 0, 0]
  var deminator = 0
  for(const vector of vectors){
    var distance = colorDistance(vector, prev)
    distance = distance == 0 ? MIN_VALUE : distance
    numerator[0] = numerator[0] + vector[0]/distance
    numerator[1] = numerator[1] + vector[1]/distance
    numerator[2] = numerator[2] + vector[2]/distance
    deminator = deminator + 1/distance
  }
  return [numerator[0]/deminator, numerator[1]/deminator, numerator[2]/deminator]
}

function subtractVector(vec1, vec2){
  return [vec1[0] - vec2[0], vec1[1] - vec2[1], vec1[2] - vec2[2]]
}

function getColor(colors){
  var prevMean = [Infinity, Infinity, Infinity]
  var mean = centroid(colors)
  while(subtractVector(prevMean, mean).some(value=>Math.abs(value)>0.5)){
    prevMean = mean
    mean = weiszfeld(colors, mean)
  }
  return mean
}

function flattenCopy(array, flatArray, width, padding, grid, cell, mode){ 
  var offset = 0
  for (let w = grid.offsetW; w < grid.offsetW + grid.height; w++){
    for (let z = grid.offsetZ; z < grid.offsetZ + grid.width; z++){
      const offsetX = padding.x + z * cell.width
      const offsetY = padding.y + w * cell.height
      for (let y = 0; y < cell.height; y++){
        const rowOffset = (offsetX + (y + offsetY)*width) * 4
        const rowLength = cell.width * 4
        if(mode == "flatten"){
          const row = new Uint8Array(array.buffer, rowOffset, rowLength)
          flatArray.set(row, offset)
        }
        else if(mode == "unflatten"){
          const row = new Uint8Array(flatArray.buffer, offset, rowLength)
          array.set(row, rowOffset)
        }
        offset = offset + rowLength
      }
    }
  }
}

function flatten(array, width, padding, grid, cell){
  array = new Uint8Array(array.buffer)
  const flatArray = new Uint8Array(cell.width * cell.height * grid.length * 4)
  flattenCopy(array, flatArray, width, padding, grid, cell, "flatten")
  return flatArray
}

function flattenImage(image, padding, grid, cell){
  return new ImageData(new Uint8ClampedArray(flatten(image.data, image.width, padding, grid, cell).buffer), cell.width)
}

function unflattenTo(array, flatArray, width, padding, grid, cell){
  array = new Uint8Array(array.buffer)
  flatArray = new Uint8Array(flatArray.buffer)
  flattenCopy(array, flatArray, width, padding, grid, cell, "unflatten")
}

function unflattenImageTo(image, flatImage, padding, grid, cell){
  unflattenTo(image.data, flatImage.data, image.width, padding, grid, cell, "unflatten")
}
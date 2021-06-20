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
  compose,
  blobToImageData
} from "./util.js"

import {
  gam_sRGB,
  linearColor,
  linearImage,
  blendTo,
  colorDistance
} from "./image.js"

import {
  getBitmaps,
  drawBitmapTo,
  maskBitmapColorsFrom
} from "./bitmap.js"

import { getColor } from "./color.js"

const SMALLEST_FONT = 7
const ANIMATION = true
const BACKGROUND_COLOR = [255, 255, 255]
const ALPHABET = [..."0123456789"]

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
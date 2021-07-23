import {
  sliceEvenly,
  ease,
  createCanvasFrom,
  getPixel,
  setBufferValue,
  log2Sequence,
  compose,
  blobToImageData
} from "./util.js"

import {
  linearizeImage,
  colorDistance
} from "./image.js"

import {
  getBitmaps
} from "./bitmap.js"

import { CalcWorker } from "./proxy.js"

const SMALLEST_FONT = 7
const ANIMATION = true
const BACKGROUND_COLOR = [255, 255, 255]
const ALPHABET = {
  texts: [
    {text: "0"},
    {text: "1"},
    {text: "2"},
    {text: "3"},
    {text: "4"},
    {text: "5"},
    {text: "6"},
    {text: "7"},
    {text: "8"},
    {text: "9"},
  ],
  fontFamily: ["'Work Sans'", "Arial", "san-serif"],
  fontWeight: {min: 400, max: 600},
  padding: {
    x: size => {
      const small = -0.3
      const point = 15
      const big = -0.05
      const ratio = (point - size) / (point - SMALLEST_FONT)
      return size<point ? ratio * small + (1 - ratio) * big : big
    },
    y: 0.02
  }
}

const threads = navigator.hardwareConcurrency-1 || 1

const workers = [...Array(threads)].map(()=>new CalcWorker(new Worker("./worker.js", {type: "module"})))

const blobRequest = fetch("https://upload.wikimedia.org/wikipedia/commons/1/1c/1998_Chevrolet_Corvette_C5_at_Hatfield_Heath_Festival_2017.jpg").then(response=>response.blob())

const canvas = document.querySelector("canvas")
const context = canvas.getContext("2d", {alpha: true})

async function main(){
  const container = canvas.getClientRects()[0]
  container.width = container.width * devicePixelRatio
  container.height = container.height * devicePixelRatio

  const blob = await blobRequest
  const original = await blobToImageData(blob, container)
  const originalCanvas = createCanvasFrom(original)
  const originalLinear = linearizeImage(original)
  
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
  for (let cellHeight of log2Sequence(canvas.height, SMALLEST_FONT)){
    console.time("layer")
    console.log(cellHeight)
    const ratio = ease(Math.log2(canvas.height/cellHeight) / Math.log2(canvas.height/SMALLEST_FONT), 20)
    const min = ALPHABET.fontWeight?.min || 400
    const diff = ALPHABET.fontWeight?.max - ALPHABET.fontWeight?.min || 200
    const fontWeight = Math.round(min + diff*ratio)
    console.time("bitmap")
    const bitmaps = await getBitmaps(ALPHABET, cellHeight, fontWeight)
    console.timeEnd("bitmap")
    cellHeight = bitmaps[0].height
    const cellWidth = bitmaps[0].width
    const padding = {
      x: Math.floor((canvas.width % cellWidth) / 2),
      y: Math.floor((canvas.height % cellHeight) / 2)
    }
    const width = Math.max(1, Math.floor(canvas.width / cellWidth))
    const height = Math.max(Math.floor(canvas.height / cellHeight))
    const grid = {
      offsetZ: 0,
      offsetW: 0,
      width,
      height,
      length: width * height
    }
    const cell = {
      width: cellWidth,
      height: cellHeight,
      length: cellWidth*cellHeight
    }
    const originalFlat = flattenImage(originalLinear, padding, grid, cell)
    const imageFlat = flattenImage(image,  padding, grid, cell)
    const diffArrayFlat = new Float32Array(flatten(diffArray, diffArray.width, padding, grid, cell).buffer)
    const lettersFlat = flattenImage(image, padding, grid, cell)
    const jobs = []
    for(let {start, length} of sliceEvenly({start: 0, length: grid.length}, threads)){
      jobs.push(async (worker)=>{
        start = start * cell.length
        const end = start + length * cell.length
        const originalFlatRow = new ImageData(originalFlat.data.slice(start*4, end*4), cell.width)
        const imageFlatRow = new ImageData(imageFlat.data.slice(start*4, end*4), cell.width)
        const lettersFlatRow = new ImageData(lettersFlat.data.slice(start*4, end*4), cell.width)
        const diffArrayFlatRow = diffArrayFlat.slice(start, end)
        const result = await worker.calc(originalFlatRow, imageFlatRow, lettersFlatRow, diffArrayFlatRow, length, cell.length, bitmaps, newImageFlatRow=>{
          imageFlat.data.set(newImageFlatRow.data, start*4)
          unflattenImageTo(image, imageFlat, padding, grid, cell)
          context.putImageData(image, 0, 0)
        })
        return {result, start}
      })
    }
    for await (const {result, start} of doParallel(workers, jobs)){
      imageFlat.data.set(result.imageFlat.data, start*4)
      diffArrayFlat.set(result.diffArrayFlat, start)
      unflattenImageTo(image, imageFlat, padding, grid, cell)
      context.putImageData(image, 0, 0)
      if(ANIMATION){
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
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

async function* doParallel(workers, jobs){
  var workerPool = workers.slice(0, jobs.length).map((worker, index)=>{return Promise.resolve({worker, index})})
  for(const job of jobs){
    const {result, worker, index} = await Promise.race(workerPool)
    workerPool[index] = job(worker).then(result=>{return {result, worker, index}})
    if(result != undefined){
      yield result
    }
  }
  while(workerPool.some(job=>job!=undefined)){
    const {result, index} = await Promise.race(workerPool.filter(job=>job!=undefined))
    workerPool[index] = undefined
    yield result
  }
}
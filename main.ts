import type { Rect, Grid, Texts, Frame } from "./types.js"
import type { Canvas } from "./util.js"
import {
  sliceEvenly,
  ease,
  createCanvasFrom,
  ImageDiff,
  log2Sequence,
  compose,
  blobToImageData
} from "./util.js"

import {
  linearizeImage,
} from "./image.js"

import {
  getBitmaps
} from "./bitmap.js"

import {
  flatten,
  flattenImage,
  unflattenTo,
  unflattenImageTo
} from "./flatten.js"

import { CalcWorker } from "./proxy.js"

const numbers: Texts = {
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
  smallestSize: 7,
  fontFamily: ["'Work Sans'", "Arial", "san-serif"],
  fontWeight: {min: 400, max: 600, factor: 20},
  padding: {
    x: (height) => {
      const small = -0.3
      const point = 15
      const big = -0.05
      const ratio = (point - height) / (point - numbers.smallestSize)
      return height<point ? ratio * small + (1 - ratio) * big : big
    },
    y: 0.02
  }
}

const chevyFrame: Frame = {
  title: "Chevy",
  imageSource: "https://upload.wikimedia.org/wikipedia/commons/1/1c/1998_Chevrolet_Corvette_C5_at_Hatfield_Heath_Festival_2017.jpg",
  alphabet: numbers,
  animation: true,
  backgroundColor: [255, 255, 255] as const,
  epilogue: {
    text: "",
    duration: 5000
  }
}

const threads = navigator.hardwareConcurrency-1 || 1

const workers = [...Array(threads)].map(()=>new CalcWorker())

function getCanvas(): Canvas {
  const canvas = document.querySelector("canvas")
  return Object.assign(canvas, {context: canvas.getContext("2d", {alpha: true})})
}

async function main(){
  const canvas = getCanvas()
  await drawFrame(canvas, chevyFrame)
}
main()

async function drawFrame(canvas: Canvas, frame: Frame){
  const { alphabet, imageSource, animation, backgroundColor } = frame
  const canvasRect = canvas.getClientRects()[0]
  const container: Rect = {
    width: canvasRect.width * devicePixelRatio,
    height: canvasRect.height * devicePixelRatio
  }
  const blob = await fetch(imageSource).then(res=>res.blob())
  const original = await blobToImageData(blob, container)
  const originalCanvas = createCanvasFrom(original)
  const originalLinear = linearizeImage(original)
  canvas.width = original.width
  canvas.height = original.height
  const canvasDim = [0, 0, canvas.width, canvas.height] as const
  const image = new ImageData(canvas.width, canvas.height)
  const imageDiff = new ImageDiff(originalLinear, backgroundColor)
  console.time("total")
  for (let cellHeight of log2Sequence(canvas.height, alphabet.smallestSize)){
    console.time("layer")
    console.log(cellHeight)

    let fontWeight: number
    if("fontWeight" in alphabet){
      const ratio = ease(Math.log2(canvas.height/cellHeight) / Math.log2(canvas.height/alphabet.smallestSize), alphabet.fontWeight.factor)
      const min = alphabet.fontWeight?.min || 400
      const diff = alphabet.fontWeight?.max - alphabet.fontWeight?.min || 200
      fontWeight = Math.round(min + diff*ratio)
    }

    const bitmaps = await getBitmaps(alphabet, cellHeight, fontWeight)

    cellHeight = bitmaps[0].height
    const cellWidth = bitmaps[0].width
    const width = Math.max(1, Math.floor(canvas.width / cellWidth)) //!!
    const height = Math.max(Math.floor(canvas.height / cellHeight))

    const grid: Grid = {
      width,
      height,
      length: width * height,
      offset: {
        left: Math.floor((canvas.width % cellWidth) / 2),
        top: Math.floor((canvas.height % cellHeight) / 2)
      },
      cell: {
        width: cellWidth,
        height: cellHeight,
        length: cellWidth*cellHeight
      }
    }

    const originalFlat = flattenImage(originalLinear, grid)
    const imageFlat = flattenImage(image, grid)
    const imageDiffFlat = new ImageDiff(flatten(imageDiff, imageDiff.width, grid).buffer, grid.cell.width)
    const lettersFlat = flattenImage(image, grid)

    const jobs = []
    for(let {start, length} of sliceEvenly({start: 0, length: grid.length}, threads)){
      jobs.push(async (worker: CalcWorker)=>{
        start = start * grid.cell.length
        const end = start + length * grid.cell.length
        const originalChunk = new ImageData(originalFlat.data.slice(start*4, end*4), grid.cell.width)
        const imageChunk = new ImageData(imageFlat.data.slice(start*4, end*4), grid.cell.width)
        const lettersChunk = new ImageData(lettersFlat.data.slice(start*4, end*4), grid.cell.width)
        const imageDiffChunk = new ImageDiff(imageDiffFlat.slice(start, end).buffer, grid.cell.width)
        const result = await worker.calc(originalChunk, imageChunk, lettersChunk, imageDiffChunk, length, grid.cell.length, bitmaps, animation, newImage=>{
          imageFlat.data.set(newImage.data, start*4)
          unflattenImageTo(image, imageFlat, grid)
          canvas.context.putImageData(image, 0, 0)
        })
        return {result, start}
      })
    }
    for await (const {result, start} of doParallel(workers, jobs)){
      imageFlat.data.set(result.image.data, start*4)
      imageDiffFlat.set(result.imageDiff, start)
      unflattenImageTo(image, imageFlat, grid)
      canvas.context.putImageData(image, 0, 0)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    unflattenImageTo(image, imageFlat, grid)
    unflattenTo(imageDiff, imageDiffFlat, imageDiff.width, grid)
    canvas.context.putImageData(image, 0, 0)
    console.timeEnd("layer")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  console.timeEnd("total")
  compose(canvas, originalCanvas, "destination-over")
  const final = canvas.context.getImageData(...canvasDim)
  while(true){
    canvas.context.putImageData(original, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
    canvas.context.putImageData(final, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

const idle = Symbol("idle")
async function* doParallel(workers: Worker[], jobs: ((worker: Worker)=>Promise<any>)[]){
  var workerPool: Promise<{worker: Worker, index: number, result: any}>[] = workers
    .slice(0, jobs.length)
    .map((worker, index)=>{return Promise.resolve({worker, index, result: idle})})
  for(const job of jobs){
    const {result, worker, index} = await Promise.race(workerPool)
    workerPool[index] = job(worker).then(result=>{return {result, worker, index}})
    if(result != idle){
      yield result
    }
  }
  while(workerPool.some(job=>job != undefined)){
    const {result, index} = await Promise.race(workerPool.filter(job=>job!=undefined))
    workerPool[index] = undefined
    yield result
  }
}
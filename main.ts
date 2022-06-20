import type { Rect, Grid, Texts, Frame} from "./types.js"
import type { RGB } from "./image.js"
import type { Canvas, ColorName } from "./util.js"
import type { CalcData } from "./worker.js"
import {
  sliceEvenly,
  ease,
  createCanvasFrom,
  log2Sequence,
  compose,
  blobToImageData,
  colorNameToRGB
} from "./util.js"

import {
  linearizeColor,
  linearizeImage,
  nonlinearizeImage,
  ImageDiff,
  RGBAImage,
  PaletteImage
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


const workSansFull = new FontFace("Work Sans", "url(./QGYsz_wNahGAdqQ43Rh_fKDp.woff2) format('woff2')", {
  style: "normal",
  weight: "100 1000",
  display: "swap",
  unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
})

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
  fontFace: workSansFull,
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

const basicColors: ColorName[] = ["black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua"]

const chevyFrame: Frame = {
  title: "Chevy",
  imageSource: "https://upload.wikimedia.org/wikipedia/commons/1/1c/1998_Chevrolet_Corvette_C5_at_Hatfield_Heath_Festival_2017.jpg",
  alphabet: numbers,
  palette: [...Array(1)].fill(basicColors.map(colorNameToRGB)).flat().map(linearizeColor), //{quantization: 16},
  backgroundColor: [255, 255, 255] as const,
  animation: true,
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
  await playFrame(canvas, chevyFrame)
}
main()

async function playFrame(canvas: Canvas, frame: Frame){
  const { alphabet, imageSource } = frame
  if("fontFace" in alphabet && alphabet.fontFace instanceof FontFace){
    alphabet.fontFace.load()
    //@ts-ignore
    document.fonts.add(alphabet.fontFace)
  }
  const canvasRect = canvas.getClientRects()[0]
  const container: Rect = {
    width: canvasRect.width * devicePixelRatio,
    height: canvasRect.height * devicePixelRatio
  }
  const blob = await fetch(imageSource).then(res=>res.blob())
  const original = await blobToImageData(blob, container)
  const originalCanvas = createCanvasFrom(original)
  canvas.width = original.width
  canvas.height = original.height
  //const paletteImage = new PaletteImage(new RGBAImage(original))
  canvas.context.putImageData(original, 0, 0)
  /*const originalLinear = linearizeImage(paletteImage.getImageData())
  await drawImage(canvas, originalLinear, frame)
  compose(canvas, originalCanvas, "destination-over")
  const final = canvas.context.getImageData(0, 0, canvas.width, canvas.height)
  while(true){
    canvas.context.putImageData(original, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
    canvas.context.putImageData(final, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }*/
}

async function drawImage(canvas: Canvas, originalLinear: ImageData, frame: Frame){
  const { alphabet, animation, backgroundColor } = frame

  console.time("total")
  let palette: RGB[]
  if(frame.palette instanceof Array){
    palette = frame.palette
  }
  else if(frame.palette instanceof Object){
    //TODO quant
  }

  const image = new ImageData(canvas.width, canvas.height)
  const imageDiff = new ImageDiff(new RGBAImage(originalLinear), backgroundColor)

  for (let cellHeight of log2Sequence(canvas.height, alphabet.smallestSize)){
    console.time("layer")

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
    const imageDiffFlat = new ImageDiff(flatten(imageDiff.data, imageDiff.width, grid).buffer, grid.cell.width)

    const jobs: ((worker: CalcWorker) => Promise<{result: {image: ImageData, imageDiff: ImageDiff}, start: number}>)[] = []
    for(let {start, length} of sliceEvenly({start: 0, length: grid.length}, threads)){
      jobs.push(async (worker: CalcWorker)=>{
        start = start * grid.cell.length
        const end = start + length * grid.cell.length
        const originalChunk = new RGBAImage(originalFlat.data.slice(start*4, end*4), grid.cell.width)
        const imageChunk = new RGBAImage(imageFlat.data.slice(start*4, end*4), grid.cell.width)
        const imageDiffChunk = new ImageDiff(imageDiffFlat.data.slice(start, end).buffer, grid.cell.width)
        const data: CalcData = {original: originalChunk, image: imageChunk, imageDiff: imageDiffChunk}
        function draw(newImage: ImageData){
          imageFlat.data.set(newImage.data, start*4)
          unflattenImageTo(image, imageFlat, grid)
          canvas.context.putImageData(image, 0, 0)
        }
        let result
        if(palette){
          result = await worker.calcPalette({data, gridLength: length, cellLength: grid.cell.length, bitmaps, animation, palette}, draw)
        }
        else{
          result = await worker.calc({data, gridLength: length, cellLength: grid.cell.length, bitmaps, animation}, draw)
        }
        return {result, start}
      })
    }
    for await (const {result, start} of doParallel(workers, jobs)){
      imageFlat.data.set(result.image.data, start*4)
      imageDiffFlat.data.set(result.imageDiff.data, start)
      unflattenImageTo(image, imageFlat, grid)
      canvas.context.putImageData(image, 0, 0)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    unflattenTo(imageDiff.data, imageDiffFlat.data, imageDiff.width, grid) //??
    console.timeEnd("layer")
  }
  console.timeEnd("total")
}

const idle = Symbol("idle")
async function* doParallel<T>(workers: Worker[], jobs: ((worker: Worker)=>Promise<T>)[]){
  var workerPool: Promise<{worker: Worker, index: number, result: T | typeof idle}>[] = workers
    .slice(0, jobs.length)
    .map((worker, index)=>{return Promise.resolve({worker, index, result: idle})})
  for(const job of jobs){
    const {result, worker, index} = await Promise.race(workerPool)
    workerPool[index] = job(worker).then(result=>{return {result, worker, index}})
    if(result != idle){
      yield result
    }
  }
  const endPool = workerPool as Promise<{worker: Worker, index: number, result: T}>[]
  while(endPool.some(job=>job != undefined)){
    const {result, index} = await Promise.race(endPool.filter(job=>job!=undefined))
    endPool[index] = undefined
    yield result
  }
}
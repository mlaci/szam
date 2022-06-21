import type { RGB, Image } from "./image.js"
import type { Bitmap } from "./bitmap.js"
import {
  shuffle,
  fromDeepClone
} from "./util.js"

import {
  linearizeColor,
  nonlinearizeColor,
  blendTo,
  colorDistance,
  ImageDiff,
  RGBAImage
} from "./image.js"

import {
  drawBitmapTo,
  maskColorsFrom
} from "./bitmap.js"

import { getMedian } from "./geometric-median.js"

const BACKGROUND_COLOR = [255, 255, 255] as const

function getError(original: Image, image: Image, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): number {
  let error = 0
  for(let offset = 0; offset < bitmap.length; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = original.getPixel(pixelOffset)
    const imageColor = blendTo(linearizeColor(image.getPixel(pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = imageDiff.getDiff(pixelOffset)
    error = error - prevDiff + colorDistance(originalColor, imageColor)
  }
  return error
}

function setDiff(image: Image, original: Image, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): void {
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = original.getPixel(pixelOffset)
    const color = blendTo(linearizeColor(image.getPixel(pixelOffset)), BACKGROUND_COLOR)
    imageDiff.setDiff(pixelOffset, colorDistance(originalColor, color))
  }
}

export interface CalcData {
  original: RGBAImage,
  image: RGBAImage,
  imageDiff: ImageDiff
}

export interface CalcParameters {
  data: CalcData,
  gridLength: number,
  cellLength: number,
  bitmaps: Bitmap[],
  animation: boolean
}

interface Cell {
  offset: number,
  bitmaps: Bitmap[],
  best: {
    error: number, 
    bitmap?: Bitmap, 
    color?: RGB
  },
  actualColor?: RGB
}

function getCells(gridLength: number, cellLength: number, bitmaps: Bitmap[]){
  const cells: Cell[] = []
  for(let cellIndex = 0; cellIndex < gridLength; cellIndex++){
    cells.push({
      offset: cellIndex * cellLength, 
      bitmaps: [...shuffle(bitmaps)],
      best: {
        error: Infinity
      }
    })
  }
  return cells
}

function calcErrors(data: CalcData, letters: RGBAImage, cells: Cell[], bitmapIndex: number): void {
  const {original, imageDiff} = data
  for(let cell of cells){
    const {bitmaps, offset} = cell
    const bitmap = bitmaps[bitmapIndex]
    cell.best ??= {error: Infinity}
    const error = getError(original, letters, imageDiff, offset, bitmap)
    if (error < cell.best.error){
      cell.best.error = error
      cell.best.bitmap = bitmap
      cell.best.color = cell.actualColor
    }
  }
}

async function* calc({data, gridLength, cellLength, bitmaps, animation}: CalcParameters){
  const {original, image, imageDiff} = data
  const cells = getCells(gridLength, cellLength, bitmaps)
  for(let i = 0; i < bitmaps.length; i++){
    const letters = new RGBAImage(image.imageData)
    for(let cell of cells){
      const {offset, bitmaps} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(original, offset, bitmap)
      cell.actualColor = nonlinearizeColor(getMedian(colors) as RGB)
      drawBitmapTo(letters, offset, bitmap, cell.actualColor)
    }
    if(animation){
      yield letters.imageData
    }
    calcErrors(data, letters, cells, i)
  }
  for(let {best: {bitmap, color}, offset} of cells){
    drawBitmapTo(image, offset, bitmap, color)
    setDiff(image, original, imageDiff, offset, bitmap)
  }
  return {image: image.imageData, imageDiff}
}

export interface CalcPaletteParameters extends CalcParameters {
  palette: RGB[]
}

async function* calcPalette({data, gridLength, cellLength, bitmaps, animation, palette}: CalcPaletteParameters){
  const {original, image, imageDiff} = data
  const cells = getCells(gridLength, cellLength, bitmaps)
  for(let i = 0; i < bitmaps.length; i++){
    const letters = new RGBAImage(image.imageData)
    for(let cell of cells){
      const {offset, bitmaps} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(original, offset, bitmap)
      const medianColor = getMedian(colors) as RGB
      let smallestDistance = Infinity
      let nearestColor: RGB
      for(let color of palette){
        const distance = colorDistance(medianColor, color)
        if(distance < smallestDistance){
          smallestDistance = distance
          nearestColor = color
        }
      }
      cell.actualColor = nonlinearizeColor(nearestColor)
      drawBitmapTo(letters, offset, bitmap, cell.actualColor)
    }
    if(animation){
      yield letters.imageData
    }
    calcErrors(data, letters, cells, i)
  }
  for(let {best: {bitmap, color}, offset} of cells){
    drawBitmapTo(image, offset, bitmap, color)
    setDiff(image, original, imageDiff, offset, bitmap)
  }
  return {image: image.imageData, imageDiff}
}

const functions = {
  "calc": calc,
  "calcPalette": calcPalette
}

globalThis.addEventListener("message", async ({data: {name, id, message}})=>{
  if(functions[name].constructor.name == "AsyncGeneratorFunction"){
    const generator: AsyncGenerator = functions[name](fromDeepClone(message))
    var done = false
    while(!done){
      const result = await generator.next()
      globalThis.postMessage({id, message: result})
      done = result.done
    }
  }
  else{
    const result = await functions[name](fromDeepClone(message))
    globalThis.postMessage({id, message: result})
  }
})
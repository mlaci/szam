import type { RGB } from "./image.js"
import type { Bitmap, BitmapKind } from "./bitmap.js"
import {
  getPixel,
  getBufferValue,
  setBufferValue,
} from "./util.js"

import {
  linearizeColor,
  nonlinearizeColor,
  blendTo,
  colorDistance
} from "./image.js"

import {
  createBitmapFormClone,
  drawBitmapTo,
  maskColorsFrom
} from "./bitmap.js"

import { getMedian } from "./geometric-median.js"

const BACKGROUND_COLOR = [255, 255, 255] as const

function getPenalty(original: ImageData, image: ImageData, diffArray: Float32Array, cellOffset: number, bitmap: Bitmap): number {
  let penalty = 0
  for(let offset = 0; offset < bitmap.length; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const imageColor = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = getBufferValue(diffArray, pixelOffset)
    penalty = penalty - prevDiff + colorDistance(originalColor, imageColor)
  }
  return penalty
}

function setDiff(image: ImageData, original: ImageData, diffArray: Float32Array, cellOffset: number, bitmap: Bitmap): void {
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const color = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    setBufferValue(diffArray, pixelOffset, colorDistance(originalColor, color))
  }
}

interface CalcParameters {
  originalFlat: ImageData,
  imageFlat: ImageData,
  lettersFlatOriginal: ImageData,
  diffArrayFlat: Float32Array,
  gridlength: number,
  cellLength: number,
  bitmaps: {kind: BitmapKind}[]
}

async function* calc(params: CalcParameters){
  const {originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, gridlength, cellLength, bitmaps: bitmapClones} = params
  const bitmaps = bitmapClones.map(clone=>createBitmapFormClone(clone))
  const cells: {offset: number, best: {penalty: number, bitmap?: Bitmap, color?: RGB}, color?: RGB}[] = []
  for(let i = 0; i<gridlength; i++){
    cells.push({offset: i*cellLength, best: {penalty: Infinity}})
  }
  for(let i = 0; i < bitmaps.length; i++){
    const lettersFlat = new ImageData(lettersFlatOriginal.data.slice(0), lettersFlatOriginal.width, lettersFlatOriginal.height)
    for(let cell of cells){
      const {offset} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(originalFlat, offset, bitmap)
      cell.color = nonlinearizeColor(getMedian(colors) as RGB)
      drawBitmapTo(lettersFlat, offset, bitmap, cell.color)
    }

    yield lettersFlat

    for(let cell of cells){
      const {color, offset} = cell
      cell.best ??= {penalty: Infinity}
      const bitmap = bitmaps[i]
      const diffPenalty = getPenalty(originalFlat, lettersFlat, diffArrayFlat, offset, bitmap)
      if (diffPenalty < cell.best.penalty) {
        cell.best.penalty = diffPenalty
        cell.best.bitmap = bitmap
        cell.best.color = color
      }
    }
  }
  for(let {best: {bitmap, color}, offset} of cells){
    drawBitmapTo(imageFlat, offset, bitmap, color)
    setDiff(imageFlat, originalFlat, diffArrayFlat, offset, bitmap)
  }
  return {imageFlat, diffArrayFlat}
}

const functions = {
  "calc": calc
}

globalThis.addEventListener("message", async ({data: {name, id, message}})=>{
  if(functions[name].constructor.name == "AsyncGeneratorFunction"){
    const generator: AsyncGenerator = functions[name](message)
    var done = false
    while(!done){
      const result = await generator.next()
      globalThis.postMessage({id, message: result})
      done = result.done
    }
  }
  else{
    const result = await functions[name](...message)
    globalThis.postMessage({id, message: result})
  }
})
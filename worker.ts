import type { RGB } from "./image.js"
import type { Bitmap, BitmapKind } from "./bitmap.js"
import {
  getPixel,
  ImageDiff,
  getImageDiffValue,
  setImageDiffValue,
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

function getPenalty(original: ImageData, image: ImageData, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): number {
  let penalty = 0
  for(let offset = 0; offset < bitmap.length; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const imageColor = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = getImageDiffValue(imageDiff, pixelOffset)
    penalty = penalty - prevDiff + colorDistance(originalColor, imageColor)
  }
  return penalty
}

function setDiff(image: ImageData, original: ImageData, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): void {
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const color = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    setImageDiffValue(imageDiff, pixelOffset, colorDistance(originalColor, color))
  }
}

interface CalcParameters {
  original: ImageData,
  image: ImageData,
  letters: ImageData,
  imageDiff: ImageDiff,
  gridlength: number,
  cellLength: number,
  bitmaps: {kind: BitmapKind}[],
  animation: boolean
}

async function* calc(params: CalcParameters){
  const {original, image, letters: lettersOriginal, imageDiff, gridlength, cellLength, bitmaps: bitmapClones, animation} = params
  const bitmaps = bitmapClones.map(clone=>createBitmapFormClone(clone))
  const cells: {offset: number, best: {penalty: number, bitmap?: Bitmap, color?: RGB}, color?: RGB}[] = []
  for(let i = 0; i<gridlength; i++){
    cells.push({offset: i*cellLength, best: {penalty: Infinity}})
  }
  for(let i = 0; i < bitmaps.length; i++){
    const letters = new ImageData(lettersOriginal.data.slice(0), lettersOriginal.width, lettersOriginal.height)
    for(let cell of cells){
      const {offset} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(original, offset, bitmap)
      cell.color = nonlinearizeColor(getMedian(colors) as RGB)
      drawBitmapTo(letters, offset, bitmap, cell.color)
    }

    if(animation){
      yield letters
    }

    for(let cell of cells){
      const {color, offset} = cell
      cell.best ??= {penalty: Infinity}
      const bitmap = bitmaps[i]
      const diffPenalty = getPenalty(original, letters, imageDiff, offset, bitmap)
      if (diffPenalty < cell.best.penalty) {
        cell.best.penalty = diffPenalty
        cell.best.bitmap = bitmap
        cell.best.color = color
      }
    }
  }
  for(let {best: {bitmap, color}, offset} of cells){
    drawBitmapTo(image, offset, bitmap, color)
    setDiff(image, original, imageDiff, offset, bitmap)
  }
  return {image, imageDiff}
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
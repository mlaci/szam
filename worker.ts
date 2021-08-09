import type { RGB, Image } from "./image.js"
import type { Bitmap } from "./bitmap.js"
import {
  shuffle,
  fromClone
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

import { centroid, getMedian } from "./geometric-median.js"

const BACKGROUND_COLOR = [255, 255, 255] as const

function getPenalty(original: Image, image: Image, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): number {
  let penalty = 0
  for(let offset = 0; offset < bitmap.length; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = original.getPixel(pixelOffset)
    const imageColor = blendTo(linearizeColor(image.getPixel(pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = imageDiff.getDiff(pixelOffset)
    penalty = penalty - prevDiff + colorDistance(originalColor, imageColor)
  }
  return penalty
}

function setDiff(image: Image, original: Image, imageDiff: ImageDiff, cellOffset: number, bitmap: Bitmap): void {
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = original.getPixel(pixelOffset)
    const color = blendTo(linearizeColor(image.getPixel(pixelOffset)), BACKGROUND_COLOR)
    imageDiff.setDiff(pixelOffset, colorDistance(originalColor, color))
  }
}

type CalcParameters = [
  original: RGBAImage,
  image: RGBAImage,
  letters: RGBAImage,
  imageDiff: ImageDiff,
  gridlength: number,
  cellLength: number,
  bitmaps: Bitmap[],
  palette: RGB[],
  animation: boolean
]

async function* calc(...args: CalcParameters){
  const [original, image, lettersOriginal, imageDiff, gridlength, cellLength, bitmapClones, palette, animation] = args.map(fromClone) as CalcParameters
  const bitmaps = bitmapClones.map(fromClone)
  const cells: {
    offset: number,
    bitmaps: Bitmap[],
    best: {
      penalty: number, 
      bitmap?: Bitmap, 
      color?: RGB
    },
    actualColor?: RGB
  }[] = []
  for(let cellIndex = 0; cellIndex < gridlength; cellIndex++){
    cells.push({
      offset: cellIndex * cellLength, 
      bitmaps: [...shuffle(bitmaps)],
      best: {
        penalty: Infinity
      }
    })
  }
  for(let i = 0; i < bitmaps.length; i++){
    const letters = new RGBAImage(lettersOriginal.imageData.data.slice(0), lettersOriginal.width)
    for(let cell of cells){
      const {offset, bitmaps} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(original, offset, bitmap)
      if(palette){
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
      }
      else{
        const medianColor = nonlinearizeColor(getMedian(colors) as RGB)
        cell.actualColor = medianColor
      }
      drawBitmapTo(letters, offset, bitmap, cell.actualColor)
    }

    if(animation){
      yield letters.imageData
    }

    for(let cell of cells){
      const {bitmaps, offset} = cell
      const bitmap = bitmaps[i]
      cell.best ??= {penalty: Infinity}
      const diffPenalty = getPenalty(original, letters, imageDiff, offset, bitmap)
      if (diffPenalty < cell.best.penalty) {
        cell.best.penalty = diffPenalty
        cell.best.bitmap = bitmap
        cell.best.color = cell.actualColor
      }
    }
  }
  for(let {best: {bitmap, color}, offset} of cells){
    drawBitmapTo(image, offset, bitmap, color)
    setDiff(image, original, imageDiff, offset, bitmap)
  }
  return {image: image.imageData, imageDiff}
}

const functions = {
  "calc": calc
}

globalThis.addEventListener("message", async ({data: {name, id, message}})=>{
  if(functions[name].constructor.name == "AsyncGeneratorFunction"){
    const generator: AsyncGenerator = functions[name](...message)
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
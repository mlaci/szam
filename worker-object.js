import {
  getPixel,
  getBufferValue,
  setBufferValue,
} from "./util.js"

import {
  gam_sRGB,
  linearColor,
  blendTo,
  colorDistance
} from "./image.js"

import {
  createBitmapFormClone,
  drawBitmapTo,
  maskBitmapColorsFrom
} from "./bitmap.js"

import { getColor } from "./color.js"

const BACKGROUND_COLOR = [255, 255, 255]

export class WorkerObject {
  bitmaps
  setBitmaps(bitmapClones){
    this.bitmaps = bitmapClones.map(clone=>createBitmapFormClone(clone))
  }
  async calc(originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, cells, globalOffset){
    for(let i = 0; i < this.bitmaps.length; i++){
      const lettersFlat = new ImageData(lettersFlatOriginal.data.slice(0), lettersFlatOriginal.width, lettersFlatOriginal.height)
      for(let cell of cells){
        const {offset, alphabet} = cell
        const bitmap = this.bitmaps[alphabet[i]]
        const colors = maskBitmapColorsFrom(originalFlat, offset - globalOffset, bitmap)
        cell.color = getColor(colors).map(val=>gam_sRGB(val/255)*255)
        drawBitmapTo(lettersFlat, offset - globalOffset, bitmap, cell.color)
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      for(let {alphabet, color, offset, best} of cells){
        const bitmap = this.bitmaps[alphabet[i]]
        const diffPenalty = getPenalty(originalFlat, lettersFlat, diffArrayFlat, offset - globalOffset, bitmap)
        if (diffPenalty < best.penalty) {
          best.penalty = diffPenalty
          best.bitmap = bitmap
          best.color = color
        }
      }
    }
    for(let {best: {bitmap, color}, offset} of cells){
      drawBitmapTo(imageFlat, offset - globalOffset, bitmap, color)
      setDiff(imageFlat, originalFlat, diffArrayFlat, offset - globalOffset, bitmap)
    }
    return {imageFlat, diffArrayFlat}
  }
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
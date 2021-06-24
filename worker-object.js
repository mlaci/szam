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
  async calc(originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, gridlength, cellLength){
    const cells = []
    for(let i = 0; i<gridlength; i++){
      cells.push({offset: i*cellLength, best: {penalty: Infinity}})
    }
    for(let i = 0; i < this.bitmaps.length; i++){
      const lettersFlat = new ImageData(lettersFlatOriginal.data.slice(0), lettersFlatOriginal.width, lettersFlatOriginal.height)
      for(let cell of cells){
        const {offset} = cell
        const bitmap = this.bitmaps[i]
        const colors = maskBitmapColorsFrom(originalFlat, offset, bitmap)
        cell.color = getColor(colors).map(val=>gam_sRGB(val/255)*255)
        drawBitmapTo(lettersFlat, offset, bitmap, cell.color)
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      for(let cell of cells){
        const {color, offset} = cell
        cell.best ??= {penalty: Infinity}
        const bitmap = this.bitmaps[i]
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
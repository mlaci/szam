import {
  getPixel,
  getBufferValue,
  setBufferValue,
} from "./util.js"

import {
  gam_sRGB,
  linearizeColor,
  blendTo,
  colorDistance
} from "./image.js"

import {
  createBitmapFormClone,
  drawBitmapTo,
  maskColorsFrom
} from "./bitmap.js"

import { getColor } from "./color.js"

function getPenalty(original, image, diffArray, cellOffset, bitmap){
  let penalty = 0
  for(let offset = 0; offset < bitmap.width*bitmap.height; offset++){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const imageColor = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    const prevDiff = getBufferValue(diffArray, pixelOffset)
    penalty = penalty - prevDiff + colorDistance(originalColor, imageColor)
  }
  return penalty
}

function setDiff(image, original, diffArray, cellOffset, bitmap){
  for(let {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const originalColor = getPixel(original, pixelOffset)
    const color = blendTo(linearizeColor(getPixel(image, pixelOffset)), BACKGROUND_COLOR)
    setBufferValue(diffArray, pixelOffset, colorDistance(originalColor, color))
  }
}

const BACKGROUND_COLOR = [255, 255, 255]

async function* calc({originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, gridlength, cellLength, bitmaps: bitmapClones}){
  const bitmaps = bitmapClones.map(clone=>createBitmapFormClone(clone))
  const cells = []
  for(let i = 0; i<gridlength; i++){
    cells.push({offset: i*cellLength, best: {penalty: Infinity}})
  }
  for(let i = 0; i < bitmaps.length; i++){
    const lettersFlat = new ImageData(lettersFlatOriginal.data.slice(0), lettersFlatOriginal.width, lettersFlatOriginal.height)
    for(let cell of cells){
      const {offset} = cell
      const bitmap = bitmaps[i]
      const colors = maskColorsFrom(originalFlat, offset, bitmap)
      cell.color = getColor(colors).map(val=>gam_sRGB(val/255)*255)
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
    const generator = functions[name](message)
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
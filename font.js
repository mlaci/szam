import { createCanvas, getPixel } from "./util.js"

export class FontProp {
  weight
  size
  family
  constructor(weight, size, family){
    this.weight = weight
    this.size = size
    this.family = family
  }
  toString(){
    return `${this.weight} ${this.size}px ${this.family}`
  }
}

function nativeMeasureText(text, font){
  const canvas = createCanvas()
  canvas.context.font = font
  const metric = canvas.context.measureText(text)
  const height = metric.actualBoundingBoxAscent != undefined && metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent
  return {width: metric.width, height, ascent: metric.actualBoundingBoxAscent}
}

export function measureText(text, font){
  const metric = nativeMeasureText(text, font)
  const safetyPixels = 6
  const canvas = createCanvas(
    metric.width + safetyPixels,
    (metric.height ?? fontSize * 1.1 ) + safetyPixels
  )
  canvas.context.font = font
  canvas.context.textAlign = "center"
  canvas.context.clearRect(0, 0, canvas.width, canvas.height)

  const alignCenter = canvas.width * 0.5
  const baseline = Math.ceil(metric.ascent ?? fontSize * 0.82)
  canvas.context.fillText(text, alignCenter, baseline)

  const image = canvas.context.getImageData(0, 0, canvas.width, canvas.height)

  const last = image.width*image.height-1
  var top
  var offset = 0
  while(top == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      top = Math.floor(offset / image.width)
    }
    offset++
    if(offset > last){
      top = baseline
    }
  }
  var bottom
  var offset = last
  while(bottom == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      bottom = Math.ceil(offset / image.width)
    }
    offset--
    if(offset < 0){
      bottom = baseline
    }
  }
  var left
  var offset = 0
  while(left == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      left = offset % image.width - 1
    }
    offset = offset + image.width
    if(offset > last){
      offset = (offset + 1) % image.width
      if(offset == 0){
        left = 0
      }
    }
  }
  var right
  var offset = last
  while(right == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      right = offset % image.width + 1
    }
    offset = offset - image.width
    if(offset < 0){
      offset = offset + last
      if(offset == last - image.width){
        right = 0
      }
    }
  }
  const ascent = baseline - top
  const descent = bottom - baseline
  const height = ascent + descent
  const width = right - left
  return {ascent, descent, height, width}
}

export function measureAlphabet(alphabet, font){
  var maxAscent = 0
  var maxDescent = 0
  var maxHeight = 0
  var maxWidth = 0
  for(const text of alphabet){
    const {ascent, descent, height, width} = measureText(text, font)
    maxAscent = Math.max(maxAscent, ascent)
    maxDescent = Math.max(maxDescent, descent)
    maxHeight = Math.max(maxHeight, height)
    maxWidth = Math.max(maxWidth, width)
  }
  if(maxHeight == 0){
    maxHeight = fontSize
    maxAscent = fontSize
    maxDescent = 0
  }
  if(maxWidth == 0){
    maxWidth = fontSize * 0.9 //!!
  }
  return {maxAscent, maxDescent, maxHeight, maxWidth}
}
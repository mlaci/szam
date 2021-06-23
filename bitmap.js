import { alphaBlendTo } from "./image.js"
import { createCanvas, getPixel, setPixel } from "./util.js"

class FontProp {
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

function measureText(text, font){
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
function measureAlphabet(alphabet, font){
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

class Bitmap {
  width
  height
  dataView
  constructor(bitmapImage){
    this.width = bitmapImage.width
    this.height = bitmapImage.height
    const bitmap = []
    for(let offset = 0; offset < bitmapImage.width*bitmapImage.height; offset++){
      const alpha = getPixel(bitmapImage, offset)[3]
      if(alpha != 0){
        bitmap.push({offset, alpha})
      }
    } 
    this.dataView = new DataView(new ArrayBuffer(bitmap.length * 5))
    var i = 0
    for(const {offset, alpha} of bitmap){
      this.dataView.setUint32(i * 5, offset)
      this.dataView.setUint8(i * 5 + 4, alpha)
      i++
    }
  }
  *[Symbol.iterator](){
    for(let i = 0; i<this.dataView.byteLength / 5; i++){
      const offset = this.dataView.getUint32(i * 5)
      const alpha = this.dataView.getUint8(i * 5 + 4)
      yield {offset, alpha}
    }
  }
}

export function createBitmapFormClone({width, height, dataView}){
  const bitmap = new Bitmap(new ImageData(1, 1))
  bitmap.width = width
  bitmap.height = height
  bitmap.dataView = dataView
  return bitmap
}

const MASK_LIGHT = 0.75
export async function getBitmaps(alphabet, height, fontWeight, fontFamily, alignBaseline, padding){
  alphabet = alphabet.map(text=>text.trim())
  const fontSize = height / (1 + padding.y)
  const font = new FontProp(fontWeight, fontSize, fontFamily)
  await document.fonts.load(font, alphabet.join(""))
  const metric = measureAlphabet(alphabet, font)
  const fontHeight = alignBaseline ? (metric.maxAscent + metric.maxDescent) : metric.maxHeight
  const scaledFont = new FontProp(fontWeight, fontSize * (fontSize / fontHeight), fontFamily)
  const scaledMetric = measureAlphabet(alphabet, scaledFont)
  const scaledFontHeight = alignBaseline ? (scaledMetric.maxAscent + scaledMetric.maxDescent) : scaledMetric.maxHeight
  const actualHeight = scaledFontHeight * (1 + padding.y)
  const canvas = createCanvas(
    scaledMetric.maxWidth * (1 + padding.x(height)),
    height > 30 && height < actualHeight ? height : actualHeight //!!
  )
  const bitmaps = []
  for(const text of alphabet){
    const x = canvas.width * 0.5
    var y
    if(alignBaseline){
      y = scaledMetric.maxAscent + (canvas.height - scaledFontHeight) / 2
    }
    else{
      const {ascent, height} = measureText(text, scaledFont)
      y = ascent + (canvas.height - height)/ 2
    }
    canvas.context.fillStyle = `rgb(${[255*MASK_LIGHT, 255*MASK_LIGHT, 255*MASK_LIGHT].toString()})`
    canvas.context.textAlign = "center"
    canvas.context.font = scaledFont
    canvas.context.clearRect(0, 0, canvas.width, canvas.height)
    canvas.context.fillText(text, x, y)
    const bitmapImage = canvas.context.getImageData(0, 0, canvas.width, canvas.height)
    bitmaps.push(new Bitmap(bitmapImage))
  }
  return bitmaps
}

export function drawBitmapTo(image, cellOffset, bitmap, color){
  for(const {offset, alpha} of bitmap){
    const pixelOffset = cellOffset + offset
    if(alpha != 0 && alpha != 255){
      const imageColor = getPixel(image, pixelOffset)
      const newColor = alphaBlendTo([...color, alpha], imageColor)
      setPixel(image, pixelOffset, newColor)
    }
    else if(alpha == 255){
      setPixel(image, pixelOffset, [...color, alpha])
    }
  }
}

export function maskBitmapColorsFrom(image, cellOffset, bitmap){
  const colors = []
  for(const {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    var imageColor = getPixel(image, pixelOffset).slice(0, 3)
    colors.push(imageColor)
  }
  return colors
}
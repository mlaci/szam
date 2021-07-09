import { alphaBlendTo, reduceColors } from "./image.js"
import { createCanvas, getPixel, setPixel, color2number, number2color } from "./util.js"
import { compress, decompress} from "./compression.js"
import { FontProp, measureText, measureAlphabet } from "./font.js"

//interface
export class Bitmap {
  width
  height
}

class AlphaBitmap extends Bitmap {
  kind = "AlphaBitmap"
  width
  height
  dataView
  constructor(image){
    super()
    this.width = image.width
    this.height = image.height
    this.dataView = new DataView(new ArrayBuffer(image.data.byteLength / 4 * 5))
    var i = 0
    for(let offset = 0; offset < image.width*image.height; offset++){
      const color = getPixel(image, offset)
      const alpha = color[3]
      if(alpha != 0){
        this.dataView.setUint32(i * 5 + 0, offset)
        this.dataView.setUint8(i * 5 + 4, alpha)
        i++
      }
    }
    this.dataView = new DataView(this.dataView.buffer.slice(0, i * 5))
  }
  *[Symbol.iterator](){
    for(let i = 0; i<this.dataView.byteLength / 5; i++){
      const offset = this.dataView.getUint32(i * 5 + 0)
      const alpha = this.dataView.getUint8(i * 5 + 4)
      if(alpha != 0){
        yield {offset, color: [0, 0, 0, alpha]}
      }
    }
  }
}

class ColorBitmap extends Bitmap {
  kind = "ColorBitmap"
  width
  height
  dataView
  constructor(image){
    super()
    this.width = image.width
    this.height = image.height
    this.dataView = new DataView(new ArrayBuffer(image.data.byteLength / 4 * 8))
    var i = 0
    for(let offset = 0; offset < image.width*image.height; offset++){
      const color = getPixel(image, offset)
      const alpha = color[3]
      if(alpha != 0){
        this.dataView.setUint32(i * 8, offset)
        this.dataView.setUint8(i * 8 + 4, color[0])
        this.dataView.setUint8(i * 8 + 5, color[1])
        this.dataView.setUint8(i * 8 + 6, color[2])
        this.dataView.setUint8(i * 8 + 7, color[3])
        i++
      }
    }
    this.dataView = new DataView(this.dataView.buffer.slice(0, i * 8))
  }
  *[Symbol.iterator](){
    for(let i = 0; i<this.dataView.byteLength / 8; i++){
      const offset = this.dataView.getUint32(i * 8)
      const r = this.dataView.getUint8(i * 8 + 4)
      const g = this.dataView.getUint8(i * 8 + 5)
      const b = this.dataView.getUint8(i * 8 + 6)
      const alpha = this.dataView.getUint8(i * 8 + 7)
      if(alpha != 0){
        yield {offset, color: [r, g, b, alpha]}
      }
    }
  }
}

class PaletteBitmap extends Bitmap{
  kind = "PaletteBitmap"
  width
  height
  colors = []
  lengths = [{length: 1, count: 0}]
  dataView
  constructor(image){
    super()
    this.width = image.width
    this.height = image.height
    const imageLength = image.width*image.height
    this.dataView = new DataView(new ArrayBuffer(image.data.byteLength))
    var prevColor
    var length = 1
    var byteLength = 0
    for(let offset = 0; offset < imageLength; offset++){
      const color = color2number(getPixel(image, offset))
      if((prevColor != undefined && prevColor != color) || offset == imageLength-1){
          var index = this.colors.findIndex((data)=>data.color==prevColor)
          if(index == -1){
            this.colors.push({color: prevColor, count: 1})
            index = this.colors.length-1
          }
          else{
            this.colors[index].count++
          }
          this.dataView.setUint16(byteLength + 0, index)
          index = this.lengths.findIndex((data)=>data.length==length)
          if(index == -1){
            this.lengths.push({length, count: 1})
            index = this.lengths.length-1
          }
          else{
            this.lengths[index].count++
          }
          this.dataView.setUint16(byteLength + 2, index)
          length = 1
          byteLength += 4
      }
      else{
        length++
      }
      prevColor = color
    }
    this.dataView = new DataView(this.dataView.buffer.slice(0, byteLength))
  }
  *[Symbol.iterator](){
    var offset = 0
    for(let i = 0; i < this.dataView.byteLength / 4; i++){
      const colorIndex = this.dataView.getUint16(i * 4)
      const color = number2color(this.colors[colorIndex].color)
      const lengthIndex = this.dataView.getUint16(i * 4 + 2)
      const length = this.lengths[lengthIndex].length
      const alpha = color[3]
      if(alpha != 0){
        for(let y = 0; y < length; y++){
          yield {offset, color}
          offset++
        }
      }
      else{
        offset += length
      }
    }
  }
}

class CompressedBitmap {
  kind = "CompressedBitmap"
  width
  height
  data
  colorTree
  lengthTree
  constructor(bitmapImage){
    this.width = bitmapImage.width
    this.height = bitmapImage.height
    ///const reducedImage = reduceColors(bitmapImage, 256)
    const {data, colorTree, lengthTree} = compress(new PaletteBitmap(bitmapImage))
    this.data = data
    this.colorTree = colorTree
    this.lengthTree = lengthTree
  }
  *[Symbol.iterator](){
    for(const {offset, value} of decompress(this.data, this.colorTree, this.lengthTree)){
      yield {offset, color: number2color(value)}
    }
  }
}

const bitmapKinds = {
  "AlphaBitmap": AlphaBitmap,
  "ColorBitmap": ColorBitmap,
  "PaletteBitmap": PaletteBitmap,
  "CompressedBitmap": CompressedBitmap
}

export function createBitmapFormClone(bitmapObject){
  Object.setPrototypeOf(bitmapObject, bitmapKinds[bitmapObject.kind].prototype)
  return bitmapObject
}

const MASK_LIGHT = 0.75
export async function getBitmaps(alphabet, height, fontWeight, fontFamily, alignBaseline, padding, emoji = false){
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
    bitmaps.push(new AlphaBitmap(bitmapImage))
  }
  return bitmaps
}

//export function getBitmapsFromSVG(svgs, height, padding)

export function drawBitmapTo(image, cellOffset, bitmap, bitmapColor){
  for(var {offset, color} of bitmap){
    const pixelOffset = cellOffset + offset
    const alpha = color[3]
    if(alpha != 0 && alpha != 255){
      if(bitmapColor != undefined){
        color = [...bitmapColor, alpha]
      }
      const imageColor = getPixel(image, pixelOffset)
      const newColor = alphaBlendTo(color, imageColor)
      setPixel(image, pixelOffset, newColor)
    }
    else if(alpha == 255){
      if(bitmapColor != undefined){
        color = [...bitmapColor, alpha]
      }
      setPixel(image, pixelOffset, color)
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
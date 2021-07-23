import type { RGB, RGBA } from "./image.js"
import type { Tree } from "./compression.js"
import { alphaBlendTo, medianCut } from "./image.js"
import { getPixel, setPixel, colorToNumber, numberToColor } from "./util.js"
import { compress, readBitStream, repeatSymbol } from "./compression.js"
import { getTextImages } from "./text.js"
import type { TextSources } from "./types.js"

type BitmapKind = keyof typeof bitmapKinds

/** Class represents a generic bitmap. */
abstract class Bitmap {
  /** Type of the subclass */
  readonly kind: BitmapKind
  width: number
  height: number
  length: number
  abstract data: {byteLength: number} 
  /**
   * Creates a Bitmap with an image dimensions.
   * @param image - An image.
   * @param kind - Subclass kind.
   */
  constructor(image: ImageData, kind: BitmapKind){
    this.kind = kind
    this.width = image.width
    this.height = image.height
    this.length = image.width * image.height
  }
  /**
   * Iterator of the Bitmap.
   * @yields - The non-transparent pixels with location and color.
   */
  abstract [Symbol.iterator](): Generator<{offset: number, color: RGBA}, void>;
}

/** 
 * Class represents a bitmap with opacity without colors.
 * It stores the pixel data in a direct location/alpha pair form
 * where the unnecessary fully transparent pixels are filtered out.
 */
class AlphaBitmap extends Bitmap {
  static readonly kind = "AlphaBitmap"
  static readonly value = 5
  data: DataView
  /**
   * Creates a AlphaBitmap from an image.
   * @param image - An image from the bitmap created.
   */
  constructor(image: ImageData){
    super(image, AlphaBitmap.kind)
    this.data = new DataView(new ArrayBuffer(this.length * 5))
    var i = 0
    for(let offset = 0; offset < this.length; offset++){
      const color = getPixel(image, offset)
      const alpha = color[3]
      if(alpha != 0){
        this.data.setUint32(i * 5 + 0, offset)
        this.data.setUint8(i * 5 + 4, alpha)
        i++
      }
    }
    this.data = new DataView(this.data.buffer.slice(0, i * 5))
  }
  *[Symbol.iterator](){
    for(let i = 0; i<this.data.byteLength / 5; i++){
      const offset = this.data.getUint32(i * 5 + 0)
      const alpha = this.data.getUint8(i * 5 + 4)
      const color: RGBA = [0, 0, 0, alpha] as const
      if(alpha != 0){
        yield {offset, color}
      }
    }
  }
}

/** 
 * Class represents a bitmap with RGBA pixels.
 * It stores the pixel data in a direct location/color pair form
 * where the unnecessary fully transparent pixels are filtered out.
 */
class ColorBitmap extends Bitmap {
  static readonly kind = "ColorBitmap"
  data: DataView
  /**
   * Creates a ColorBitmap from an image.
   * @param image - An image from the bitmap created.
   */
  constructor(image: ImageData){
    super(image, ColorBitmap.kind)
    this.data = new DataView(new ArrayBuffer(this.length * 8))
    var i = 0
    for(let offset = 0; offset < this.length; offset++){
      const color = getPixel(image, offset)
      const alpha = color[3]
      if(alpha != 0){
        this.data.setUint32(i * 8, offset)
        this.data.setUint8(i * 8 + 4, color[0])
        this.data.setUint8(i * 8 + 5, color[1])
        this.data.setUint8(i * 8 + 6, color[2])
        this.data.setUint8(i * 8 + 7, color[3])
        i++
      }
    }
    this.data = new DataView(this.data.buffer.slice(0, i * 8))
  }
  *[Symbol.iterator](){
    for(let i = 0; i<this.data.byteLength / 8; i++){
      const offset = this.data.getUint32(i * 8)
      const r = this.data.getUint8(i * 8 + 4)
      const g = this.data.getUint8(i * 8 + 5)
      const b = this.data.getUint8(i * 8 + 6)
      const alpha = this.data.getUint8(i * 8 + 7)
      const color: RGBA = [r, g, b, alpha] as const
      if(alpha != 0){
        yield {offset, color}
      }
    }
  }
}

/** Helper function for PaletteBitmap creation */
function writeTo(values: {value: number, count: number}[], value: number, dataView: DataView, bytePos: number): void {
  var index = values.findIndex((data)=>data.value == value)
  if(index == -1){
    values.push({value, count: 1})
    index = values.length-1
  }
  else{
    values[index].count++
  }
  dataView.setUint16(bytePos, index)
}

/**
 * Class represents a bitmap ... 
 */
export class PaletteBitmap extends Bitmap{
  static readonly kind = "PaletteBitmap"
  /**  */
  colors: {value: RGBA, count: number, index: number}[]
  /**  */
  lengths: {value: number, count: number}[]
  data: DataView
  /**
   * Creates a PaletteBitmap from an image.
   * @param image - An image from the bitmap created.
   */
  constructor(image: ImageData){
    super(image, PaletteBitmap.kind)
    this.data = new DataView(new ArrayBuffer(this.length * 4))
    const colors = [{value: colorToNumber([0, 0, 0, 0]), count: 0}]
    const lengths = [{value: 1, count: 0}]
    var prevColor: number
    var length = 0
    var byteLength = 0
    for(let offset = 0; offset < this.length; offset++){
      const color = colorToNumber(getPixel(image, offset))
      length++
      if(prevColor != undefined && prevColor != color){
        writeTo(colors, prevColor, this.data, byteLength)
        byteLength += 2
        writeTo(lengths, length, this.data, byteLength)
        byteLength += 2
        length = 0
      }
      prevColor = color
    }
    writeTo(colors, prevColor, this.data, byteLength)
    byteLength += 2
    writeTo(lengths, length, this.data, byteLength)
    byteLength += 2
    this.data = new DataView(this.data.buffer.slice(0, byteLength))
    this.colors = colors.map(({value, count}, index)=>({value: numberToColor(value), count, index}))
    this.lengths = lengths
  }
  *[Symbol.iterator](){
    var offset = 0
    for(let i = 0; i < this.data.byteLength / 4; i++){
      const colorIndex = this.data.getUint16(i * 4 + 0)
      const color = this.colors[colorIndex].value
      const lengthIndex = this.data.getUint16(i * 4 + 2)
      const length = this.lengths[lengthIndex].value
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
  /**
   * Reduces the bitmap colors to `n` color.
   * Uses the median cut algorithm.
   * @param n - Number of the reduced colors.
   */
  reduceColors(n: number){
    const colorMap = [...Array(this.colors.length)]
    const colors = [...this.colors]
    if(colors[0].count > 0){
      colorMap[0] = colors.shift()
      n -= 1
    }
    const buckets = medianCut(colors, n) as typeof colors[]
    for(const bucket of buckets){
      var avg = [0, 0, 0, 0]
      for(const {value: color} of bucket){
        avg = avg.map((value, i)=>value+color[i])
      }
      avg = avg.map(value=>Math.round(value/bucket.length))
      for(const {index} of bucket){
        colorMap[index] = avg
      }
    }
    const data = new DataView(new ArrayBuffer(this.data.byteLength))
    const newColors = []
    const newLengths = [{value: 1, count: 0}]
    var prevColor: number
    var lengthSum = 0
    var byteLength = 0
    const dataLength = this.data.byteLength / 4
    for(let offset = 0; offset < dataLength; offset++){
      const colorIndex = this.data.getUint16(offset * 4 + 0)
      const color = colorToNumber(colorMap[colorIndex])
      const lengthIndex = this.data.getUint16(offset * 4 + 2)
      const length = this.lengths[lengthIndex].value
      if(prevColor != undefined && prevColor != color){
        writeTo(newColors, prevColor, data, byteLength)
        byteLength += 2
        writeTo(newLengths, lengthSum, data, byteLength)
        byteLength += 2
        lengthSum = length
      }
      else{
        lengthSum += length
      }
      prevColor = color
    }
    writeTo(newColors, prevColor, data, byteLength)
    byteLength += 2
    writeTo(newLengths, lengthSum, data, byteLength)
    byteLength += 2
    this.data = new DataView(data.buffer.slice(0, byteLength))
    this.colors = newColors.map(({value, count}, index)=>({value: numberToColor(value), count, index}))
    this.lengths = newLengths
  }
}

/** Class represents a PaletteBitmap compressed with huffman coding. */
export class CompressedBitmap extends Bitmap {
  static readonly kind = "CompressedBitmap"
  data: Uint8Array
  lastByteLength: number
  literalTree: Tree<RGBA>
  lengthTree: Tree<number>
  /**
   * Creates a CompressedBitmap from an image.
   * @param image - An image from the bitmap created.
   */
  constructor(image: ImageData){
    super(image, CompressedBitmap.kind)
    const bitmap = new PaletteBitmap(image)
    bitmap.reduceColors(16) //!!!
    const lengths = bitmap.lengths.map(({value, count}, index)=>({value, count, index}))
    const {data, lastByteLength, literalTree, lengthTree} = compress({data: bitmap.data, literals: bitmap.colors, lengths})
    this.data = data
    this.lastByteLength = lastByteLength
    this.literalTree = literalTree
    this.lengthTree = lengthTree
  }
  *[Symbol.iterator](){
    var prev: RGBA
    var repeat = false
    var offset = 0
    for(const value of readBitStream(this.data, this.lastByteLength, this.literalTree, this.lengthTree)){
      if(value != repeatSymbol){
        if(!repeat){
          prev = value as RGBA
        }
        const number = repeat ? value as number : 1
        if(prev[3] != 0){
          for(let i = 0; i < number; i++){
            yield {offset, color: prev} 
            offset++
          }
        }
        else{
          offset += number
        }
        repeat = false
      }
      else{
        repeat = true
      }
    }
  }
}

/** Object for mapping bitmap names (kinds) to bitmap class. */
const bitmapKinds: {
  [AlphaBitmap.kind]: typeof AlphaBitmap
  [ColorBitmap.kind]: typeof ColorBitmap
  [PaletteBitmap.kind]: typeof PaletteBitmap
  [CompressedBitmap.kind]: typeof CompressedBitmap
} 
= {
  "AlphaBitmap": AlphaBitmap,
  "ColorBitmap": ColorBitmap,
  "PaletteBitmap": PaletteBitmap,
  "CompressedBitmap": CompressedBitmap
}

/**
 * Creates a Bitmap subclass instance form a structurally cloned bitmap.
 * @param bitmapObject - A Structurally cloned bitmap.
 * @returns Bitmap subclass instance.
 */
export function createBitmapFormClone(bitmapObject: {kind: BitmapKind}): Bitmap {
  Object.setPrototypeOf(bitmapObject, bitmapKinds[bitmapObject.kind].prototype)
  return bitmapObject as Bitmap
}

const MASK_LIGHT = 0.75
const MASK_COLOR = `rgb(${255*MASK_LIGHT}, ${255*MASK_LIGHT}, ${255*MASK_LIGHT})`
export async function getBitmaps(
  /*alphabet: string[],
  height: number,
  fontWeight: number,
  fontFamily: string[],
  alignBaseline: boolean,
  padding: any*/
  alphabet: TextSources,
  height: number,
  fontWeight: number
  ){
  //const images = await getAlphabet(alphabet, height, fontWeight, fontFamily, alignBaseline, padding, MASK_COLOR)
  const images = await getTextImages(alphabet, height, fontWeight, MASK_COLOR)
  return images.map(image=>new CompressedBitmap(image))
}

//export function getBitmapsFromSVG(svgs, height, padding)

/**
 * Draws bitmap into an image on the specified location and with a color if provided.
 * @param image - Image to draw into.
 * @param cellOffset - Location for the bitmap.
 * @param bitmap - Bitmap to draw.
 * @param bitmapColor - The bitmap color.
 */
export function drawBitmapTo(image: ImageData, cellOffset: number, bitmap: Bitmap, bitmapColor?: RGB): void{
  for(var {offset, color} of bitmap){
    const pixelOffset = cellOffset + offset
    const alpha = color[3]
    if(alpha != 0 && alpha != 255){
      const imageColor = getPixel(image, pixelOffset)
      if(bitmapColor != undefined){
        color = [...bitmapColor, alpha] as const
      }
      const newColor = alphaBlendTo(color, imageColor)
      setPixel(image, pixelOffset, newColor)
    }
    else if(alpha == 255){
      if(bitmapColor != undefined){
        color = [...bitmapColor, alpha] as const
      }
      setPixel(image, pixelOffset, color)
    }
  }
}

/**
 * Returns an array of pixel colors from an image where a bitmap covers the image (non-transparent).
 * @param image - An image from mask the colors.
 * @param cellOffset - Location for the bitmap. 
 * @param bitmap - A bitmap.
 * @returns An array of colors.
 */
export function maskColorsFrom(image: ImageData, cellOffset: number, bitmap: Bitmap){
  const colors: RGB[] = []
  for(const {offset} of bitmap){
    const pixelOffset = cellOffset + offset
    const pixel = getPixel(image, pixelOffset)
    const imageColor: RGB = [pixel[0], pixel[1], pixel[2]]
    colors.push(imageColor)
  }
  return colors
}
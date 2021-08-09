import { CloneObject, colorToNumber, numberToColor } from "./util.js"

const COLOR_VALUE_MAX = 255
export type RGB = readonly [red: number, green: number, blue: number]
export type RGBA = readonly [red: number, green: number, blue: number, alpha: number]

/**
 * {@link https://www.w3.org/TR/css-color-4/#color-conversion-code}
 */
/**
 * Converts a gamma corrected sRGB value to linear light form.
 * @param val - Linear-light value in range [0 - 1].
 * @returns A gamma corrected value in range [0 - 1].
 */
export function gam_sRGB(val: number){
  if (val > 0.0031308){
    return 1.055 * Math.pow(val, 1/2.4) - 0.055
  }

  return 12.92 * val
}
/**
 * Converts a linear-light sRGB value to gamma corrected form.
 * @param val - Gamma corrected value in range [0 - 1].
 * @returns A linear-light value in range [0 - 1].
 */
export function lin_sRGB(val: number){
  if (val < 0.04045){
    return val / 12.92
  }
  return Math.pow((val + 0.055) / 1.055, 2.4)
}

const lin_sRGBLookup = [...Array(COLOR_VALUE_MAX + 1)]
  .map((_,index)=>lin_sRGB(index / COLOR_VALUE_MAX) * COLOR_VALUE_MAX)

const gam_sRGBLookup = [...Array(COLOR_VALUE_MAX + 1)
  ].map((_,index)=>gam_sRGB(index / COLOR_VALUE_MAX) * COLOR_VALUE_MAX)

/**
 * Converts a gamma corrected sRGB color to linear-light sRGB color.
 * @param color - sRGB color in gamma corrected form.
 * @returns sRGB color in linear-light form.
 */
export function linearizeColor<T extends RGB | RGBA>(color: T): T {
  if(color.length == 3){
    return [
      lin_sRGBLookup[color[0]],
      lin_sRGBLookup[color[1]],
      lin_sRGBLookup[color[2]]
    ] as unknown as T
  }
  else{
    return [
      lin_sRGBLookup[color[0]],
      lin_sRGBLookup[color[1]],
      lin_sRGBLookup[color[2]],
      color[3]
    ] as unknown as T
  }
}

/**
 * Converts a linear-light sRGB color to gamma corrected sRGB color.
 * @param color - sRGB color in linear-light form.
 * @returns sRGB color in gamma corrected form.
 */
export function nonlinearizeColor<T extends RGB | RGBA>(color: T): T {
  if(color.length == 3){
    return [
      gam_sRGBLookup[Math.round(color[0])],
      gam_sRGBLookup[Math.round(color[1])],
      gam_sRGBLookup[Math.round(color[2])]
    ] as unknown as T
  }
  else{
    return [
      gam_sRGBLookup[Math.round(color[0])],
      gam_sRGBLookup[Math.round(color[1])],
      gam_sRGBLookup[Math.round(color[2])],
      color[3]
    ] as unknown as T
  }
}

/**
 * Converts a gamma corrected sRGB image to linear-light sRGB image.
 * @param image - Gamma corrected sRGB image.
 * @returns Linear-light sRGB image.
 */
export function linearizeImage(image: ImageData){
  const buffer = new Uint8ClampedArray(image.data.length)
  for(let i = 0; i < image.data.byteLength; i = i + 4){
    buffer[i + 0] = lin_sRGBLookup[image.data[i + 0]]
    buffer[i + 1] = lin_sRGBLookup[image.data[i + 1]]
    buffer[i + 2] = lin_sRGBLookup[image.data[i + 2]]
    buffer[i + 3] = image.data[i + 3]
  }
  return new ImageData(buffer, image.width)
}

/**
 * Blends a color to an other background color.
 * @param color - sRGB color in linear-light form.
 * @param background - sRGB color in linear-light form.
 * @returns sRGB color in linear-light form.
 */
export function blendTo(color: RGB | RGBA, background: RGB): RGBA {
  const alpha = color[3] / 255
  return [
    color[0] * alpha + background[0] * (1 - alpha),
    color[1] * alpha + background[1] * (1 - alpha),
    color[2] * alpha + background[2] * (1 - alpha),
    255
  ] as const
}

/**
 * {@link https://en.wikipedia.org/wiki/Alpha_compositing}
 */
/**
 * Alpha blends a color to an other background color.
 * @param color - sRGB color in linear-light form.
 * @param background - sRGB color in linear-light form.
 * @returns sRGB color in linear-light form.
 */
export function alphaBlendTo(color: RGBA, background: RGBA): RGBA {
  const alpha = color[3]
  const bgAlpha = background[3]
  const ratio = alpha/255
  const bgRatio = bgAlpha/255*(1-ratio)
  const newAlpha = ratio + bgRatio
  return [
    (color[0]*ratio + background[0]*bgRatio)/newAlpha,
    (color[1]*ratio + background[1]*bgRatio)/newAlpha,
    (color[2]*ratio + background[2]*bgRatio)/newAlpha,
    newAlpha*255
  ] as const
}

/**
 * {@link https://en.wikipedia.org/wiki/Color_difference}
 */
/**
 * Calculates the distence between two linear-light sRGB color 
 * by approximating a perceptually-uniform color space.
 * @param color1 - sRGB color in linear-light form.
 * @param color2 - sRGB color in linear-light form.
 * @returns The distance between the two color.
 */
export function colorDistance(color1: RGB | RGBA, color2: RGB | RGBA){
  const dr = color1[0] - color2[0]
  const dg = color1[1] - color2[1]
  const db = color1[2] - color2[2]
  if(dr<128){
    return Math.sqrt(2*dr*dr + 4*dg*dg + 3*db*db)
  }
  else{
    return Math.sqrt(3*dr*dr + 4*dg*dg + 2*db*db)
  }
}

type Counted<T> = {
  value: T, 
  count: number
}
type Vector<T, Dim extends number> = readonly T[] & {readonly length: Dim}
/**
 * Groups objects to `n` arrays
 * by minimizing the `object.value` vectors distance between each dimension in a group
 * (see median-cut algorithm).
 * The objects are weighted by `object.count` when calculating the median.
 * @param objects - Array of objects with `object.value` vectors (same dimension) and `object.count` weights.
 * @param n - The group size.
 * @returns Array of `n` groups of objects.
 */
export function medianCut<Dim extends number>(objects: Counted<Vector<number, Dim>>[], n: number){
  if(objects.length == 0){
    return []
  }
  objects = [...objects]
  const dimensions = [...Array(objects[0].value.length)].map((_,i)=>i)
  type Range = {min: number, max: number}
  function getRanges(objects: Counted<Vector<number, Dim>>[]): Range[] {
    const ranges = dimensions.map(()=>({min: Infinity, max: -Infinity}))
    for(const {value} of objects){
      for(const dim of dimensions){
        ranges[dim].min = Math.min(ranges[dim].min, value[dim])
        ranges[dim].max = Math.max(ranges[dim].max, value[dim])
      }
    }
    return ranges
  }
  type Bucket = {objects: Counted<Vector<number, Dim>>[], ranges: Range[]}
  const buckets: Bucket[] = [{objects, ranges: getRanges(objects)}]
  while(buckets.length<n && buckets.some(({objects})=>objects.length>1)){
    var widestRange = 0
    var widestBucket: Bucket
    var widestDim: number
    for(const bucket of buckets){
      for(const dim of dimensions){
        const {min, max} = bucket.ranges[dim]
        const range = max - min
        if(widestRange < range){
          widestRange = range
          widestBucket = bucket
          widestDim = dim
        }
      }
    }
    widestBucket.objects.sort(({value: a}, {value: b})=>b[widestDim]-a[widestDim])
    const length = widestBucket.objects.reduce((sum, {count})=>sum+count, 0)
    var sum = 0
    var median = 0
    while(sum < length/2){
      sum += widestBucket.objects[median].count
      median++
    }
    if(sum > length/2){
      const sum2 = sum - widestBucket.objects[median-1].count
      if(Math.abs(sum2 - length/2) < Math.abs(sum - length/2)){
        median -= 1
      }
    }
    const lowerObjects = widestBucket.objects.splice(median)
    const lower = {objects: lowerObjects, ranges: getRanges(lowerObjects)}
    widestBucket.ranges = getRanges(widestBucket.objects)
    buckets.push(lower)
  }
  return buckets.map(({objects})=>objects)
}

/**
 * Returns one pixel of an image.
 * @param image - Source image.
 * @param offset - Location of the pixel.
 * @returns Color of the pixel.
 */

/**
 * Sets one pixel of an image.
 * @param image - Image to change.
 * @param offset - Location of the pixel to set.
 * @param color - Color of the pixel to set.
 */

export class ImageDiff implements CloneObject {
  static readonly kind = "ImageDiff"
  readonly kind: "ImageDiff"
  data: Float32Array
  width: number
  height: number
  length: number
  constructor(buffer: ArrayBuffer, width: number)
  constructor(width: number, height: number)
  constructor(image: Image, backgroundColor: RGB)
  constructor(...args: [number, number] | [ArrayBuffer, number] | [Image, RGB]){
    if(typeof args[0] == "number"){
      const [width, height] = args as [number, number]
      this.data = new Float32Array(width * height)
      this.width = width
      this.height = height
      
    }
    else if(args[0] instanceof ArrayBuffer){
      const [buffer, width] = args as [ArrayBuffer, number]
      this.data = new Float32Array(buffer)
      this.width = width
      this.height = buffer.byteLength / 4 / width
    }
    else{
      const [image, backgroundColor] = args as [Image, RGB]
      const length = image.width * image.height
      this.data = new Float32Array(length)
      this.width = image.width
      this.height = image.height
      for(let offset = 0; offset < length; offset++){
        const originalColor = image.getPixel(offset)
        this[offset] = colorDistance(originalColor, backgroundColor)
      }
    }
    this.length = this.width * this.height
    this.kind = ImageDiff.kind
  }
  getDiff(offset: number): number {
    return this.data[offset]
  }
  setDiff(offset: number, diff: number): void {
    this.data[offset] = diff
  }
}

type ImageKind = keyof typeof imageKinds

/**
 * Returns one element of a buffer.
 * @param buffer - Source buffer.
 * @param offset - Location of the element.
 * @returns Value of the buffer.
 */

/**
 * Sets one element of a buffer.
 * @param buffer - Buffer to change.
 * @param offset - Location of the element to set.
 * @param value - Value of the element to set.
 */

export interface Image extends CloneObject {
  readonly kind: ImageKind
  width: number
  height: number
  length: number
  getPixel(offset: number): RGBA
  setPixel?(offset: number, color: RGBA): void
}

export class RGBAImage implements Image {
  static readonly kind = "RGBAImage"
  readonly kind: typeof RGBAImage.kind
  imageData: ImageData
  width: number
  height: number
  length: number
  constructor(width: number, height: number)
  constructor(data: Uint8ClampedArray, sw: number)
  constructor(image: ImageData)
  constructor(...args: [number, number] | [Uint8ClampedArray, number] | [ImageData]){
    if(typeof args[0] == "number"){
      const [width, height] = args
      this.imageData = new ImageData(width, height)
    }
    else if(args[0] instanceof Uint8ClampedArray){
      const [data, sw] = args
      this.imageData = new ImageData(data, sw)
    }
    else{
      const [image] = args
      this.imageData = new ImageData(image.data, image.width)
    }
    this.width = this.imageData.width
    this.height = this.imageData.height
    this.length = this.width * this.height
    this.kind = RGBAImage.kind
  }
  getPixel(offset: number): RGBA {
    offset = offset * 4
    const red = this.imageData.data[offset + 0]
    const green = this.imageData.data[offset + 1]
    const blue = this.imageData.data[offset + 2]
    const alpha = this.imageData.data[offset + 3]
    return [red, green, blue, alpha]
  }
  setPixel(offset: number, color: RGBA): void {
    offset = offset * 4
    this.imageData.data[offset + 0] = color[0]
    this.imageData.data[offset + 1] = color[1]
    this.imageData.data[offset + 2] = color[2]
    this.imageData.data[offset + 3] = color[3]
  }
  static get [Symbol.species](){
    return ImageData
  }
}

function countColors(image: Image): Counted<RGBA>[]{
  const colorNumbers: Counted<number>[] = []
  for(let offset = 0; offset < image.length; offset++){
    const colorNumber = colorToNumber(image.getPixel(offset))
    const index = colorNumbers.findIndex(({value})=>value == colorNumber)
    if(index == -1){
      colorNumbers.push({value: colorNumber, count: 1})
    }
    else{
      colorNumbers[index].count++
    }
  }
  return colorNumbers.map(({value, count})=>({value: numberToColor(value), count}))
}

function avgColor(colors: RGBA[]): RGBA {
  var avg = [0, 0, 0, 0]
  for(const color of colors){
    avg = avg.map((value, i)=>value+color[i])
  }
  avg = avg.map(value=>Math.round(value/colors.length))
  return avg as unknown as RGBA
}

function nearestColorIndex(color: RGBA, palette: RGBA[]): number {
  let distance = Infinity
  let nearestIndex = 0
  for(let index = 0; index < palette.length; index++){
    const dist = colorDistance(color, palette[index])
    if(dist < distance){
      distance = dist
      nearestIndex = index
    }
  }
  return nearestIndex
}

function addColor(color1: RGBA, color2: RGBA): RGBA {
  return [
    color1[0] + color2[0],
    color1[1] + color2[1],
    color1[2] + color2[2],
    color1[3] + color2[3]
  ] as const
}

export class PaletteImage implements Image {
  static readonly kind = "PaletteImage"
  readonly kind = PaletteImage.kind
  width: number
  height: number
  length: number
  palette: RGBA[]
  data: Uint8Array
  constructor(image: RGBAImage, paletteSize: number = 256){
    this.width = image.width
    this.height = image.height
    this.length = image.length
    this.data = new Uint8Array(this.length)
    const colors: Counted<RGBA>[] = countColors(image)
    const buckets = medianCut(colors, paletteSize) as unknown as Counted<RGBA>[][]
    this.palette = buckets.map(bucket=>avgColor(bucket.map(({value})=>value)))
    for(let offset = 0; offset < image.length; offset++){
      const color = image.getPixel(offset)
      const index = nearestColorIndex(color, this.palette)
      this.data[offset] = index
      const diff = color.map((v, i)=>this.palette[index][i] - v) //!!
      const offsets = []
      const x = offset % image.width
      const y = Math.floor(offset / image.width)
      if(x != image.width-1){
        offsets.push({offset: offset + 1, factor: 7/16})
      }
      if(y != image.height-1){
        if(x != 0){
          offsets.push({offset: offset + image.width - 1, factor: 3/16})
        }
        offsets.push({offset: offset + image.width + 0, factor: 5/16})
        if(x != image.width-1){
          offsets.push({offset: offset + image.width + 1, factor: 1/16})
        }
      }
      for(let {offset, factor} of offsets){
        const color = image.getPixel(offset)
        const error = diff.map(v=>v*factor) as unknown as RGBA
        image.setPixel(offset, addColor(color, error))
      }
    }
  }
  getPixel(offset: number): RGBA {
    const index = this.data[offset]
    return this.palette[index]
  }
}

export const imageKinds: {
  [ImageDiff.kind]: typeof ImageDiff
  [RGBAImage.kind]: typeof RGBAImage
  [PaletteImage.kind]: typeof PaletteImage
} = {
  ImageDiff,
  RGBAImage,
  PaletteImage
}
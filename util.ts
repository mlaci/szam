import type { Rect } from "./types.js"
import type { RGB, RGBA } from "./image.js"
import { colorDistance } from "./image.js"

/**
 * Resizes a rectangle to fit into a container rectangle by maintaining the rectangle original aspect ratio.
 * Similarly as CSS object-fit: contain works.
 * @param rect - The rectangle to resize.
 * @param container - The container rectangle to the rectangle fit into.
 * @returns The new scaled rectangle.
 */
export function fit(rect: Rect, container: Rect): Rect {
  const ratio = Math.min(container.width / rect.width, container.height / rect.height)
  return {width: rect.width * ratio, height: rect.height * ratio}
}

interface Range {
  start: number,
  length: number
}
/**
 * Slices a `range` to `n` evenly sliced ranges.
 * The first n-1 range lengths are rounded up.
 * @param range - The range to slice.
 * @param n - Number of slices.
 * @returns The sliced ranges.
 */
export function sliceEvenly(range: Range, n: number): Range[] {
  const ranges: Range[] = []
  let {start, length} = range
  const test = length / n
  if(test === 0 || Number.isNaN(test) || !Number.isFinite(test)){
    length = 0
  }
  while(length > 0 && n >= 1){
    let len = n > 1 ? Math.ceil(length / n) : length
    ranges.push({start, length: len})
    length -= len
    start += len
    n--
    if(length < 1 && length > 0){
      n = 1
    }
  }
  return ranges
}

/**
 * Returns a value of an easing curve in the `n` point.
 * If the `factor` is less then 1 the curve easing out, if greater easing in.
 * @param n - A number in the [0 - 1] range.
 * @param factor - Number greater then or equal to 0.
 * @returns A number in the [0 - 1] range.
 */
export function ease(n: number, factor = 1){
  return n==0 ? 0 : n**factor
}
/**
 * Returns a value of an ease in/out curve in the `n` point.
 * The curve has an inflection at 0.5.
 * If the `factor` is less then 1 the curve first easing out then easing in,
 * if greater first easing in then out.
 * @param n - A number in the [0 - 1] range.
 * @param factor - Number greater then or equal to 0.
 * @returns A number in the [0 - 1] range.
 */
export function easeInOut(n: number, factor: number){
  return n<0.5 ? ease(n*2, factor)/2 : 1-ease(2-n*2, factor)/2
}

export type Canvas = HTMLCanvasElement & {context: CanvasRenderingContext2D}
/**
 * Creates a canvas with `width` and `height` dimensions.
 * @param width - The canvas width.
 * @param height - The canvas heigth.
 * @returns A canvas with 2d context.
 */
export function createCanvas(width = 0, height = 0): Canvas {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  return Object.assign(canvas, {context})
}

/**
 * Creates a canvas from a image with the image dimensions,
 * then puts the image data to the canvas.
 * @param image - Image to put on the canvas.
 * @returns A canvas with 2d context.
 */
export function createCanvasFrom(image: ImageData): Canvas {
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext("2d")
  context.putImageData(image, 0, 0)
  return Object.assign(canvas, {context})
}

/**
 * Returns one pixel of an image.
 * @param image - Source image.
 * @param offset - Location of the pixel.
 * @returns Color of the pixel.
 */
export function getPixel(image: ImageData, offset: number): RGBA {
  offset = offset * 4
  const r = image.data[offset + 0]
  const g = image.data[offset + 1]
  const b = image.data[offset + 2]
  const alpha = image.data[offset + 3]
  return [r, g, b, alpha]
}

/**
 * Sets one pixel of an image.
 * @param image - Image to change.
 * @param offset - Location of the pixel to set.
 * @param color - Color of the pixel to set.
 */
export function setPixel(image: ImageData, offset: number, color: RGBA): void {
  offset = offset * 4
  image.data[offset + 0] = color[0]
  image.data[offset + 1] = color[1]
  image.data[offset + 2] = color[2]
  image.data[offset + 3] = color[3]
}

export class ImageDiff extends Float32Array {
  width: number
  height: number
  constructor(buffer: ArrayBuffer, width: number)
  constructor(width: number, height: number)
  constructor(image: ImageData, backgroundColor: RGB)
  constructor(...args: [number, number] | [ArrayBuffer, number] | [ImageData, RGB]){
    if(typeof args[0] == "number"){
      const [width, height] = args as [number, number]
      super(width * height)
      this.width = width
      this.height = height
    }
    else if(args[0] instanceof ArrayBuffer){
      const [buffer, width] = args as [ArrayBuffer, number]
      super(buffer)
      this.width = width
      this.height = buffer.byteLength / 4 / width
    }
    else{
      const [image, backgroundColor] = args as [ImageData, RGB]
      const length = image.width * image.height
      super(length)
      this.width = image.width
      this.height = image.height
      for(let offset = 0; offset < length; offset++){
        const originalColor = getPixel(image, offset)
        setImageDiffValue(this, offset, colorDistance(originalColor, backgroundColor))
      }
    }
  }
  static get [Symbol.species](){
    return Float32Array
  }
}

/**
 * Returns one element of a buffer.
 * @param buffer - Source buffer.
 * @param offset - Location of the element.
 * @returns Value of the buffer.
 */
export function getImageDiffValue(buffer: ImageDiff, offset: number){
  return buffer[offset]
}

/**
 * Sets one element of a buffer.
 * @param buffer - Buffer to change.
 * @param offset - Location of the element to set.
 * @param value - Value of the element to set.
 */
export function setImageDiffValue(buffer: ImageDiff, offset: number, value: number): void {
  buffer[offset] = value
}

/**
 * Creates a sequence between two number by doubling or halving (log2) the next number in the sequence.
 * The difference between the first and last numbers sequence smoothed into each other by an ease in/out curve.
 * @param from - Number from the sequence starts.
 * @param to - Number where the sequence ends.
 * @yields The numbers in the sequence.
 */
export function* log2Sequence(from: number, to: number){
  const maxIteration = Math.floor(Math.log2(from/to))
  for(let i = 0; i<=maxIteration; i++){
    const ratio = easeInOut(i/maxIteration, 20)
    yield Math.floor((1-ratio)*from/(2**i) + ratio*to*(2**(maxIteration-i)))
  }
}

/**
 * Shuffles an array.
 * @param array - The array to shuffle.
 * @yields Elements of the array in random order.
 */
export function* shuffle(array: any[]){
  array = [...array]
  while(array.length != 0){
    yield array.splice(Math.floor(array.length*Math.random()), 1)[0]
  }
}

/**
 * {@link https://www.w3.org/TR/compositing-1/#compositemode}
 */
type CompositeMode = "clear" | "copy" | "source-over" | "destination-over" | "source-in" |    
"destination-in" | "source-out" | "destination-out" | "source-atop" |    
"destination-atop" | "xor" | "lighter"
/**
 * Composes a source and a destination canvas contents with the specified composition mode.
 * The composed image is drawn into the destination canvas.
 * @param dest - The canvas where the composed image is drawn.
 * @param source - The canvas with the source content.
 * @param mode - Composition mode.
 */
export function compose(dest: Canvas, source: Canvas, mode: CompositeMode = "source-over"){
  const destContext = dest.getContext("2d")
  const originalOperation = destContext.globalCompositeOperation
  destContext.globalCompositeOperation = mode
  destContext.drawImage(source, 0, 0)
  destContext.globalCompositeOperation = originalOperation
}

/**
 * Converts and resizes a blob to an image which fits into a specified container rectangle.
 * @param blob - An image stored in a blob.
 * @param container - The container rectangle for the resize.
 * @returns The image data.
 */
export async function blobToImageData(blob: Blob, container: Rect): Promise<ImageData>{
  const img = document.createElement("img")
  img.decoding = "async"
  img.src = URL.createObjectURL(blob)
  await new Promise(resolve=>img.addEventListener("load", resolve))
  const {width, height} = fit(img, container)
  const canvas = createCanvas(width, height)
  canvas.context.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)
  return canvas.context.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Converts four 8-bit number (a color) to one 32-bit number.
 * @param color - Array of 4 number in range [0 - 255].
 * @returns A number.
 */
export function colorToNumber(color: RGBA): number {
  return (color[0] << 24) | (color[1] << 16) | (color[2] << 8) | color[3]
}

/**
 * Converts a 32-bit number back to array of four 8-bit number (a color).
 * @param colorNumber - A 32-bit number in range [-2^31 - 2^31-1].
 * @returns A color.
 */
export function numberToColor(colorNumber: number): RGBA {
  return [
    (colorNumber & 0xFF_00_00_00) >>> 24,
    (colorNumber & 0x00_FF_00_00) >>> 16,
    (colorNumber & 0x00_00_FF_00) >>> 8,
    (colorNumber & 0x00_00_00_FF) >>> 0
  ]
}

/**
 * Detects an image content horizontal bounds.
 * @param image - An image to process.
 * @returns Left and right bound.
 */
export function horizontalBounds(image: ImageData){
  const last = image.width*image.height-1
  let left: number
  let offset = 0
  while(left == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      left = offset % image.width - 1
    }
    offset = offset + image.width
    if(offset > last){
      offset = (offset + 1) % image.width
      if(offset == 0){
        break
      }
    }
  }
  let right: number
  offset = last
  while(right == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      right = offset % image.width + 1
    }
    offset = offset - image.width
    if(offset < 0){
      offset = offset + last
      if(offset == last - image.width){
        break
      }
    }
  }
  return {left, right}
}

/**
 * Detects an image content vertical bounds.
 * @param image - An image to process.
 * @returns Top and bottom bound.
 */
export function verticalBounds(image: ImageData){
  const last = image.width*image.height-1
  let top: number
  let offset = 0
  while(top == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      top = Math.floor(offset / image.width)
    }
    offset++
    if(offset > last){
      break
    }
  }
  let bottom: number
  offset = last
  while(bottom == undefined){
    const alpha = getPixel(image, offset)[3]
    if(alpha != 0){
      bottom = Math.ceil(offset / image.width)
    }
    offset--
    if(offset < 0){
      break
    }
  }
  return {top, bottom}
}
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
export function linearizeColor(color: RGBA): RGBA {
  return [
    lin_sRGBLookup[color[0]],
    lin_sRGBLookup[color[1]],
    lin_sRGBLookup[color[2]],
    color[3]
  ] as const
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

type Vector<T, Dim> = readonly T[] & {readonly length: Dim}
type VectorObject<Dim extends number> = {value: Vector<number, Dim>, count: number}
/**
 * Groups objects to `n` arrays
 * by minimizing the `object.value` vectors distance between each dimension in a group
 * (see median-cut algorithm).
 * The objects are weighted by `object.count` when calculating the median.
 * @param objects - Array of objects with `object.value` vectors (same dimension) and `object.count` weights.
 * @param n - The group size.
 * @returns Array of `n` groups of objects.
 */
export function medianCut<Dim extends number>(objects: VectorObject<Dim>[], n: number){
  if(objects.length == 0){
    return []
  }
  objects = [...objects]
  const dimensions = [...Array(objects[0].value.length)].map((_,i)=>i)
  type Range = {min: number, max: number}
  function getRanges(objects: VectorObject<Dim>[]): Range[] {
    const ranges = dimensions.map(()=>({min: Infinity, max: -Infinity}))
    for(const {value} of objects){
      for(const dim of dimensions){
        ranges[dim].min = Math.min(ranges[dim].min, value[dim])
        ranges[dim].max = Math.max(ranges[dim].max, value[dim])
      }
    }
    return ranges
  }
  type Bucket = {objects: VectorObject<Dim>[], ranges: Range[]}
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
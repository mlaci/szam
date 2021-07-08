import { getPixel, setPixel } from "./util.js" 
//https://www.w3.org/TR/css-color-4/#color-conversion-code
export function gam_sRGB(val){
  if (val > 0.0031308){
    return 1.055 * Math.pow(val, 1/2.4) - 0.055
  }

  return 12.92 * val
}
export function lin_sRGB(val){
  if (val < 0.04045){
    return val / 12.92
  }
  return Math.pow((val + 0.055) / 1.055, 2.4)
}
const lin_sRGBLookup = [...Array(256)].map((_,i)=>lin_sRGB(i/255)*255)
const gam_sRGBLookup = [...Array(256)].map((_,i)=>gam_sRGB(i/255)*255)

export function linearColor(color){
  return [
    lin_sRGBLookup[color[0]],
    lin_sRGBLookup[color[1]],
    lin_sRGBLookup[color[2]],
    color[3]
  ]
}

export function linearImage(image){
  const buffer = new Uint8ClampedArray(image.data.length)
  for(let i = 0; i < image.data.length; i = i + 4){
    buffer[i + 0] = lin_sRGBLookup[image.data[i + 0]]
    buffer[i + 1] = lin_sRGBLookup[image.data[i + 1]]
    buffer[i + 2] = lin_sRGBLookup[image.data[i + 2]]
    buffer[i + 3] = image.data[i + 3]
  }
  return new ImageData(buffer, image.width)
}

export function blendTo(color, background){
  const alpha = color[3] / 255
  return [
    color[0] * alpha + background[0] * (1 - alpha),
    color[1] * alpha + background[1] * (1 - alpha),
    color[2] * alpha + background[2] * (1 - alpha),
    255
  ]
}

//https://en.wikipedia.org/wiki/Alpha_compositing
export function alphaBlendTo(color, background){
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
  ]
}

//Math.hypot
//https://www.w3.org/TR/css-color-4/#rgb-to-lab
export function colorDistance(color1, color2){
  const dr = color1[0] - color2[0]
  const dg = color1[1] - color2[1]
  const db = color1[2] - color2[2]
  return Math.sqrt(dr*dr + dg*dg + db*db)
  /*if(dr<128){
    return Math.sqrt(2*dr*dr + 4*dg*dg + 3*db*db)
  }
  else{
    return Math.sqrt(3*dr*dr + 4*dg*dg + 2*db*db)
  }*/
}

function medianCut(values, n){
  const dimensions = [...Array(values[0].value.length)].map((_,i)=>i)
  function getRanges(values){
    const ranges = dimensions.map(()=>({min: Infinity, max: -Infinity}))
    for(const {value} of values){
      for(const dim of dimensions){
        ranges[dim].min = Math.min(ranges[dim].min, value[dim])
        ranges[dim].max = Math.max(ranges[dim].max, value[dim])
      }
    }
    return ranges
  }
  const buckets = [{values, ranges: getRanges(values)}]
  while(buckets.length<n && buckets.some(({values})=>values.length>1)){
    var widestRange = 0
    var widestBucket
    var widestDim
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
    widestBucket.values.sort(({value: a}, {value: b})=>b[widestDim]-a[widestDim])
    const length = widestBucket.values.reduce((sum, {number})=>sum+number, 0)
    var sum = 0
    var median = 0
    while(sum < length/2){
      sum += widestBucket.values[median].number
      median++
    }
    if(sum > length/2){
      const sum2 = sum - widestBucket.values[median-1].number
      if(Math.abs(sum2 - length/2) < Math.abs(sum - length/2)){
        median -= 1
      }
    }
    const lowerValues = widestBucket.values.splice(median)
    const lower = {values: lowerValues, ranges: getRanges(lowerValues)}
    widestBucket.ranges = getRanges(widestBucket.values)
    buckets.push(lower)
  }
  return buckets.map(({values})=>values.map(({value})=>value))
}

export function reduceColors(image, n){
  image = new ImageData(image.data.slice(0), image.width, image.height)
  const colors = new Map()
  for(let i = 0; i < image.width*image.height; i++){
    const color = getPixel(image, i)
    const key = color.toString()
    colors.set(key, (colors.get(key) || 0) + 1)
  }
  const values = [...colors.entries()].map(([key, number])=>({value: key.split(",").map(Number), number}))
  /*console.time("median cut")
  medianCut(values, n)
  console.timeEnd("median cut")*/
  const colorMap = new Map(medianCut(values, n).flatMap(colors=>{
    const avg = colors
      .reduce((sum, color)=>sum.map((value, i)=>value+color[i], [0, 0, 0, 0]))
      .map(value=>Math.round(value/colors.length))
    return colors.map(color=>[color.toString(), avg])
  }))
  for(let i = 0; i < image.width*image.height; i++){
    const color = getPixel(image, i)
    setPixel(image, i, colorMap.get(color.toString()))
  }
  return image
}
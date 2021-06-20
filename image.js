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
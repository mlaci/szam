export function fit(width, height, widthMax, heightMax){
  const ratio = Math.min(widthMax/width, heightMax/height)
  return {width: width*ratio, height: height*ratio}
}

export function ease(n, factor = 1){
  return n==0 ? 0 : n**factor
}
export function easeInOut(n, factor){
  return n<0.5 ? ease(n*2, factor)/2 : 1-ease(2-n*2, factor)/2
}
export function createCanvas(width = 0, height = 0){
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.context = canvas.getContext("2d")
  return canvas
}

export function createCanvasFrom(image){
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  canvas.context = canvas.getContext("2d")
  canvas.context.putImageData(image, 0, 0)
  return canvas
}

export function getPixel(image, offset,){
  offset = offset * 4
  const r = image.data[offset + 0]
  const g = image.data[offset + 1]
  const b = image.data[offset + 2]
  const alpha = image.data[offset + 3]
  return [r, g, b, alpha]
}

export function setPixel(image, offset, color){
  offset = offset * 4
  image.data[offset + 0] = color[0]
  image.data[offset + 1] = color[1]
  image.data[offset + 2] = color[2]
  image.data[offset + 3] = color[3]
}

export function getBufferValue(buffer, offset){
  const index = offset
  return buffer[offset]
}

export function setBufferValue(buffer, offset, value){
  buffer[offset] = value
}

export function* logScale(from, to){
  const maxIteration = Math.floor(Math.log2(from/to))
  for(let i = 0; i<=maxIteration; i++){
    const ratio = easeInOut(i/maxIteration, 20)
    yield Math.floor((1-ratio)*from/(2**i) + ratio*to*(2**(maxIteration-i)))
  }
}

export function* randomize(array){
  array = [...array]
  while(array.length != 0){
    yield array.splice(Math.floor(array.length*Math.random()), 1)[0]
  }
}

export function compose(dest, source, type = "source-over"){
  const destContext = dest.getContext("2d")
  const old = destContext.globalCompositeOperation
  destContext.globalCompositeOperation = type
  destContext.drawImage(source, 0, 0)
  destContext.globalCompositeOperation = old
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
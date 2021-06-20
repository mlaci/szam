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

export async function blobToImageData(blob, widthMax, heightMax){
  const img = document.createElement("img")
  img.decoding = "async"
  img.src = URL.createObjectURL(blob)
  await new Promise(resolve=>img.addEventListener("load", resolve))
  const {width, height} = fit(img.width, img.height, widthMax, heightMax)
  const canvas = createCanvas(width, height)
  canvas.context.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)
  return canvas.context.getImageData(0, 0, canvas.width, canvas.height)
}
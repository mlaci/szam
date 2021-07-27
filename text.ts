import type { Color, Texts, TextSources } from "./types.js"
import type { Box } from "./util.js"
import { createCanvas, verticalBounds, horizontalBounds } from "./util.js"

let xmlSerializer: XMLSerializer

function textImageFromCanvas(text: string, box: Box, left: number, baseline: number, font: FontProp, color: Color = "black"){
  const canvas = createCanvas(box.width, box.height)
  canvas.context.fillStyle = color
  canvas.context.textAlign = "left"
  canvas.context.textBaseline = "alphabetic"
  canvas.context.font = font.toString()
  canvas.context.fillText(text, left, baseline)
  return canvas.context.getImageData(0, 0, canvas.width, canvas.height)
}

async function textImageFromSvg(text: string, box: Box, left: number, baseline: number, font: FontProp, textLength: number, color: Color = "black"){
  const container = document.querySelector("#svg-creator")
  const svgString = `<svg width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" xmlns="http://www.w3.org/2000/svg">
    <text 
      x="${left}" y="${baseline}"
      fill="${color}"
      font-size="${font.size}px"
      font-weight="${font.weight}"
      font-family="${font.family.join(", ")}"
      alignment-baseline="alphabetic"
      text-anchor="start"
    >${text}</text>
  </svg>`
  container.innerHTML = svgString
  const svg = container.querySelector("svg")
  const svgText = svg.querySelector("text")
  const textWidth = svgText.getBBox().width * textLength
  svgText.setAttribute("textLength", textWidth.toString())
  const img = new Image(box.width, box.height)
  xmlSerializer ??= new XMLSerializer()
  img.src = `data:image/svg+xml;utf8,${xmlSerializer.serializeToString(svg)}`
  await img.decode()
  const canvas = createCanvas(box.width, box.height)
  canvas.width = box.width
  canvas.height = box.height
  canvas.context.drawImage(img, 0, 0, box.width, box.height)
  container.innerHTML = ""
  return canvas.context.getImageData(0, 0, canvas.width, canvas.height)
}

export class FontProp {
  constructor(public weight: number, public size: number, public family: string[]){
  }
  toString(){
    return `${this.weight} ${this.size}px ${this.family.join(", ")}`
  }
}

function nativeMeasureCanvasText(text: string, font: FontProp){
  const canvas = createCanvas()
  canvas.context.font = font.toString()
  const metric = canvas.context.measureText(text)
  const height = metric.actualBoundingBoxAscent != undefined && metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent
  return {width: metric.width, height, ascent: metric.actualBoundingBoxAscent}
}

function nativeMeasureSvgText(text: string, font: FontProp, textLength: number){
  const container = document.querySelector("#svg-creator")
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
    <text 
      x="0" y="0"
      font-size="${font.size}"
      font-weight="${font.weight}"
      font-family="${font.family.join(", ")}"
      alignment-baseline="alphabetic"
    >${text}</text>
  </svg>`
  const svg = container.querySelector("svg")
  const svgText = svg.querySelector("text")
  const textWidth = svgText.getBBox().width * textLength
  svgText.setAttribute("textLength", textWidth.toString())
  const {width, height, y: top} = svgText.getBBox()
  container.innerHTML = ""
  return {width, height, ascent: Math.abs(top)}
}

async function measureText(text: string, font: FontProp, textLength?: number){
  const metric = textLength != undefined
    ? nativeMeasureSvgText(text, font, textLength)
    : nativeMeasureCanvasText(text, font)
  const safetyPixels = 6
  const box = {
    width: metric.width + safetyPixels,
    height: (metric.height ?? font.size * 1.1 ) + safetyPixels //!!
  }
  const baseline = Math.ceil(metric.ascent ?? font.size * 0.82) //!!
  const image = textLength != undefined
    ? await textImageFromSvg(text, box, 0, baseline, font, textLength)
    : textImageFromCanvas(text, box, 0, baseline, font)
  const {top = baseline, bottom = baseline} = verticalBounds(image)
  const {left = 0, right = 0} = horizontalBounds(image)
  const ascent = baseline - top
  const descent = bottom - baseline
  const height = ascent + descent
  const width = right - left
  return {ascent, descent, height, left, right, width}
}

async function measureTexts(texts: string[], font: FontProp, textLength?: number){
  var maxAscent = 0
  var maxDescent = 0
  var maxHeight = 0
  var maxWidth = 0
  const metrics = []
  for(const text of texts){
    const {ascent, descent, height, left, right, width} = await measureText(text, font, textLength)
    maxAscent = Math.max(maxAscent, ascent)
    maxDescent = Math.max(maxDescent, descent)
    maxHeight = Math.max(maxHeight, height)
    maxWidth = Math.max(maxWidth, width)
    metrics.push({ascent, descent, height, left, right, width})
  }
  if(maxHeight == 0){
    maxHeight = font.size
    maxAscent = font.size
    maxDescent = 0
  }
  if(maxWidth == 0){
    maxWidth = font.size * 0.9 //!!
  }
  return {metrics, maxAscent, maxDescent, maxHeight, maxWidth}
}

export async function getTextImages(alphabet: TextSources, height: number, fontWeight: number, baseColor?: Color){
  const texts = []
  for(const letter of alphabet.texts){
    const text = letter.text.trim()
    texts.push(text)
    letter.text = text
  }
  const fontSize = height / (1 + alphabet.padding.y)
  const font = new FontProp(fontWeight, fontSize, alphabet.fontFamily)
  //TODO windows native emoji trigger
  await document.fonts.load(font.toString(), texts.join(""))
  const alignBaseline = "alignBaseline" in alphabet && alphabet.alignBaseline
  const textLength = "textLength" in alphabet ? alphabet.textLength : undefined
  const metric = await measureTexts(texts, font, textLength)
  const fontHeight = alignBaseline ? (metric.maxAscent + metric.maxDescent) : metric.maxHeight
  const scaledFont = new FontProp(fontWeight, fontSize * (fontSize / fontHeight), alphabet.fontFamily)
  const scaledMetric = await measureTexts(texts, scaledFont, textLength)
  const scaledFontHeight = alignBaseline ? (scaledMetric.maxAscent + scaledMetric.maxDescent) : scaledMetric.maxHeight
  const actualHeight = scaledFontHeight * (1 + alphabet.padding.y)
  const box: Box = {
    width: scaledMetric.maxWidth * (1 + alphabet.padding.x(height)),
    height: height > 30 && height < actualHeight ? height : actualHeight //!!
  }
  const images: ImageData[] = []
  for(let i = 0; i < alphabet.texts.length; i++){
    const letter = alphabet.texts[i]
    const metric = scaledMetric.metrics[i]
    const left = box.width / 2 - metric.width / 2 - metric.left
    const text = letter.text
    const color = "color" in letter ? letter.color : baseColor
    var baseline: number
    if(alignBaseline){
      baseline = scaledMetric.maxAscent + (box.height - scaledFontHeight) / 2
    }
    else{
      const {ascent, height} = metric
      baseline = ascent + (box.height - height) / 2
    }
    const image = textLength != undefined
      ? await textImageFromSvg(text, box, left, baseline, scaledFont, textLength, color)
      : textImageFromCanvas(text, box, left, baseline, scaledFont, color)
    images.push(image)
  }
  return images
}
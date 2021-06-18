import { getBitmaps, drawBitmapTo } from "./bitmap.js"

const canvas = document.querySelector("#font-canvas")
const context = canvas.getContext("2d", {alpha: true})

const overlay = document.querySelector("#overlay-canvas")

const {
  textSelector,
  fontFamily,
  fontSize,
  fontWeight,
  paddingSmallX,
  paddingPointX,
  paddingBigX,
  paddingY,
  baseline,
  grid
} = Object.fromEntries([...document.querySelectorAll("body .input")].map(
  element=>{
    const elementObject = Object.fromEntries([...element.querySelectorAll("input")].map(element=>[element.type, element]))
    if(elementObject.range && elementObject.number){
      elementObject.range.addEventListener("input", ({target:{value}})=>elementObject.number.value=value)
      elementObject.number.addEventListener("input", ({target:{value}})=>elementObject.range.value=value)
    }
    return [element.id, elementObject]
  }
))

grid.checkbox.addEventListener("change", ()=>{
  overlay.classList.toggle("hidden")
})

function gridSizeChange(){
  overlay.style.setProperty("--size", `${grid.number.value}px`)
}
grid.range.addEventListener("input", gridSizeChange)
grid.number.addEventListener("input", gridSizeChange)

textSelector.text.addEventListener("input", ()=>{
  textSelector.range.max = textSelector.text.value.split(",").length - 1
})

async function _draw(){
  const padding = {
    x: size => {
      const small = Number(paddingSmallX.number.value)
      const point = Number(paddingPointX.number.value)
      const big = Number(paddingBigX.number.value)
      const ratio = (point - size) / (point - Number(fontSize.number.min))
      return size<point ? ratio * small + (1 - ratio) * big : big
    },
    y: Number(paddingY.number.value)
  }
  const cellSize = Number(fontSize.number.value)
  const alphabet = textSelector.text.value.split(",")
  const weight = fontWeight.number.value
  const family = fontFamily.text.value
  const index = Number(textSelector.range.value)
  const bitmaps = await getBitmaps(alphabet, cellSize, weight, family, baseline.checkbox.checked, padding)
  const bitmap = bitmaps[index]
  const image = new ImageData(bitmap.width, bitmap.height)
  drawBitmapTo(image, 0, bitmap, [0, 0, 0])
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  overlay.width = canvas.width
  overlay.height = canvas.height
  console.log(canvas.height)
  context.putImageData(image, 0, 0)
}
function draw(){
  setTimeout(_draw, 0)
}
draw()

const numberInputs = [fontSize, fontWeight, paddingSmallX, paddingPointX, paddingBigX, paddingY]
for(const {range, number} of numberInputs){
  range.addEventListener("input", draw)
  number.addEventListener("input", draw)
}

textSelector.text.addEventListener("input", draw)
textSelector.range.addEventListener("input", draw)
fontFamily.text.addEventListener("input", draw)
baseline.checkbox.addEventListener("input", draw)
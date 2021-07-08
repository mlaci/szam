import { getBitmaps, drawBitmapTo } from "./bitmap.js"

const canvas = document.querySelector("canvas")
const context = canvas.getContext("2d", {alpha: true})

const fontPadding = {
  x: ()=>0,
  y: 0.02
}

async function main(){
  const height = 1000
  const bitmaps = await getBitmaps([..."😂😊😍😚😜🤔🙄😴🤢😵🤠😎🤓😭😱😡😈💀☠️💩🤡"], height, 600, "'Segoe UI Emoji', sans-serif", true, fontPadding, true)
  for(const bitmap of bitmaps){
    context.clearRect(0, 0, canvas.width, canvas.height)
    canvas.height = height
    canvas.width = bitmap.width
    const image = new ImageData(canvas.width, canvas.height)
    console.time("draw")
    drawBitmapTo(image, 0, bitmap)
    console.timeEnd("draw")
    context.putImageData(image, 0, 0)
  }
}
main()
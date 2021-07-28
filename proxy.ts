import type { Bitmap } from "./bitmap.js"
import { ImageDiff } from "./util.js"

function postMessage(target: Worker, name: string, message: any){
  const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)
  return new Promise(resolve=>{
    target.postMessage({name, id, message})
    target.addEventListener("message", function listener({data}){
      if(data && data.id == id){
        target.removeEventListener("message", listener)
        resolve(data.message)
      }
    })
  })
}

function generatorPostMessage(target: Worker, name: string, message: any, next: (message: {value: any, done: boolean}) => void){
  const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)
  target.postMessage({name, id, message})
  return new Promise(resolve=>{
    target.addEventListener("message", function listener({data}){
      if(data && data.id == id){
        if(data.message.done){
          target.removeEventListener("message", listener)
          next({value: data.message.value, done: true})
          resolve(data.message.value)
        }
        else{
          next({value: data.message.value, done: false})
        }
      }
    })
  })
}

export class CalcWorker extends Worker {
  constructor(){
    super("./worker.js", {type: "module"})
  }
  async calc(
    original: ImageData, 
    image: ImageData, 
    letters: ImageData, 
    imageDiff: ImageDiff,
    gridlength: number, 
    cellLength: number, 
    bitmaps: Bitmap[],
    animation: boolean,
    draw: (lettersFlat: ImageData) => void
  ){
    var done = false
    var lastMessage: ImageData
    var newMessage = false
    function next(message: {value: ImageData, done: boolean}){
      if(message.done){
        done = true
      }
      else{
        newMessage = true
        lastMessage = message.value
      }
    }
    function nextFrame(){
      if(newMessage){
        draw(lastMessage)
        newMessage = false
      }
      if(!done){
        requestAnimationFrame(nextFrame)
      }
    }
    nextFrame()
    const message = {original, image, letters, imageDiff, gridlength, cellLength, bitmaps, animation}
    return generatorPostMessage(this, "calc", message, next)
  }
}
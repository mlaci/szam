function postMessage(target, name, message){
  const id = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)
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

function generatorPostMessage(target, name, message, next){
  const id = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)
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

export class CalcWorker {
  worker
  constructor(worker){
    this.worker = worker
  }
  async calc(originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, gridlength, cellLength, bitmaps, draw){
    var done = false
    var lastMessage
    var newMessage = false
    function next(message){
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
    const message = {originalFlat, imageFlat, lettersFlatOriginal, diffArrayFlat, gridlength, cellLength, bitmaps}
    return generatorPostMessage(this.worker, "calc", message, next)
  }
  async terminate(){
    return this.worker.terminate()
  }
}
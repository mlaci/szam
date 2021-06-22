import {WorkerObject} from "./worker-object.js"

async function postMessage(target, name, message){
  const id = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)
  return new Promise(resolve=>{
    target.postMessage({name, id, message})
    const webTarget = target
    webTarget.addEventListener("message", function listener({data}){
      if(data && data.id == id){
        webTarget.removeEventListener("message", listener)
        resolve(data.message)
      }
    })
  })
}

export class WorkerProxy extends WorkerObject {
  worker
  constructor(worker){
    super()
    this.worker = worker
    return new Proxy(this, {
      get: (_, key)=>{
        if(key in WorkerObject.prototype){
          return new Proxy(this[key], {
            apply: (_, thisArg, params)=>postMessage(worker, key, [...params])
          })
        }
        else{
          return this[key]
        }
      } 
    })
  }
  async terminate(){
    return this.worker.terminate()
  }
}
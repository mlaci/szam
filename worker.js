import {WorkerObject} from "./worker-object.js"

const workerObject = new WorkerObject()

globalThis.addEventListener("message", async ({data: {name, id, message}})=>{
  if(workerObject[name].constructor.name == "AsyncGeneratorFunction"){
    const generator = workerObject[name](message)
    var done = false
    while(!done){
      const result = await generator.next()
      globalThis.postMessage({id, message: result})
      done = result.done
    }
  }
  else{
    const result = await workerObject[name](...message)
    globalThis.postMessage({id, message: result})
  }
})
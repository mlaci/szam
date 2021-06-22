import {WorkerObject} from "./worker-object.js"

const workerObject = new WorkerObject()

globalThis.addEventListener("message", async ({data: {name, id, message}})=>{
  const result = await workerObject[name](...message)
  globalThis.postMessage({id, message: result})
})
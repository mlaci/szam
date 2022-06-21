import type { Grid } from "./types.js"

interface TypedArray {
  buffer: ArrayBuffer
}

function flattenCopy(array: Uint8Array, flatArray: Uint8Array, width: number, grid: Grid, mode: "flatten" | "unflatten"){ 
  var offset = 0
  for (let w = 0; w < grid.height; w++){
    for (let z = 0; z < grid.width; z++){
      const offsetX = grid.offset.left + z * grid.cell.width
      const offsetY = grid.offset.top + w * grid.cell.height
      for (let y = 0; y < grid.cell.height; y++){
        const rowOffset = (offsetX + (y + offsetY)*width) * 4
        const rowLength = grid.cell.width * 4
        if(mode == "flatten"){
          const row = new Uint8Array(array.buffer, rowOffset, rowLength)
          flatArray.set(row, offset)
        }
        else if(mode == "unflatten"){
          const row = new Uint8Array(flatArray.buffer, offset, rowLength)
          array.set(row, rowOffset)
        }
        offset = offset + rowLength
      }
    }
  }
}

export function flatten(array: TypedArray, width: number, grid: Grid){
  const typedArray = new Uint8Array(array.buffer)
  const flatArray = new Uint8Array(grid.cell.width * grid.cell.height * grid.length * 4)
  flattenCopy(typedArray, flatArray, width, grid, "flatten")
  return flatArray
}

export function flattenImage(image: ImageData, grid: Grid){
  return new ImageData(new Uint8ClampedArray(flatten(image.data, image.width, grid).buffer), grid.cell.width)
}

export function unflattenTo(array: TypedArray, flatArray: TypedArray, width: number, grid: Grid): void {
  const typedArray = new Uint8Array(array.buffer)
  const typedFlatArray = new Uint8Array(flatArray.buffer)
  flattenCopy(typedArray, typedFlatArray, width, grid, "unflatten")
}

export function unflattenImageTo(image: ImageData, flatImage: ImageData, grid: Grid): void {
  unflattenTo(image.data, flatImage.data, image.width, grid)
}
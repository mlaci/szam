import type { Box, XY, Grid } from "./types.js"

interface TypedArray {
  buffer: ArrayBuffer
}

function flattenCopy(array: Uint8Array, flatArray: Uint8Array, width: number, padding: XY, grid: Grid, cell: Box, mode: "flatten" | "unflatten"){ 
  var offset = 0
  for (let w = grid.offsetW; w < grid.offsetW + grid.height; w++){
    for (let z = grid.offsetZ; z < grid.offsetZ + grid.width; z++){
      const offsetX = padding.x + z * cell.width
      const offsetY = padding.y + w * cell.height
      for (let y = 0; y < cell.height; y++){
        const rowOffset = (offsetX + (y + offsetY)*width) * 4
        const rowLength = cell.width * 4
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

export function flatten(array: TypedArray, width: number, padding: XY, grid: Grid, cell: Box){
  const typedArray = new Uint8Array(array.buffer)
  const flatArray = new Uint8Array(cell.width * cell.height * grid.length * 4)
  flattenCopy(typedArray, flatArray, width, padding, grid, cell, "flatten")
  return flatArray
}

export function flattenImage(image: ImageData, padding: XY, grid: Grid, cell: Box){
  return new ImageData(new Uint8ClampedArray(flatten(image.data, image.width, padding, grid, cell).buffer), cell.width)
}

export function unflattenTo(array: TypedArray, flatArray: TypedArray, width: number, padding: XY, grid: Grid, cell: Box): void {
  const typedArray = new Uint8Array(array.buffer)
  const typedFlatArray = new Uint8Array(flatArray.buffer)
  flattenCopy(typedArray, typedFlatArray, width, padding, grid, cell, "unflatten")
}

export function unflattenImageTo(image: ImageData, flatImage: ImageData, padding: XY, grid: Grid, cell: Box): void {
  unflattenTo(image.data, flatImage.data, image.width, padding, grid, cell)
}
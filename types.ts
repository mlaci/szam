import { RGB } from "./image.js"

/** Same concept as DOMRect */
export interface Rect {
  width: number
  height: number
}

export interface Grid {
  width: number
  height: number
  length: number
  offset: {
    top: number
    left: number
  }
  cell: Rect & {
    length: number
  }
}

export type Color = string | `rgb(${number}, ${number}, ${number})` | `rgba(${number}, ${number}, ${number}, ${number})`

export interface Texts {
  texts: {text: string}[] | {text: string, color: Color}[]
  smallestSize: number
  fontFamily?: string[]
  fontWeight?: {min: number, max: number, factor: number}
  fontSource?: string
  textLength?: number
  alignBaseline?: boolean
  padding: {
    y: number
    x: (height?: number) => number
  }
} 

export interface TextEmojis {
  texts: {text: string}[]
  smallestSize: number
  fontFamily: [""]
  aspectRatio?: number
  padding: {
    y: number
    x: (height?: number) => number
  }
}

export type TextSources = Texts | TextEmojis

interface SvgSources {
  uris: string[]
  smallestSize: number
  aspectRatio?: number
  usedAsMask?: boolean
}

export type Alphabet =  TextSources | SvgSources

export interface Frame {
  title: string
  imageSource: string
  smallerImageSource?: string
  alphabet: Alphabet
  palette?: "all-color" | {quantization: number} | Color[]
  animation: boolean
  backgroundColor: RGB
  epilogue: {
    text: string
    duration: number
  }
}

export interface Slide {
  title: string
  frames: Frame[]
}
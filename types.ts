export interface Box {
  width: number,
  height: number
}

export interface XY {
  x: number
  y: number
}
export interface Grid {
  width: number
  height: number
  length: number
  offsetW: number
  offsetZ: number
}

export type Color = string | `rgb(${number}, ${number}, ${number})` | `rgba(${number}, ${number}, ${number}, ${number})`

export interface Texts {
  texts: {text: string}[] | {text: string, color: Color}[]
  fontFamily?: string[]
  fontWeight?: {min: number, max: number, factor: number}
  fontSource?: string
  textLength?: number
  alignBaseline?: boolean
  padding: {
    y: number
    x: (height: number) => number
  }
} 

export interface TextEmojis {
  texts: {text: string}[]
  fontFamily: [""]
  aspectRatio?: number
  padding: {
    y: number
    x: (height: number) => number
  }
}

export type TextSources = Texts | TextEmojis

interface SvgSources {
  uris: string[]
  aspectRatio?: number
  usedAsMask?: boolean
}

export type Alphabet =  TextSources | SvgSources

interface Frame {
  title: string
  imageSource: string
  smallerImageSource?: string
  alphabet: Alphabet
  palette?: "all-color" | {quantization: number} | Color[]
  smallestFontSize: number
  sizeFactor: number
  epilogue: {
    text: string
    duration: number
  }
}

interface Slide {
  title: string
  frames: Frame[]
}
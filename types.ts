export type Color = string | `rgb(${number}, ${number}, ${number})` | `rgba(${number}, ${number}, ${number}, ${number})`

type FontProperties = {
  fontFamily?: string[]
  fontWeight?: {min: number, max: number, factor: number}
  fontSource?: string
  textLength?: number
  alignBaseline?: boolean
}

type TextsBase = {
  texts: {text: string, color?: Color}[]

}

export type Texts = {
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

type Never<T> = {[K in keyof T]: never} 

export type TextEmojis = {
  texts: {text: string}[]
  fontFamily: [""]
  aspectRatio?: number
  padding: {
    y: number
    x: (height: number) => number
  }
}

export type TextSources = Texts | TextEmojis

type SvgSources = {
  uris: string[]
  aspectRatio?: number
  usedAsMask?: boolean
}

export type Alphabet =  TextSources | SvgSources

type Frame = {
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

type Slide = {
  title: string
  frames: Frame[]
}
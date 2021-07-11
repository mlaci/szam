import type { Color } from "./image"
type TextBase = {
  fontFamily?: string[]
  fontWeight?: {min: number, max: number, factor: number}
  fontSource?: string
  textLength?: number
  alignBaseline?: boolean
  padding?: {
    y: number
    x: (height: number) => number
  }
}

type TextMasks = {
  texts: string[]
} & TextBase

type TextsWithColor = {
  texts: {
    text: string
    color: Color
  }[]
} & TextBase

type NativeEmojis = {
  emojis: string[]
  fontFamily: ""
  aspectRatio?: number
}

type SvgSources = {
  uris: string[]
  aspectRatio?: number
  usedAsMask?: boolean
}

type Alphabet = TextMasks | TextsWithColor | SvgSources

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
type Bit = 0 | 1

interface ValueNode<T> {
  value: T,
  count: number,
  index: number
}
interface InnerNode<T> {
  count: number
  left?: TreeNode<T>
  right?: TreeNode<T>
}
type TreeNode<T> = ValueNode<T> | InnerNode<T>
export type Tree<T> = InnerNode<T>

export const repeatSymbol = "repeat-symbol" //Symbol("repeat") not clonable

const CHUNK_SIZE = 2000
class BitStreamWriter {
  data = new Uint8Array(CHUNK_SIZE)
  length = 0
  byte = 0
  bitLength = 0
  private grow(size: number): void {
    const data = new Uint8Array(this.data.byteLength + size)
    data.set(this.data)
    this.data = data
  }
  write(bits: Bit[]): void {
    for(const bit of bits){
      this.byte = (this.byte << 1) + bit
      this.bitLength++
      if(this.bitLength == 8){
        if(this.length >= this.data.byteLength){
          this.grow(CHUNK_SIZE)
        }
        this.data[this.length++] = this.byte
        this.byte = 0
        this.bitLength = 0
      }
    }
  }
  end(){
    if(this.bitLength != 0){
      this.byte = this.byte << (8-this.bitLength)
      if(this.length >= this.data.byteLength){
        this.grow(1)
      }
      this.data[this.length++] = this.byte
    }
    return {data: this.data.slice(0, this.length), lastByteLength: this.bitLength}
  }
}

type TypeOrRepeatSymbol<T> = T | typeof repeatSymbol
export function* readBitStream<T>(data: Uint8Array, lastByteLength: number, literalTree: Tree<TypeOrRepeatSymbol<T>>, lengthTree: Tree<number>){
  var literalNode = literalTree
  var lengthNode = lengthTree
  var bytePos = 0
  var bitPos = 0
  var byte: number
  var repeat = false
  while((bytePos < data.byteLength-1) || (bytePos == data.byteLength-1 && bitPos < lastByteLength)){
    if(bitPos == 0){
      byte = data[bytePos]
    }
    const bit = byte & (1 << (7 - bitPos++))
    let value: TypeOrRepeatSymbol<T> | number
    if(repeat){
      const node = bit == 0 ? lengthNode?.left : lengthNode?.right
      if("value" in node){
        value = node.value
        lengthNode = lengthTree
      }
      else{
        lengthNode = node
      }
    }
    else{
      const node = bit == 0 ? literalNode?.left : literalNode?.right
      if("value" in node){
        value = node.value
        literalNode = literalTree
      }
      else{
        literalNode = node
      }
    }
    if(value != undefined){
      repeat = value == repeatSymbol
      yield value
    }
    if(bitPos > 7){
      bytePos++
      bitPos = 0
    }
  }
}

function tree<T>(values: ValueNode<T>[]): Tree<T> {
  if(values.length == 0){
    return undefined
  }
  if(values.length == 1){
    return {count: values[0].count, left: values[0]}
  }
  else{
    const trees: Tree<T>[] = [...values].sort(({count: a},{count: b})=>b-a)
    while(trees.length > 1){
      const last1 = trees.pop()
      const last2 = trees.pop()
      trees.push({count: last1.count+last2.count, left: last1, right: last2})
      trees.sort(({count: a},{count: b})=>b-a)
    }
    return trees[0]
  }
}

type Table<T> = {value: T, index: number, code: Bit[]}[]

function codes<T>(node: TreeNode<T>, prefix: Bit[] = []): Table<T> {
  if(node != undefined){
    if("value" in node){
      const {value, index} = node
      return [{value, index, code: prefix}]
    }
    else{
      const {left, right} = node
      return codes(left, [...prefix, 0]).concat(codes(right, [...prefix, 1]))
    }
  }
  else{
    return []
  }
}

interface CompressionInput<T> {
  data: DataView
  literals: ValueNode<T>[]
  lengths: ValueNode<number>[]
}

export function compress<T>(input: CompressionInput<T>){
  const literals: ValueNode<T | typeof repeatSymbol>[] = [...input.literals]
  const lengths = input.lengths.filter(({value})=>value != 1).map(({value, count}, index)=>({value: value-1, count, index}))
  const repeatCount = lengths.reduce((sum, {count})=>sum+count, 0)
  if(repeatCount > 0){
    literals.push({value: repeatSymbol, count: repeatCount, index: literals.length})
  }
  const literalTree = tree(literals)
  const lengthTree = tree(lengths)
  const literalTable = codes(literalTree).sort(({index: a}, {index: b})=>a-b)
  const lengthTable = codes(lengthTree).sort(({index: a}, {index: b})=>a-b)
  const repeatCode = literalTable.find(({value})=>value == repeatSymbol)?.code
  const bitStream = new BitStreamWriter()
  for(let i = 0; i < input.data.byteLength / 4; i++){
    const literalIndex = input.data.getUint16(i * 4 + 0)
    const lengthIndex = input.data.getUint16(i * 4 + 2)
    const length = lengthTable[lengthIndex-1]?.value
    bitStream.write(literalTable[literalIndex].code)
    if(length > 0){
      bitStream.write(repeatCode)
      bitStream.write(lengthTable[lengthIndex-1].code)
    }
  }
  const {data, lastByteLength} = bitStream.end()
  return {data, lastByteLength, literalTree, lengthTree}
}
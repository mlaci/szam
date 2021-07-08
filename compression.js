const CHUNK_SIZE = 2000
class BitStreamWriter {
  data = new Uint8Array(CHUNK_SIZE)
  length = 0
  byte = 0
  bitLength = 0
  _grow(size){
    const data = new Uint8Array(this.data.byteLength + size)
    data.set(this.data)
    this.data = data
  }
  write(bits){
    for(const bit of bits){
      this.byte = (this.byte << 1) + bit
      this.bitLength++
      if(this.bitLength == 8){
        if(this.length >= this.data.byteLength){
          this._grow(CHUNK_SIZE)
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
        this._grow(1)
      }
      this.data[this.length++] = this.byte
    }
    return this.data.slice(0, this.length)
  }
}

function* readBitStream(data, colorTree, lengthTree){
  var colorNode = colorTree
  var lengthNode = lengthTree
  var bytePos = 0
  var bitPos = 0
  var byte = data[0]
  var repeat = false
  while(bytePos < data.byteLength){
    if(bitPos > 7){
      bytePos++
      byte = data[bytePos]
      bitPos = 0
    }
    const bit = byte & (1 << (7 - bitPos++))
    let value
    if(repeat){
      lengthNode = bit == 0 ? lengthNode.left : lengthNode.right
      if(lengthNode.value != undefined){
        value = lengthNode.value
        lengthNode = lengthTree
      }
    }
    else{
      colorNode = bit == 0 ? colorNode.left : colorNode.right
      if(colorNode.value != undefined){
        value = colorNode.value
        colorNode = colorTree
      }
    }
    if(value != undefined){
      repeat = value == "repeat"
      yield value
    }
  }
}

function tree(values){
  values = values.sort(({count: a},{count: b})=>b-a)
  while(values.length > 1){
    const last1 = values.pop()
    const last2 = values.pop()
    values.push({count: last1.count+last2.count, left: last1, right: last2})
    values.sort(({count: a},{count: b})=>b-a)
  }
  return values[0]
}

function codes({left, right, value, ...props}, prefix = []){
  if(value != undefined){
    return [{value, ...props, prefix}]
  }
  else{
    return codes(left, [...prefix, 0]).concat(codes(right, [...prefix, 1]))
  }
}

export function compress(image){
  const colors = image.colors.map(({color, count}, index)=>({value: color, count, index}))
  const lengths = image.lengths.map(({length, count}, index)=>({value: length, count, index}))
  const repeatCount = lengths.reduce((sum, {count})=>sum+count, 0)
  colors.push({value: "repeat", count: repeatCount, index: colors.length})
  const colorTree = tree(colors)
  const lengthTree = tree(lengths)
  const colorMap = codes(colorTree).sort(({index: a}, {index: b})=>a-b)
  const lengthMap = codes(lengthTree).sort(({index: a}, {index: b})=>a-b)
  const repeatCode = colorMap[colorMap.length-1].prefix
  const bitStream = new BitStreamWriter(image.dataView.byteLength)
  for(let i = 0; i < image.dataView.byteLength / 4; i++){
    const colorIndex = image.dataView.getUint16(i * 4 + 0)
    const lengthIndex = image.dataView.getUint16(i * 4 + 2)
    const length = lengthMap[lengthIndex].value
    bitStream.write(colorMap[colorIndex].prefix)
    if(length > 1){
      bitStream.write(repeatCode)
      bitStream.write(lengthMap[lengthIndex].prefix)
    }
  }
  const data = bitStream.end()
  return {data, colorTree, lengthTree}
}

export function* decompress(data, colorTree, lengthTree){
  var prev
  var repeat = false
  var offset = 0
  for(const value of readBitStream(data, colorTree, lengthTree)){
    if(value != "repeat"){
      if(!repeat){
        prev = value
      }
      var number = repeat ? value-1 : 1
      if(prev != 0){
        for(let i = 0; i < number; i++){
          yield {offset, value: prev}
          offset++
        }
      }
      else{
        offset += number
      }
      repeat = false
    }
    else{
      repeat = true
    }
  }
}
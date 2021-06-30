//https://unicode.org/Public/emoji/13.1/emoji-test.txt
const skinTones = ["🏻","🏼","🏽","🏾","🏿"]
function filterEmoji(text){
  text = [...text.matchAll(/(?<head>(?:sub)?(?:group:.*))|(?:fully-qualified     # (?<char>.*) E[0-3]\.[0-9])/g)]
  .map(({groups: {head, char}})=>{
    if(head != undefined){
      if(head.includes("subgroup:")){
        return `    //${head}\n`
      }
      else{
        return `  //${head}\n`
      }
      
    }
    else if(char != undefined && !skinTones.some(skinTone=>char.includes(skinTone))){
      return `    "${char}",\n`
    }
  })
  .join("")
  return `[\n${text}]`
}

async function main(){
  const text = await fetch("https://unicode.org/Public/emoji/13.1/emoji-test.txt").then(res=>res.text())
  const emojiText = filterEmoji(text)
  const enc = new TextEncoder()
  const file = new File([enc.encode(emojiText)], "emoji-download.txt", {type: "text/plain;charset=utf-8"})
  const url = URL.createObjectURL(file)
  window.location.assign(url)
}
main()
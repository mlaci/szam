import { colorDistance } from "./image.js"
const MIN_VALUE = 0.0001
function centroid(vectors){
  const sum = [0, 0, 0]
  for(const vector of vectors){
    sum[0] = sum[0] + vector[0]
    sum[1] = sum[1] + vector[1]
    sum[2] = sum[2] + vector[2]
  }
  return [sum[0]/vectors.length, sum[1]/vectors.length, sum[2]/vectors.length]
}

function weiszfeld(vectors, prev){
  const numerator = [0, 0, 0]
  var deminator = 0
  for(const vector of vectors){
    var distance = colorDistance(vector, prev)
    distance = distance == 0 ? MIN_VALUE : distance
    numerator[0] = numerator[0] + vector[0]/distance
    numerator[1] = numerator[1] + vector[1]/distance
    numerator[2] = numerator[2] + vector[2]/distance
    deminator = deminator + 1/distance
  }
  return [numerator[0]/deminator, numerator[1]/deminator, numerator[2]/deminator]
}

function subtractVector(vec1, vec2){
  return [vec1[0] - vec2[0], vec1[1] - vec2[1], vec1[2] - vec2[2]]
}

export function getColor(colors){
  var prevMean = [Infinity, Infinity, Infinity]
  var mean = centroid(colors)
  while(subtractVector(prevMean, mean).some(value=>Math.abs(value)>0.5)){
    prevMean = mean
    mean = weiszfeld(colors, mean)
  }
  return mean
}
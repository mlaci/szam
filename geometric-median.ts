import { colorDistance } from "./image.js"
const MIN_VALUE = 0.0001
type Vec3 = readonly [number, number, number]

/**
 * Calculates the geometric center of vectors.
 * @param vectors - The vectors to be processed.
 * @returns The vector of the center.
 */
function centroid(vectors: Vec3[]):  Vec3 {
  var sum: Vec3 = [0, 0, 0] as const
  for(const vector of vectors){
    sum = [
      sum[0] + vector[0],
      sum[1] + vector[1],
      sum[2] + vector[2]
    ] as const
  }
  return [
    sum[0] / vectors.length,
    sum[1] / vectors.length,
    sum[2] / vectors.length
  ] as const
}

/**
 * Calculates a closer estimate of the geometric median of vectors from a previous estimate.
 * If the function is applied iteratively, the results will approximate the true median.
 * @param vectors - The vectors to be processed.
 * @param prev - The previous estimate of the median.
 * @returns Estimate of the median.
 */
function weiszfeld(vectors: Vec3[], prev: Vec3): Vec3{
  var numerator: Vec3 = [0, 0, 0] as const
  var deminator = 0
  for(const vector of vectors){
    var distance = colorDistance(vector, prev)
    distance = distance == 0 ? MIN_VALUE : distance
    numerator = [
      numerator[0] + vector[0]/distance,
      numerator[1] + vector[1]/distance,
      numerator[2] + vector[2]/distance
    ] as const
    deminator = deminator + (1 / distance)
  }
  return [
    numerator[0] / deminator,
    numerator[1] / deminator,
    numerator[2] / deminator
  ] as const
}

/**
 * Subtracts `b` vector from `a` vector (a-b).
 * @param a - The minuend vector.
 * @param b - The subtrahend vector.
 * @returns The difference vector.
 */
function subtract(a: Vec3, b: Vec3): Vec3{
  return [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2]
  ] as const
}

/**
 * Calculates a vector which has the minimal sum of distances from the `vectors` with the defined `accuracy`
 * (approximation of the geometric median with weiszfeld algorithm).
 * @param vectors - The vectors to be processed.
 * @param accuracy - The accuracy to the real median.
 * @returns The minimal distance vector.
 */
export function getMedian(vectors: Vec3[], accuracy = 0.5){
  var prev: Vec3 = [Infinity, Infinity, Infinity] as const
  var median = centroid(vectors)
  while(subtract(prev, median).some(value=>Math.abs(value) > accuracy)){
    prev = median
    median = weiszfeld(vectors, prev)
  }
  return median
}

//TODO: optimize
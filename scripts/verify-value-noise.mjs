// 验证值噪声在晶格边界处“值连续、斜率不连续”
// 运行：node scripts/verify-value-noise.mjs

const SEED = 42

const lerp = (a, b, t) => a + (b - a) * t

const hash01 = (x, z, seed) => {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(z | 0, 668265263) +
    Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const valueNoise1D = x => {
  const i = Math.floor(x)
  return lerp(hash01(i, 0, SEED), hash01(i + 1, 0, SEED), x - i)
}

const valueNoise2D = (x, z) => {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  return lerp(
    lerp(hash01(xi, zi, SEED), hash01(xi + 1, zi, SEED), xf),
    lerp(hash01(xi, zi + 1, SEED), hash01(xi + 1, zi + 1, SEED), xf),
    zf
  )
}

const EPS = 1e-7
const H = 1e-4
const boundary = 2

const left = valueNoise1D(boundary - EPS)
const right = valueNoise1D(boundary + EPS)
const leftSlope = (valueNoise1D(boundary) - valueNoise1D(boundary - H)) / H
const rightSlope = (valueNoise1D(boundary + H) - valueNoise1D(boundary)) / H

console.log('1D 值噪声，晶格边界 x = 2')
console.log('  f(2 - 1e-7) =', left.toFixed(8))
console.log('  f(2 + 1e-7) =', right.toFixed(8))
console.log('  |左右差|    =', Math.abs(left - right).toExponential(2))
console.log('  左侧斜率    =', leftSlope.toFixed(4))
console.log('  右侧斜率    =', rightSlope.toFixed(4))
console.log('  斜率差      =', Math.abs(leftSlope - rightSlope).toFixed(4))
console.log('  值连续：', Math.abs(left - right) < 1e-6 ? '是' : '否')

const z = 0.37
const left2 = valueNoise2D(boundary - EPS, z)
const right2 = valueNoise2D(boundary + EPS, z)
const leftSlope2 = (valueNoise2D(boundary, z) - valueNoise2D(boundary - H, z)) / H
const rightSlope2 =
  (valueNoise2D(boundary + H, z) - valueNoise2D(boundary, z)) / H

console.log('\n2D 值噪声，晶格边界 x = 2, z = 0.37')
console.log('  f(2 - 1e-7) =', left2.toFixed(8))
console.log('  f(2 + 1e-7) =', right2.toFixed(8))
console.log('  |左右差|    =', Math.abs(left2 - right2).toExponential(2))
console.log('  左侧斜率    =', leftSlope2.toFixed(4))
console.log('  右侧斜率    =', rightSlope2.toFixed(4))
console.log('  斜率差      =', Math.abs(leftSlope2 - rightSlope2).toFixed(4))
console.log('  值连续：', Math.abs(left2 - right2) < 1e-6 ? '是' : '否')

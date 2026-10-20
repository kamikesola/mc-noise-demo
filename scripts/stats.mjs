// 计算六个高度版本的范围与相邻高差统计（与 demo 参数一致）
// 运行：node scripts/stats.mjs

const WORLD_SIZE = 96
const MIN_Y = -64
const MAX_Y = 320
const SEA_LEVEL = 63
const SEED = 42

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)
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

const valueNoise = (x, z, seed) => {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  return lerp(
    lerp(hash01(xi, zi, seed), hash01(xi + 1, zi, seed), xf),
    lerp(hash01(xi, zi + 1, seed), hash01(xi + 1, zi + 1, seed), xf),
    zf
  )
}

// ---- MC 1.21.1 LegacyRandomSource ----
class LegacyRandomSource {
  constructor(seed) {
    this.seed = (BigInt(seed) ^ 25214903917n) & 281474976710655n
  }

  next(bits) {
    this.seed = (this.seed * 25214903917n + 11n) & 281474976710655n
    return Number(this.seed >> BigInt(48 - bits))
  }

  nextInt(bound) {
    if ((bound & -bound) === bound) {
      return Math.floor((bound * this.next(31)) / 2147483648)
    }
    let i, j
    do {
      i = this.next(31)
      j = i % bound
    } while (i - j + (bound - 1) >= 2147483648)
    return j
  }

  nextDouble() {
    return (this.next(26) * 134217728 + this.next(27)) * 1.1102230246251565e-16
  }

  consumeCount(count) {
    for (let i = 0; i < count; i++) this.next(32)
  }
}

// ---- MC 1.21.1 ImprovedNoise ----
const GRADIENT = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
  [1, 1, 0],
  [0, -1, 1],
  [-1, 1, 0],
  [0, -1, -1]
]

const smoothstep = t => t * t * t * (t * (t * 6 - 15) + 10)

const lerp2 = (d1, d2, s1, e1, s2, e2) =>
  lerp(lerp(s1, e1, d1), lerp(s2, e2, d1), d2)

const lerp3 = (d1, d2, d3, s1, e1, s2, e2, s3, e3, s4, e4) =>
  lerp(
    lerp2(d1, d2, s1, e1, s2, e2),
    lerp2(d1, d2, s3, e3, s4, e4),
    d3
  )

class ImprovedNoise {
  constructor(random) {
    this.xo = random.nextDouble() * 256
    this.yo = random.nextDouble() * 256
    this.zo = random.nextDouble() * 256
    this.p = new Uint8Array(256)

    for (let i = 0; i < 256; i++) this.p[i] = i
    for (let k = 0; k < 256; k++) {
      const j = random.nextInt(256 - k)
      const b0 = this.p[k]
      this.p[k] = this.p[k + j]
      this.p[k + j] = b0
    }
  }

  pAt(index) {
    return this.p[index & 255]
  }

  gradDot(index, x, y, z) {
    const g = GRADIENT[index & 15]
    return g[0] * x + g[1] * y + g[2] * z
  }

  sampleAndLerp(gx, gy, gz, dx, dy, dz) {
    const i = this.pAt(gx)
    const j = this.pAt(gx + 1)
    const k = this.pAt(i + gy)
    const l = this.pAt(i + gy + 1)
    const i1 = this.pAt(j + gy)
    const j1 = this.pAt(j + gy + 1)

    const d0 = this.gradDot(this.pAt(k + gz), dx, dy, dz)
    const d1 = this.gradDot(this.pAt(i1 + gz), dx - 1, dy, dz)
    const d2 = this.gradDot(this.pAt(l + gz), dx, dy - 1, dz)
    const d3 = this.gradDot(this.pAt(j1 + gz), dx - 1, dy - 1, dz)
    const d4 = this.gradDot(this.pAt(k + gz + 1), dx, dy, dz - 1)
    const d5 = this.gradDot(this.pAt(i1 + gz + 1), dx - 1, dy, dz - 1)
    const d6 = this.gradDot(this.pAt(l + gz + 1), dx, dy - 1, dz - 1)
    const d7 = this.gradDot(this.pAt(j1 + gz + 1), dx - 1, dy - 1, dz - 1)

    return lerp3(
      smoothstep(dx),
      smoothstep(dy),
      smoothstep(dz),
      d0,
      d1,
      d2,
      d3,
      d4,
      d5,
      d6,
      d7
    )
  }

  noise(x, y, z) {
    const d0 = x + this.xo
    const d1 = y + this.yo
    const d2 = z + this.zo
    const i = Math.floor(d0)
    const j = Math.floor(d1)
    const k = Math.floor(d2)
    return this.sampleAndLerp(i, j, k, d0 - i, d1 - j, d2 - k)
  }
}

const wrap = value => value - Math.floor(value / 33554432 + 0.5) * 33554432

// ---- MC 1.21.1 PerlinNoise ----
class PerlinNoise {
  constructor(random, firstOctave, amplitudes) {
    this.amplitudes = amplitudes.slice()
    const count = this.amplitudes.length
    const j = -firstOctave
    this.noiseLevels = new Array(count).fill(null)

    const base = new ImprovedNoise(random)
    if (j >= 0 && j < count && this.amplitudes[j] !== 0) {
      this.noiseLevels[j] = base
    }
    for (let i = j - 1; i >= 0; i--) {
      if (i < count) {
        if (this.amplitudes[i] !== 0) {
          this.noiseLevels[i] = new ImprovedNoise(random)
        } else {
          random.consumeCount(262)
        }
      } else {
        random.consumeCount(262)
      }
    }

    this.lowestFreqInputFactor = Math.pow(2, -j)
    this.lowestFreqValueFactor =
      Math.pow(2, count - 1) / (Math.pow(2, count) - 1)
    this.maxValue = this.edgeValue(2)
  }

  static create(random, firstOctave, firstAmplitude, ...amplitudes) {
    return new PerlinNoise(random, firstOctave, [firstAmplitude, ...amplitudes])
  }

  getValue(x, y, z) {
    let value = 0
    let input = this.lowestFreqInputFactor
    let output = this.lowestFreqValueFactor
    for (let i = 0; i < this.noiseLevels.length; i++) {
      const noise = this.noiseLevels[i]
      if (noise) {
        value +=
          this.amplitudes[i] *
          noise.noise(wrap(x * input), wrap(y * input), wrap(z * input)) *
          output
      }
      input *= 2
      output /= 2
    }
    return value
  }

  edgeValue(multiplier) {
    let value = 0
    let output = this.lowestFreqValueFactor
    for (let i = 0; i < this.noiseLevels.length; i++) {
      if (this.noiseLevels[i]) {
        value += this.amplitudes[i] * multiplier * output
      }
      output /= 2
    }
    return value
  }
}

// ---- MC 1.21.1 NormalNoise ----
const expectedDeviation = octaves => 0.1 * (1 + 1 / (octaves + 1))

class NormalNoise {
  constructor(random, firstOctave, amplitudes) {
    this.first = new PerlinNoise(random, firstOctave, amplitudes)
    this.second = new PerlinNoise(random, firstOctave, amplitudes)

    let minOctave = Number.MAX_SAFE_INTEGER
    let maxOctave = Number.MIN_SAFE_INTEGER
    amplitudes.forEach((amplitude, index) => {
      if (amplitude !== 0) {
        minOctave = Math.min(minOctave, index)
        maxOctave = Math.max(maxOctave, index)
      }
    })

    this.valueFactor =
      0.16666666666666666 / expectedDeviation(maxOctave - minOctave)
    this.maxValue =
      (this.first.maxValue + this.second.maxValue) * this.valueFactor
  }

  static create(random, firstOctave, firstAmplitude, ...amplitudes) {
    return new NormalNoise(random, firstOctave, [firstAmplitude, ...amplitudes])
  }

  getValue(x, y, z) {
    const sx = x * 1.0181268882175227
    const sy = y * 1.0181268882175227
    const sz = z * 1.0181268882175227
    return (
      (this.first.getValue(x, y, z) + this.second.getValue(sx, sy, sz)) *
      this.valueFactor
    )
  }
}

const improvedNoise = new ImprovedNoise(new LegacyRandomSource(SEED))
const perlinNoise = PerlinNoise.create(
  new LegacyRandomSource(SEED),
  -4,
  1,
  0.7,
  0.5
)
const normalNoise = NormalNoise.create(
  new LegacyRandomSource(SEED),
  -4,
  1,
  0.7,
  0.5
)

const RAW = {
  random: (x, z) => (hash01(x, z, SEED) - 0.5) * 60,
  smooth: (x, z) => 12 * Math.sin(x * 0.2) + 6 * Math.cos(z * 0.2),
  value: (x, z) => (valueNoise(x * 0.08, z * 0.08, SEED) - 0.5) * 48,
  perlin: (x, z) => improvedNoise.noise(x * 0.06, 0, z * 0.06) * 24,
  octaves: (x, z) => perlinNoise.getValue(x, 0, z) * 50,
  normal: (x, z) => normalNoise.getValue(x, 0, z) * 30
}

const HEIGHTS = Object.fromEntries(
  Object.entries(RAW).map(([mode, raw]) => [
    mode,
    (x, z) => clamp(SEA_LEVEL + Math.round(raw(x, z)), MIN_Y, MAX_Y)
  ])
)

const half = WORLD_SIZE / 2
const rows = []

for (const [mode, height] of Object.entries(HEIGHTS)) {
  let sum = 0
  let min = Infinity
  let max = -Infinity
  let rawMin = Infinity
  let rawMax = -Infinity
  let steps = 0
  let bigSteps = 0
  let maxStep = 0
  let adjacent = 0
  let count = 0

  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      const raw = RAW[mode](x, z)
      rawMin = Math.min(rawMin, raw)
      rawMax = Math.max(rawMax, raw)

      const h = height(x, z)
      sum += h
      count++
      min = Math.min(min, h)
      max = Math.max(max, h)

      if (x + 1 < half) {
        const diff = Math.abs(height(x + 1, z) - h)
        steps += diff
        adjacent++
        maxStep = Math.max(maxStep, diff)
        if (diff > 1) bigSteps++
      }
      if (z + 1 < half) {
        const diff = Math.abs(height(x, z + 1) - h)
        steps += diff
        adjacent++
        maxStep = Math.max(maxStep, diff)
        if (diff > 1) bigSteps++
      }
    }
  }

  rows.push({
    mode,
    rawMin: rawMin.toFixed(2),
    rawMax: rawMax.toFixed(2),
    min,
    max,
    mean: (sum / count).toFixed(1),
    avgStep: (steps / adjacent).toFixed(2),
    maxStep,
    bigStepRatio: ((bigSteps / adjacent) * 100).toFixed(1) + '%'
  })
}

console.table(rows)

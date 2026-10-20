/**
 * Minecraft Java 版 1.21.1 的 ImprovedNoise 的 TypeScript 移植。
 *
 * 源码位置（Mojang 官方映射）：
 *   net.minecraft.world.level.levelgen.synth.ImprovedNoise
 *
 * 它是 3D 柏林噪声：
 *   - p[256]：置换表，用 RandomSource 洗牌；
 *   - xo / yo / zo：三个随机偏移，避免不同噪声实例在原点处对齐；
 *   - 每个立方体的 8 个角各取一个梯度（SimplexNoise.GRADIENT，16 个方向）；
 *   - 每个轴做 smoothstep，再用 lerp3 做三线性插值。
 *
 * 为了画 2D 高度图，demo 只取 y = 0 的切片；真实 MC 是在 3D 密度场里采样。
 */
import type { RandomSource } from './legacyRandomSource'

/** 与 SimplexNoise.GRADIENT 完全一致（16 项，部分方向重复） */
const GRADIENT: ReadonlyArray<readonly [number, number, number]> = [
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

const smoothstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

const lerp = (delta: number, start: number, end: number) =>
  start + delta * (end - start)

const lerp2 = (
  delta1: number,
  delta2: number,
  start1: number,
  end1: number,
  start2: number,
  end2: number
) => lerp(delta2, lerp(delta1, start1, end1), lerp(delta1, start2, end2))

const lerp3 = (
  delta1: number,
  delta2: number,
  delta3: number,
  start1: number,
  end1: number,
  start2: number,
  end2: number,
  start3: number,
  end3: number,
  start4: number,
  end4: number
) =>
  lerp(
    delta3,
    lerp2(delta1, delta2, start1, end1, start2, end2),
    lerp2(delta1, delta2, start3, end3, start4, end4)
  )

export default class ImprovedNoise {
  private readonly p = new Uint8Array(256)
  readonly xo: number
  readonly yo: number
  readonly zo: number

  constructor(random: RandomSource) {
    this.xo = random.nextDouble() * 256
    this.yo = random.nextDouble() * 256
    this.zo = random.nextDouble() * 256

    for (let i = 0; i < 256; i++) this.p[i] = i

    for (let k = 0; k < 256; k++) {
      const j = random.nextInt(256 - k)
      const b0 = this.p[k]
      this.p[k] = this.p[k + j]
      this.p[k + j] = b0
    }
  }

  noise(x: number, y: number, z: number): number {
    const d0 = x + this.xo
    const d1 = y + this.yo
    const d2 = z + this.zo

    const i = Math.floor(d0)
    const j = Math.floor(d1)
    const k = Math.floor(d2)

    return this.sampleAndLerp(i, j, k, d0 - i, d1 - j, d2 - k)
  }

  /** Java 里 p 是 byte[]，取值时 & 0xFF；Uint8Array 已经保证 0..255 */
  private pAt(index: number): number {
    return this.p[index & 255]
  }

  private gradDot(
    gradIndex: number,
    x: number,
    y: number,
    z: number
  ): number {
    const g = GRADIENT[gradIndex & 15]
    return g[0] * x + g[1] * y + g[2] * z
  }

  private sampleAndLerp(
    gridX: number,
    gridY: number,
    gridZ: number,
    deltaX: number,
    deltaY: number,
    deltaZ: number
  ): number {
    const i = this.pAt(gridX)
    const j = this.pAt(gridX + 1)
    const k = this.pAt(i + gridY)
    const l = this.pAt(i + gridY + 1)
    const i1 = this.pAt(j + gridY)
    const j1 = this.pAt(j + gridY + 1)

    const d0 = this.gradDot(this.pAt(k + gridZ), deltaX, deltaY, deltaZ)
    const d1 = this.gradDot(this.pAt(i1 + gridZ), deltaX - 1, deltaY, deltaZ)
    const d2 = this.gradDot(this.pAt(l + gridZ), deltaX, deltaY - 1, deltaZ)
    const d3 = this.gradDot(
      this.pAt(j1 + gridZ),
      deltaX - 1,
      deltaY - 1,
      deltaZ
    )
    const d4 = this.gradDot(this.pAt(k + gridZ + 1), deltaX, deltaY, deltaZ - 1)
    const d5 = this.gradDot(
      this.pAt(i1 + gridZ + 1),
      deltaX - 1,
      deltaY,
      deltaZ - 1
    )
    const d6 = this.gradDot(
      this.pAt(l + gridZ + 1),
      deltaX,
      deltaY - 1,
      deltaZ - 1
    )
    const d7 = this.gradDot(
      this.pAt(j1 + gridZ + 1),
      deltaX - 1,
      deltaY - 1,
      deltaZ - 1
    )

    const u = smoothstep(deltaX)
    const v = smoothstep(deltaY)
    const w = smoothstep(deltaZ)

    return lerp3(u, v, w, d0, d1, d2, d3, d4, d5, d6, d7)
  }
}

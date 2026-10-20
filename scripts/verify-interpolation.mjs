// 验证线性插值/双线性插值的端点、范围和边界行为
// 运行：node scripts/verify-interpolation.mjs

const lerp = (start, end, t) => start + (end - start) * t

const VALUES = [0.2, 0.8, 0.35, 0.9, 0.55]

const linear = (x) => {
  const i = Math.floor(x)
  return lerp(VALUES[i], VALUES[i + 1], x - i)
}

const nearest = (x) => VALUES[Math.floor(x)]

const bilinear = (tx, tz, v00, v10, v01, v11) =>
  lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz)

console.log('一维线性插值：v0=0.2, v1=0.8')
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  console.log(`  t=${t.toFixed(2)} -> ${lerp(0.2, 0.8, t).toFixed(3)}`)
}

let min = Infinity
let max = -Infinity
for (let i = 0; i <= 1000; i++) {
  const value = lerp(0.2, 0.8, i / 1000)
  min = Math.min(min, value)
  max = Math.max(max, value)
}
console.log(`  t∈[0,1] 范围：${min.toFixed(3)}..${max.toFixed(3)}（不会超出两端）`)
console.log(
  `  端点检查：t=0 -> ${lerp(0.2, 0.8, 0).toFixed(3)}，t=1 -> ${lerp(0.2, 0.8, 1).toFixed(3)}`
)

console.log('\n最近邻 vs 线性：跨过 x=3')
const left = 3 - 1e-3
const right = 3 + 1e-3
console.log(
  `  最近邻：${nearest(left).toFixed(4)} -> ${nearest(right).toFixed(4)}，跳变 ${Math.abs(
    nearest(right) - nearest(left)
  ).toFixed(4)}`
)
console.log(
  `  线性：  ${linear(left).toFixed(4)} -> ${linear(right).toFixed(4)}，跳变 ${Math.abs(
    linear(right) - linear(left)
  ).toFixed(4)}`
)

console.log('\n双线性插值：四角检查')
const v00 = 0.2
const v10 = 0.8
const v01 = 0.4
const v11 = 0.9
const corners = [
  [0, 0, v00],
  [1, 0, v10],
  [0, 1, v01],
  [1, 1, v11]
]
for (const [tx, tz, expected] of corners) {
  const value = bilinear(tx, tz, v00, v10, v01, v11)
  console.log(
    `  (${tx},${tz}) -> ${value.toFixed(3)}，期望 ${expected.toFixed(3)}，${
      Math.abs(value - expected) < 1e-12 ? '通过' : '失败'
    }`
  )
}
console.log(
  `  中心 (0.5,0.5) -> ${bilinear(0.5, 0.5, v00, v10, v01, v11).toFixed(3)}`
)

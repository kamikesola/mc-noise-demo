export default {
  build: {
    // LegacyRandomSource 用 BigInt 做 48 位 LCG，构建目标需要 ES2020
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 2000
  }
}

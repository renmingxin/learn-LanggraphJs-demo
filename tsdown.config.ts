import { defineConfig } from 'tsdown'

export default defineConfig({
  // 把 src 下每个 ts 文件都作为独立入口，产出 dist/<文件名>.mjs
  entry: ['src/*.ts'],
})

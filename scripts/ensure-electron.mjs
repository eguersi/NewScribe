// 确保 Electron 运行时存在。
//
// 背景：pnpm 12 在某些情况下不会执行 electron 包的 postinstall（脚本被当作可跳过的
// 构建脚本，或命中了不完整的 side-effects 缓存），结果是 node_modules/electron/dist
// 不存在，`pnpm dev` / `pnpm dist:mac` 直接报找不到 Electron。
// 这里在 install 之后做一次兜底：缺了就调用 electron 自己的 install.js 下载。
//
// 只检查、不覆盖：dist 已存在时立刻退出，正常安装不会重复下载。

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

let packageDir
try {
  packageDir = dirname(require.resolve('electron/package.json'))
} catch {
  // 只装了部分依赖、或 --ignore-scripts 的场景，不算错误
  process.exit(0)
}

if (existsSync(join(packageDir, 'dist'))) process.exit(0)

console.log('[newscribe] 未找到 Electron 运行时，正在补下载…')

try {
  execFileSync(process.execPath, [join(packageDir, 'install.js')], {
    cwd: packageDir,
    stdio: 'inherit'
  })
} catch {
  console.error('')
  console.error('[newscribe] Electron 运行时下载失败。可以检查网络后重试，或手动执行：')
  console.error(`  node "${join(packageDir, 'install.js')}"`)
  console.error('')
  process.exit(1)
}

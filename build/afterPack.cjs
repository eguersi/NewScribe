// electron-builder afterPack 钩子：macOS 上没有签名证书时做 ad-hoc 签名
//
// 背景：
//   electron-builder 找不到 "Developer ID Application" 证书时会完全跳过签名，
//   产物只保留 Electron 自带的 linker-signed 标记（Info.plist 未绑定、资源未密封）。
//   这样的 .app 本机直接运行没问题，但一旦打进 DMG 被别人下载（带
//   com.apple.quarantine），macOS 会报“已损坏，无法打开”，右键“打开”也救不回来。
//
//   ad-hoc 签名（codesign -s -）不能让应用通过公证，但能把问题降级成
//   “未验证的开发者”：用户右键 → 打开，或 `xattr -dr com.apple.quarantine` 即可运行。
//
//   如果以后配置了真实证书（CSC_LINK / CSC_NAME / 钥匙串自动发现），
//   electron-builder 的签名步骤会在本钩子之后执行，覆盖掉这个 ad-hoc 签名，不会冲突。

const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })

  console.log(`  • ad-hoc signed  ${appPath}`)
}

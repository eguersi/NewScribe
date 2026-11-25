# 发布 NewScribe

本文说明如何从本地构建 Windows / macOS 安装包，并发布到 GitHub Releases。

## 版本号

版本号以 `package.json` 为准：

```json
"version": "0.1.1"
```

发布标签使用 `v` 前缀：

```text
v0.1.1
```

标签名、安装包文件名、应用内版本号必须一致。

## 构建 Windows

在 Windows 仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm dist:win
```

产物在：

```text
release/
```

需要上传：

```text
NewScribe-0.1.1-windows-x64-setup.exe
NewScribe-0.1.1-windows-x64-portable.exe
```

`setup.exe` 是安装版，`portable.exe` 是便携版。

当前 Windows 安装包未签名。发布说明中应明确提醒用户可能出现 SmartScreen“未知发布者”提示。

## 构建 macOS

在 Mac 仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm dist:mac
```

产物在：

```text
release/
```

需要上传：

```text
NewScribe-0.1.1-macos-arm64.dmg
NewScribe-0.1.1-macos-x64.dmg
```

如果同时生成 ZIP，也可以上传：

```text
NewScribe-0.1.1-macos-arm64.zip
NewScribe-0.1.1-macos-x64.zip
```

Apple Silicon 使用 `arm64`，Intel Mac 使用 `x64`。

正式分发需要：

1. Apple Developer Program
2. Developer ID Application 证书
3. 公证（notarization）
4. staple 票据

未签名或只做 ad-hoc 签名的 DMG 只能用于测试。详见 [MAC-HANDOFF.md](MAC-HANDOFF.md)。

## 命名规范

统一使用 ASCII、无空格、小写扩展名：

```text
NewScribe-<version>-windows-<arch>-setup.exe
NewScribe-<version>-windows-<arch>-portable.exe
NewScribe-<version>-macos-<arch>.dmg
NewScribe-<version>-macos-<arch>.zip
```

示例：

```text
NewScribe-0.1.1-windows-x64-setup.exe
NewScribe-0.1.1-windows-x64-portable.exe
NewScribe-0.1.1-macos-arm64.dmg
NewScribe-0.1.1-macos-x64.dmg
NewScribe-0.1.1-macos-arm64.zip
NewScribe-0.1.1-macos-x64.zip
```

不要使用：

```text
NewScribe 最终版.exe
新建文件夹/NewScribe.exe
setup(1).exe
```

GitHub Releases 会保留文件名，发布后不要重命名资产，否则下载链接会失效。

## 生成校验文件

Windows PowerShell：

```powershell
Get-ChildItem release\*.exe, release\*.dmg, release\*.zip |
  ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    "$hash  $($_.Name)"
  } | Set-Content release\SHA256SUMS.txt
```

macOS：

```bash
cd release
shasum -a 256 *.dmg *.zip > SHA256SUMS.txt
```

把 `SHA256SUMS.txt` 一起上传。用户可自行校验：

```bash
shasum -a 256 -c SHA256SUMS.txt
```

## 发布到 GitHub Releases

### 网页方式

1. 打开 <https://github.com/eguersi/NewScribe/releases/new>
2. Tag 填 `v0.1.1`
3. Target 选 `main`
4. 标题填 `NewScribe 0.1.1`
5. 上传 `release/` 里的安装包和 `SHA256SUMS.txt`
6. 先保存为 **Draft**，确认文件齐全后再 Publish
7. 正式版本不要勾选 **Pre-release**

### GitHub CLI 方式

```bash
gh release create v0.1.1 \
  release/NewScribe-0.1.1-windows-x64-setup.exe \
  release/NewScribe-0.1.1-windows-x64-portable.exe \
  release/SHA256SUMS.txt \
  --title "NewScribe 0.1.1" \
  --generate-notes
```

Mac 构建的 DMG 单独上传：

```bash
gh release upload v0.1.1 \
  release/NewScribe-0.1.1-macos-arm64.dmg \
  release/NewScribe-0.1.1-macos-x64.dmg
```

## Release Notes 模板

```markdown
# NewScribe 0.1.1

首个公开版本。

## 功能

- 手绘白板动画
- 图片、SVG、文字、图形、图表、表格、二维码
- 公式、分子结构、国际音标
- 镜头、手势、时间轴
- VideoScribe `.scribe` 导入
- MP4 导出

## 下载

- Windows 10/11 x64：`NewScribe-0.1.1-windows-x64-setup.exe`
- Windows 便携版：`NewScribe-0.1.1-windows-x64-portable.exe`
- macOS Apple Silicon：`NewScribe-0.1.1-macos-arm64.dmg`
- macOS Intel：`NewScribe-0.1.1-macos-x64.dmg`

## 说明

- Windows 安装包当前未签名，可能出现 SmartScreen 提示。
- macOS 安装包正式分发前需要 Developer ID 签名和公证。
- 校验文件：`SHA256SUMS.txt`

## License

MIT
```

## 发布前检查

- [ ] `package.json` 版本号正确
- [ ] Windows 安装包能安装、启动、卸载
- [ ] macOS DMG 能挂载、启动
- [ ] `.nscribe` 能打开
- [ ] `.nspkg` 能打开
- [ ] `.scribe` 能导入
- [ ] MP4 能导出并有声音
- [ ] 帮助窗口能打开
- [ ] `README.md` 和官网下载链接正确
- [ ] 上传 `SHA256SUMS.txt`
- [ ] Release 不是 Draft 后才算公开

## GitHub Pages

官网和帮助由 GitHub Pages 部署，工作流在：

```text
.github/workflows/pages.yml
```

仓库设置：

```text
Settings → Pages → Build and deployment → Source: GitHub Actions
```

发布地址：

```text
https://eguersi.github.io/NewScribe/
```

`docs/index.html` 是官网首页，`docs/help-web/` 是帮助。项目页不需要单独购买域名；`eguersi.github.io/NewScribe/` 是仓库页面，不是 `eguersi.github.io` 个人主页。

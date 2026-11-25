# NewScribe Mac 交接文档

这份文档给 Mac 上的 DeepSeek / 开发者使用。新会话没有之前的聊天记录，以本文件和仓库状态为准。

## 当前状态

- 版本：`0.1.1`
- 仓库：<https://github.com/eguersi/NewScribe>
- Releases：<https://github.com/eguersi/NewScribe/releases>
- 帮助网站：<https://eguersi.github.io/NewScribe/>
- 作者：祝鱼贵（Eguersi）
- 协议：MIT，见根目录 `LICENSE`
- 仓库根目录：GitHub 上的 `NewScribe` 仓库
- 仓库不含 `node_modules`、`out`、`release`、帮助 Markdown、测试源码、测试日志和临时文件
- 仓库只保留生成好的 HTML 帮助：`docs/help-web/`

## 一、把什么复制到 Mac

推荐复制整个：

```text
NewScribe/
```

不要把本地测试目录直接当作发布源；测试目录可能包含：

- Windows 的 `node_modules`
- `out`
- `release`
- 测试日志、测试视频、临时截图
- 帮助 Markdown 源文件

复制方式：

- 用 U 盘 / 移动硬盘 / 云盘传输
- 最好先压缩成 zip，再复制；这样隐藏文件 `.npmrc`、`.gitignore` 也会一起过去
- Mac 上解压后不要保留旧的 `node_modules`

## 二、Mac 环境

需要：

- macOS
- Node.js 22 或更新的 LTS
- pnpm 12.15.0（项目 `packageManager`）
- Xcode Command Line Tools

安装：

```bash
xcode-select --install
corepack enable
corepack prepare pnpm@12.15.0 --activate
node -v
pnpm -v
```

在仓库根目录执行：

```bash
pnpm install
pnpm typecheck
pnpm build
```

Windows 双击 `启动 NewScribe.cmd`，macOS 双击 `启动 NewScribe.command`。如果从 Windows 复制到 Mac 后双击没有反应，先在终端执行：

```bash
chmod +x "启动 NewScribe.command"
```

开发运行：

```bash
pnpm dev
```

`pnpm install` 会安装 Mac 对应的 Electron，不可以使用 Windows 的 `node_modules`。

关于依赖安装的两点（已经配置好，正常情况下不用管）：

- `pnpm-workspace.yaml` 里的 `allowBuilds` 允许 electron / esbuild 执行构建脚本，并显式跳过 electron-winstaller（electron-builder 的 Windows 专用依赖）。没有这个配置，pnpm 12 在 macOS 上会直接报 `ERR_PNPM_IGNORED_BUILDS` 让安装失败。
- `package.json` 的 `postinstall` 会调用 `scripts/ensure-electron.mjs`：如果 pnpm 跳过了 electron 的下载脚本、`node_modules/electron/dist` 是空的，它会自动补下载。用了 `--ignore-scripts` 安装的话需要手动执行 `node scripts/ensure-electron.mjs`。

## 三、Mac 图标

仓库已经带有：

```text
build/icon.icns
build/dmg-icon.icns
build/icon-nscribe-file.icns
build/icon-nspkg-file.icns
build/icon-scribe-file.icns
```

`electron-builder.yml` 中已配置应用图标和 DMG 磁盘卷图标：

```yaml
mac:
  icon: build/icon.icns

dmg:
  icon: build/dmg-icon.icns
```

后三个 `.icns` 是文件类型图标。macOS 的文件关联图标只认 `.icns`，只给 `.ico` 时
electron-builder 会报 `cannot find specified resource "build/icon-nspkg-file.icns"` 并中断打包。

如果这个 icns 在你的 Mac 上不显示，使用 `build/icon.png` 重新生成：

```bash
mkdir -p build/icon.iconset
sips -z 16 16   build/icon.png --out build/icon.iconset/icon_16x16.png
sips -z 32 32   build/icon.png --out build/icon.iconset/icon_16x16@2x.png
sips -z 32 32   build/icon.png --out build/icon.iconset/icon_32x32.png
sips -z 64 64   build/icon.png --out build/icon.iconset/icon_32x32@2x.png
sips -z 128 128 build/icon.png --out build/icon.iconset/icon_128x128.png
sips -z 256 256 build/icon.png --out build/icon.iconset/icon_128x128@2x.png
sips -z 256 256 build/icon.png --out build/icon.iconset/icon_256x256.png
sips -z 512 512 build/icon.png --out build/icon.iconset/icon_256x256@2x.png
sips -z 512 512 build/icon.png --out build/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/icon.png --out build/icon.iconset/icon_512x512@2x.png
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
```

## 四、Mac 打包

当前配置的 targets：

```yaml
mac:
  icon: build/icon.icns
  target:
    - dmg
    - zip
  category: public.app-category.video
```

构建：

```bash
pnpm dist:mac
```

这会先执行 `electron-vite build`，再让 electron-builder 生成 DMG/ZIP。

打包最后会执行 `build/afterPack.cjs`：没有签名证书时自动给 `.app` 做一次 ad-hoc 签名
（`codesign --force --deep --sign -`），并校验签名。原因见下一节。DMG 卷名由
`dmg.title` 控制，当前是 `NewScribe 0.1.1`。

默认会按当前 Mac 架构构建：

- Apple Silicon 机器通常得到 arm64
- Intel Mac 得到 x64

如果要同时支持 Intel 和 Apple Silicon，可以在 Mac 上分别构建：

```bash
pnpm exec electron-builder --mac --x64 --config electron-builder.yml
pnpm exec electron-builder --mac --arm64 --config electron-builder.yml
```

或者使用 universal 构建，但这会让安装包更大，并需要在 Mac 上验证两类架构。

## 五、Mac 签名和公证

**当前状态：ad-hoc 签名，未公证。**

electron-builder 找不到 “Developer ID Application” 证书时会完全跳过签名，产物只保留
Electron 自带的 linker-signed 标记（`Info.plist` 未绑定、资源未密封）。这样的 App：

- 自己本机打包、本机双击：正常
- 打进 DMG 被别人下载（带 `com.apple.quarantine`）：macOS 报 **“已损坏，无法打开”**，
  右键“打开”也救不回来

所以 `build/afterPack.cjs` 会补一次 ad-hoc 签名，把问题降级成“未验证的开发者”：
用户右键 → 打开，或执行

```bash
xattr -dr com.apple.quarantine /Applications/NewScribe.app
```

即可运行。这仍然不适合正式对外发布。

正式分发需要：

1. Apple Developer Program 账号（付费）
2. `Developer ID Application` 证书
3. 使用该证书签名 App（electron-builder 会自动覆盖掉 ad-hoc 签名）
4. 使用 Apple 的 notarization 服务公证
5. 将公证票据 staple 到 App/DMG

配置证书后可以把 `electron-builder.yml` 里的 `afterPack` 去掉，或保留也无妨——签名
步骤在 afterPack 之后执行，会覆盖 ad-hoc 签名。

环境变量方式示例（不要把密码提交到 Git）：

```bash
export CSC_LINK="/absolute/path/DeveloperIDApplication.p12"
export CSC_KEY_PASSWORD="证书密码"
export APPLE_ID="你的 Apple ID"
export APPLE_APP_SPECIFIC_PASSWORD="App 专用密码"
export APPLE_TEAM_ID="你的 Team ID"
pnpm dist:mac
```

如果证书已经安装到 macOS 钥匙串，可以让 electron-builder 自动查找，不一定需要 `CSC_LINK`。

注意：

- `APPLE_APP_SPECIFIC_PASSWORD` 不是 Apple ID 登录密码
- 不要把 `.p12`、密码、`.p8`、API key 提交到仓库
- 仓库不包含任何证书或签名配置
- 未公证的包只能用于内部测试

## 六、Windows 代码签名（供参考）

Windows 和 Mac 是两套证书体系。

当前 Windows 安装包没有签名，所以会出现 SmartScreen“未知发布者”提示。签名不会自动让所有用户立刻信任，但能证明发布者身份，并避免文件被篡改。

### 方案 A：Azure Trusted Signing

适合 CI / 自动化，证书由 Microsoft Azure 托管，不需要 USB 硬件令牌。

大致流程：

1. 准备 Azure 订阅
2. 创建 Trusted Signing 账户
3. 完成组织/个人身份验证
4. 创建 certificate profile
5. 在 electron-builder 中配置 Azure 签名
6. 在 GitHub Actions 中用 OIDC 或 Azure 凭据签名

electron-builder 26 的配置大致是：

```yaml
win:
  azureSignOptions:
    endpoint: https://weu.codesigning.azure.net/
    codeSigningAccountName: your-account
    certificateProfileName: your-profile
```

具体字段以你安装的 electron-builder 版本文档为准。

### 方案 B：传统 OV / EV 代码签名证书

从 CA（SSL.com、Certum、Sectigo 等）购买 Windows 代码签名证书。

拿到证书后，可能是：

- 硬件 USB token
- 云签名服务
- `.pfx` 文件（越来越少见）

如果是 `.pfx`：

```yaml
win:
  certificateFile: build/win-cert.pfx
  certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
  signingHashAlgorithms:
    - sha256
  rfc3161TimeStampServer: http://timestamp.digicert.com
```

更推荐用环境变量传证书：

```bash
export WIN_CSC_LINK="/absolute/path/cert.pfx"
export WIN_CSC_KEY_PASSWORD="证书密码"
pnpm dist:win
```

如果证书在 Windows 证书存储中，也可以使用证书主题或 SHA1 查找，但这种查找需要在 Windows 上执行。

### SmartScreen 说明

签名后仍可能需要一段时间积累 SmartScreen 信誉。不要把“购买 EV 证书”理解成立刻没有提示；现在 EV 和 OV 在 SmartScreen 信誉上的差异已经不像过去那样明显。

## 七、更新发布

当前应用菜单：

```text
帮助 → 检查更新
```

只是打开：

<https://github.com/eguersi/NewScribe/releases>

没有自动下载安装。

以后要做自动更新，可以：

1. 用 electron-builder 生成安装包
2. 上传安装包和 `latest.yml` 到 GitHub Releases
3. 引入 `electron-updater`
4. 启动时检查最新版本
5. 下载、校验、提示重启安装
6. Windows 需要代码签名，macOS 需要 Developer ID 签名 + 公证

自动更新不是当前版本的一部分，不要在交接时误以为已经开启。

## 八、Mac 上必须保留的东西

```text
src/
build/
  icon.icns
  icon-nscribe-file.icns
  icon-nspkg-file.icns
  icon-scribe-file.icns
  afterPack.cjs
  help-icon.png
  icon.png
docs/help-web/
scripts/ensure-electron.mjs
electron-builder.yml
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
LICENSE
README.md
启动 NewScribe.cmd
启动 NewScribe.command
```

不要删除 `build/menu`、图标、`build/afterPack.cjs` 和 `docs/help-web`；打包和帮助窗口需要它们。

## 九、Mac 上建议验证

```bash
pnpm typecheck
pnpm build
pnpm dev
```

打开应用后检查：

- 中英文界面
- 帮助窗口（中文/英文切换）
- 关于页中的 GitHub、Releases、MIT
- 菜单栏结构：`NewScribe | 文件 | 编辑 | 视图 | 帮助`（“文件”不能在 App 菜单里）
- 新建工程、保存、导出
- 导入 `.scribe` 测试文件
- 导入 `.scribe` 图表，确认折线图、条形图、饼图成为可编辑图表
- 导出 MP4
- Mac 应用图标和 DMG 图标
- 在 Finder 里双击 `.nscribe` / `.nspkg` 文件，工程应当被打开

## 十、仓库清理说明

仓库已排除：

- `node_modules`
- `out`
- `release`
- 测试视频、测试截图、测试日志
- 根目录临时脚本
- 帮助 Markdown
- 旧截图和未使用的构建预览
- `desktop.ini`

Windows 安装版会显示自定义侧栏图片和安装程序图标。Windows 安装向导会提供：

- 关联 `.scribe` 文件
- 创建桌面快捷方式

`desktop.ini` 由 `build/installer.nsh` 在安装时生成，不在仓库中。Mac 不使用这个文件。

GitHub Pages 的静态帮助站点配置在 `.github/workflows/pages.yml`，入口是 `docs/index.html`，部署后地址为：

<https://eguersi.github.io/NewScribe/>

## 十一、Windows 文件夹图标

Windows NSIS 安装版会执行 `build/installer.nsh`：

- 写入 `$INSTDIR\desktop.ini`
- 指向 `resources\folder.ico`
- 设置隐藏/系统属性
- 让安装目录显示 NewScribe 文件夹图标

安装页面还会生成两个复选框：

- 关联 `.scribe` 文件
- 创建桌面快捷方式

卸载时先显示确认框：

```text
是否确认卸载 NewScribe？
```

`desktop.ini` 已加入 `.gitignore`，不应提交。

portable 版不会执行安装脚本，所以没有这个文件夹图标。macOS 的 `.app` 图标来自 App bundle 的 `icon.icns`；Finder 自定义文件夹图标是另一套机制，本版本没有实现。

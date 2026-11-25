#!/bin/bash
# NewScribe · macOS 启动脚本
#
# 用法：
#   在 Finder 里双击本文件；或从终端运行：
#     ./启动\ NewScribe.command              # 运行已构建版本（默认，最快）
#     ./启动\ NewScribe.command --dev        # 开发模式，改代码自动热更新
#     ./启动\ NewScribe.command --rebuild    # 先重新构建再运行
#
# Windows 用「启动 NewScribe.cmd」，macOS 用这个。

set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/Library/Logs/NewScribe"
LOG_FILE="$LOG_DIR/launcher.log"

mkdir -p "$LOG_DIR" 2>/dev/null || true

MODE="run"
for arg in "$@"; do
  case "$arg" in
    --dev|dev)      MODE="dev" ;;
    --rebuild|-b)   MODE="rebuild" ;;
    --help|-h)      MODE="help" ;;
  esac
done

if [ "$MODE" = "help" ]; then
  sed -n '2,11p' "${BASH_SOURCE[0]}"
  exit 0
fi

# Finder 里双击时 PATH 很简陋，补齐常见安装位置
export PATH="$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/node/bin:$PATH"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
# 如果当前环境设置了 ELECTRON_RUN_AS_NODE，Electron 会退化成 Node，
# 表现是“点了没反应”。必须清掉。
unset ELECTRON_RUN_AS_NODE

cd "$APP_DIR" || { echo "找不到项目目录：$APP_DIR"; exit 1; }

say() { printf '%s\n' "$*"; }
die() {
  printf '\n[错误] %s\n\n' "$*"
  printf '按回车键关闭窗口…'
  read -r _ || true
  exit 1
}

# Finder 启动时 /bin/zsh 里通常有 nvm、fnm、volta 配好的 PATH
if ! command -v node >/dev/null 2>&1; then
  EXTRA_PATH="$(/bin/zsh -lc 'printf "%s" "$PATH"' 2>/dev/null || true)"
  [ -n "$EXTRA_PATH" ] && export PATH="$EXTRA_PATH:$PATH"
fi

say "=============================================="
say " NewScribe · macOS"
say " 目录：$APP_DIR"
say "=============================================="

command -v node >/dev/null 2>&1 || die "没有找到 Node.js。请先安装 Node 22 或更新的 LTS。"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  die "当前 Node 版本是 $(node -v)，需要 Node 20 或更高（推荐 22 LTS）。"
fi
say "Node $(node -v)"

if command -v pnpm >/dev/null 2>&1; then
  PNPM="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM="corepack pnpm"
  say "使用 corepack 提供的 pnpm"
else
  die "没有找到 pnpm。请执行：corepack enable"
fi
say "pnpm $($PNPM -v 2>/dev/null || echo '?')"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/electron ]; then
  say ""
  say "首次使用，正在安装依赖（需要联网，约几分钟）…"
  $PNPM install || die "pnpm install 失败，请查看上面的报错。"
fi

ELECTRON_PKG_DIR="$(node -e 'const p=require.resolve("electron/package.json");process.stdout.write(require("path").dirname(p))' 2>/dev/null || true)"
[ -n "$ELECTRON_PKG_DIR" ] || die "node_modules 里没有 electron，请删除 node_modules 后重试。"
if [ ! -d "$ELECTRON_PKG_DIR/dist" ]; then
  say "正在下载 Electron 运行时…"
  ( cd "$ELECTRON_PKG_DIR" && node install.js ) || die "Electron 下载失败（网络问题？可设置镜像 ELECTRON_MIRROR）。"
fi

if [ "$MODE" = "rebuild" ] || [ ! -f out/main/index.js ] || [ ! -f out/renderer/index.html ]; then
  say ""
  say "正在构建…"
  $PNPM build || die "构建失败，请查看上面的报错。"
fi

if [ "$MODE" = "dev" ]; then
  say ""
  say "开发模式启动（改代码自动热更新，Ctrl+C 结束）…"
  say ""
  $PNPM dev 2>&1 | tee -a "$LOG_FILE"
  EXIT_CODE=${PIPESTATUS[0]}
else
  say ""
  say "启动应用…（关闭应用后按 Cmd+Q 退出本终端窗口）"
  say ""
  ./node_modules/.bin/electron . 2>&1 | tee -a "$LOG_FILE"
  EXIT_CODE=${PIPESTATUS[0]}
fi

if [ "$EXIT_CODE" -ne 0 ]; then
  say ""
  say "[应用退出，退出码 $EXIT_CODE] 日志：$LOG_FILE"
  say "按回车键关闭窗口…"
  read -r _ || true
fi

exit "$EXIT_CODE"

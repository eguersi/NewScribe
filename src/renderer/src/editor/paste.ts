import { createElementFromAsset, createTextElement } from '@shared/project'
import { assetFromPath, createAssetRuntime } from './assets'
import { loadSettings } from './settings'
import { useEditorStore } from './store'

const MAX_TEXT_LENGTH = 5000
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i

function fittedRect(
  store: ReturnType<typeof useEditorStore.getState>,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const canvas = store.project.canvas
  const view = store.viewSize
  const currentScale = Math.max(0.02, store.viewport.scale)
  const maxWidth = view.width > 0 ? (view.width * 0.6) / currentScale : canvas.width * 0.6
  const maxHeight = view.height > 0 ? (view.height * 0.6) / currentScale : canvas.height * 0.6
  const scale = Math.min(maxWidth / Math.max(1, width), maxHeight / Math.max(1, height), 1)
  const finalWidth = width * scale
  const finalHeight = height * scale
  const centerX =
    view.width > 0 ? (view.width / 2 - store.viewport.tx) / currentScale : canvas.width / 2
  const centerY =
    view.height > 0 ? (view.height / 2 - store.viewport.ty) / currentScale : canvas.height / 2
  return {
    x: centerX - finalWidth / 2,
    y: centerY - finalHeight / 2,
    width: finalWidth,
    height: finalHeight
  }
}

function isSvgMarkup(text: string): boolean {
  const value = text.replace(/^\uFEFF/, '').trim()
  if (!/^(?:<\?xml[\s\S]*?\?>\s*)?<svg(?:\s|>)/i.test(value)) return false
  try {
    const document = new DOMParser().parseFromString(value, 'image/svg+xml')
    return document.documentElement.localName.toLowerCase() === 'svg' &&
      !document.querySelector('parsererror')
  } catch {
    return false
  }
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('newscribe:toast', { detail: message }))
}

function withCurrentCamera(
  element: ReturnType<typeof createElementFromAsset>,
  store: ReturnType<typeof useEditorStore.getState>
): ReturnType<typeof createElementFromAsset> {
  const view = store.viewSize
  if (view.width <= 0) return element
  return {
    ...element,
    camera: {
      ...element.camera,
      zoom: Math.max(0.05, (store.project.canvas.width * store.viewport.scale) / view.width)
    }
  }
}

interface ClipboardSnapshot {
  imageDataUrl: string
  text: string
  files: string[]
  imageFile: string | undefined
  signature: string
  supported: boolean
}

let lastExternalSignature: string | null = null
let lastExternalChangeAt = 0
let lastLightSignature: string | null = null

function signatureOf(
  imageDataUrl: string,
  text: string,
  files: string[]
): string {
  return [
    imageDataUrl ? `image:${imageDataUrl.length}:${imageDataUrl.slice(0, 64)}:${imageDataUrl.slice(-64)}` : '',
    `text:${text}`,
    `files:${files.join('|')}`
  ].join('\u0000')
}

async function readClipboardSnapshot(): Promise<ClipboardSnapshot> {
  const imageDataUrl = (await window.newscribe.readClipboardImage()) ?? ''
  const text = (await window.newscribe.readClipboardText()) ?? ''
  const files = await window.newscribe.readClipboardFiles()
  const imageFile = files.find((path) => IMAGE_FILE.test(path))
  return {
    imageDataUrl,
    text,
    files,
    imageFile,
    signature: signatureOf(imageDataUrl, text, files),
    supported: Boolean(imageDataUrl || imageFile || text.trim())
  }
}

/**
 * 监听外部剪贴板的变化时间。内部复制的元素不会改写系统剪贴板，
 * 因此用“外部签名变化”判断外部内容是否比内部复制更新。
 */
export function startClipboardObserver(): () => void {
  let disposed = false
  const initial = async (): Promise<void> => {
    const snapshot = await readClipboardSnapshot()
    if (disposed) return
    lastExternalSignature = snapshot.signature
    lastExternalChangeAt = 0
    lastLightSignature = `text:${snapshot.text}\u0000files:${snapshot.files.join('|')}`
  }
  void initial()
  const timer = window.setInterval(() => {
    if (disposed || document.querySelector('.preview-overlay')) return
    void (async () => {
      const text = await window.newscribe.readClipboardText()
      const files = await window.newscribe.readClipboardFiles()
      if (disposed) return
      const light = `text:${text}\u0000files:${files.join('|')}`
      if (light === lastLightSignature) return
      lastLightSignature = light
      lastExternalChangeAt = Date.now()
      const snapshot = await readClipboardSnapshot()
      if (disposed) return
      lastExternalSignature = snapshot.signature
    })()
  }, 900)
  return () => {
    disposed = true
    window.clearInterval(timer)
  }
}

export async function pasteExternal(): Promise<void> {
  if (document.querySelector('.preview-overlay')) return
  const store = useEditorStore.getState()
  const snapshot = await readClipboardSnapshot()
  const internalAt = store.clipboardInternalAt
  const hasInternal = store.hasClipboard()

  if (lastExternalSignature !== null && snapshot.signature !== lastExternalSignature) {
    lastExternalChangeAt = Date.now()
  }
  lastExternalSignature = snapshot.signature

  if (!snapshot.supported) {
    if (hasInternal) store.pasteClipboard()
    return
  }

  // 内部复制不会改写系统剪贴板，所以比较内部复制时间与外部签名变化时间。
  if (hasInternal && internalAt > 0 && internalAt >= lastExternalChangeAt) {
    store.pasteClipboard()
    return
  }

  if (snapshot.imageDataUrl) {
    try {
      const bytes = new Uint8Array(await (await fetch(snapshot.imageDataUrl)).arrayBuffer())
      const runtime = await createAssetRuntime({
        name: '剪贴板图片',
        mime: 'image/png',
        bytes
      })
      store.registerAsset(runtime)
      const rect = fittedRect(store, runtime.asset.width, runtime.asset.height)
      store.addElement(withCurrentCamera(createElementFromAsset(runtime.asset, rect), store))
      return
    } catch {
      // 失败时继续尝试文本
    }
  }

  if (snapshot.imageFile) {
    try {
      const runtime = await assetFromPath(snapshot.imageFile)
      store.registerAsset(runtime)
      void window.newscribe.addRecentAsset({
        path: snapshot.imageFile,
        name: runtime.asset.name
      })
      const rect = fittedRect(store, runtime.asset.width, runtime.asset.height)
      store.addElement(withCurrentCamera(createElementFromAsset(runtime.asset, rect), store))
      return
    } catch {
      // 继续尝试文本
    }
  }

  if (snapshot.text && snapshot.text.trim()) {
    if (isSvgMarkup(snapshot.text)) {
      try {
        const bytes = new TextEncoder().encode(snapshot.text.replace(/^\uFEFF/, '').trim())
        const runtime = await createAssetRuntime({
          name: '粘贴的 SVG.svg',
          mime: 'image/svg+xml',
          bytes
        })
        store.registerAsset(runtime)
        const rect = fittedRect(store, runtime.asset.width, runtime.asset.height)
        store.addElement(withCurrentCamera(createElementFromAsset(runtime.asset, rect), store))
        toast(
          runtime.asset.svgAnimated
            ? '检测到 SVG 声明式动画，当前版本暂不支持播放'
            : '已经识别 SVG 代码'
        )
        return
      } catch {
        // 识别为 SVG 但创建失败时，继续按普通文字处理
      }
    }
    if (snapshot.text.length > MAX_TEXT_LENGTH) {
      window.alert(
        `剪贴板文字太长（${snapshot.text.length} 字），超过 ${MAX_TEXT_LENGTH} 字上限，没有粘贴。`
      )
      return
    }
    const canvas = store.project.canvas
    const view = store.viewSize
    const scale = Math.max(0.02, store.viewport.scale)
    const width =
      view.width > 0 ? (view.width * 0.42) / scale : canvas.width * 0.6
    const height = Math.max(8, width * 0.26)
    const center =
      view.width > 0
        ? {
            x: (view.width / 2 - store.viewport.tx) / scale,
            y: (view.height / 2 - store.viewport.ty) / scale
          }
        : { x: canvas.width / 2, y: canvas.height / 2 }
    const element = createTextElement(
      {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height
      },
      snapshot.text.trim()
    )
    if (element.text) {
      element.text.fontSize = Math.max(1, Math.min(140, width * 0.1))
      element.text.fontFamily = loadSettings().defaultTextFont || element.text.fontFamily
    }
    store.addElement(element)
    return
  }

  if (store.hasClipboard()) {
    store.pasteClipboard()
  }
}

import type { Asset, SceneElement } from '@shared/project'

export interface AnimatedImageFrame {
  image: ImageBitmap
  duration: number
}

export interface AssetAnimation {
  frames: AnimatedImageFrame[]
  total: number
}

export interface AssetRuntime {
  asset: Asset
  bytes: Uint8Array
  blobUrl: string
  image: HTMLImageElement | null
  buffer?: AudioBuffer
  animation?: AssetAnimation
  /** 按字体覆盖重新栅格化的 SVG 图片 */
  svgFontImages?: Map<string, HTMLImageElement>
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac'
}

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : 'png'
}

export function mimeForName(name: string): string {
  return MIME_BY_EXT[extensionOf(name)] ?? 'application/octet-stream'
}

export function isSvgName(name: string): boolean {
  return extensionOf(name) === 'svg'
}

export function isAudioName(name: string): boolean {
  return AUDIO_EXTENSIONS.has(extensionOf(name))
}

let sharedAudioContext: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext) sharedAudioContext = new AudioContext()
  return sharedAudioContext
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice()
  const digest = await crypto.subtle.digest('SHA-256', copy)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function hasSvgText(source: string): boolean {
  try {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml')
    return Boolean(document.querySelector('text, tspan, textPath'))
  } catch {
    return false
  }
}

export function imageForElement(
  element: SceneElement,
  runtime: AssetRuntime | undefined
): HTMLImageElement | null {
  if (!runtime) return null
  if (element.kind === 'svg' && element.svgFontFamily) {
    return runtime.svgFontImages?.get(element.svgFontFamily) ?? runtime.image
  }
  return runtime.image
}

/** 重新栅格化 SVG，只覆盖 text/tspan 的字体。 */
export async function createSvgFontImage(
  runtime: AssetRuntime,
  fontFamily: string
): Promise<HTMLImageElement | null> {
  if (!fontFamily.trim() || !runtime.asset.svgHasText) return null
  try {
    const source = new TextDecoder().decode(runtime.bytes)
    const document = new DOMParser().parseFromString(source, 'image/svg+xml')
    const nodes = Array.from(document.querySelectorAll('text, tspan, textPath'))
    if (nodes.length === 0) return null
    const escaped = fontFamily.replace(/["\\]/g, '')
    for (const node of nodes) {
      node.setAttribute('font-family', escaped)
      const style = node.getAttribute('style') ?? ''
      node.setAttribute('style', `${style};font-family:"${escaped}" !important`)
    }
    const serialized = new XMLSerializer().serializeToString(document)
    const raster = boundSvgRaster(serialized, 3072)
    const url = URL.createObjectURL(new Blob([raster], { type: 'image/svg+xml' }))
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('无法渲染 SVG 字体'))
      image.src = url
    })
    URL.revokeObjectURL(url)
    return image
  } catch {
    return null
  }
}

function parseSvgSize(source: string): { width: number; height: number } | null {
  const viewBox = source.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] }
    }
  }
  const width = source.match(/\bwidth\s*=\s*["']([\d.]+)(?!%)/i)
  const height = source.match(/\bheight\s*=\s*["']([\d.]+)(?!%)/i)
  if (width && height) {
    return { width: Number(width[1]), height: Number(height[1]) }
  }
  return null
}

function hasSvgDeclarativeAnimation(source: string): boolean {
  try {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml')
    if (document.querySelector('parsererror')) return false
    if (
      document.querySelector(
        'animate, animateTransform, animateMotion, animateColor, set'
      )
    ) {
      return true
    }
    const animationCss = /(?:-webkit-)?animation(?:-name)?\s*:|@keyframes\b/i
    for (const style of Array.from(document.querySelectorAll('style, [style]'))) {
      const css =
        style.tagName.toLowerCase() === 'style'
          ? style.textContent ?? ''
          : style.getAttribute('style') ?? ''
      if (animationCss.test(css)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 把 SVG 的「栅格化尺寸」限制在 maxSide 以内，避免 4000×5000 这类地图
 * 一导入就生成 90 MB 的位图，拖一下就卡。
 * viewBox 不变，所以元素在世界里的逻辑尺寸不受影响。
 */
function boundSvgRaster(source: string, maxSide: number): string {
  try {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
    const svg = doc.documentElement
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return source

    const viewBoxAttr = svg.getAttribute('viewBox')
    let baseWidth = 0
    let baseHeight = 0
    if (viewBoxAttr) {
      const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number)
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        baseWidth = parts[2]
        baseHeight = parts[3]
      }
    }
    if (!(baseWidth > 0) || !(baseHeight > 0)) {
      const rawWidth = svg.getAttribute('width') ?? ''
      const rawHeight = svg.getAttribute('height') ?? ''
      baseWidth = rawWidth.includes('%') ? 800 : Number.parseFloat(rawWidth) || 800
      baseHeight = rawHeight.includes('%') ? 600 : Number.parseFloat(rawHeight) || 600
      svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`)
    }

    const scale = Math.min(1, maxSide / Math.max(baseWidth, baseHeight))
    svg.setAttribute('width', String(Math.max(1, Math.round(baseWidth * scale))))
    svg.setAttribute('height', String(Math.max(1, Math.round(baseHeight * scale))))
    return new XMLSerializer().serializeToString(doc)
  } catch {
    return source
  }
}

async function decodeAnimatedImage(
  bytes: Uint8Array,
  mime: string
): Promise<AssetAnimation | null> {
  if (!/^image\/(gif|webp)$/i.test(mime)) return null
  const ImageDecoderCtor = (globalThis as { ImageDecoder?: any }).ImageDecoder
  if (!ImageDecoderCtor) return null
  if (ImageDecoderCtor.isTypeSupported && !ImageDecoderCtor.isTypeSupported(mime)) return null
  try {
    const decoder = new ImageDecoderCtor({ data: bytes.slice(), type: mime })
    await decoder.tracks.ready
    const track = decoder.tracks.selectedTrack
    const count = track?.frameCount ?? 0
    if (!(count > 1)) {
      decoder.close()
      return null
    }
    const frames: AnimatedImageFrame[] = []
    let total = 0
    for (let index = 0; index < count; index += 1) {
      const { image } = await decoder.decode({ frameIndex: index })
      const duration = Math.max(0.02, (image.duration ?? 100000) / 1_000_000)
      const bitmap = await createImageBitmap(image)
      image.close()
      frames.push({ image: bitmap, duration })
      total += duration
    }
    decoder.close()
    return frames.length > 1 ? { frames, total } : null
  } catch {
    return null
  }
}

export async function createAssetRuntime(input: {
  name: string
  mime?: string
  bytes: Uint8Array
  originalPath?: string
}): Promise<AssetRuntime> {
  if (isAudioName(input.name)) {
    return createAudioRuntime(input)
  }

  const mime = input.mime || mimeForName(input.name)
  const svg = isSvgName(input.name) || mime === 'image/svg+xml'
  let svgSource = ''
  let rasterBytes = input.bytes
  if (svg) {
    try {
      svgSource = new TextDecoder().decode(input.bytes)
      rasterBytes = new TextEncoder().encode(boundSvgRaster(svgSource, 3072))
    } catch {
      rasterBytes = input.bytes
    }
  }

  const blob = new Blob([rasterBytes.slice()], { type: mime })
  const blobUrl = URL.createObjectURL(blob)

  const image = new Image()
  image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`无法解码素材：${input.name}`))
    image.src = blobUrl
  })
  try {
    await image.decode()
  } catch {
    // 某些 SVG 不支持 decode()，忽略
  }

  let width = image.naturalWidth
  let height = image.naturalHeight
  if (svg) {
    const parsed = parseSvgSize(new TextDecoder().decode(input.bytes))
    if (parsed) {
      width = parsed.width
      height = parsed.height
    }
  }
  if (!(width > 1) || !(height > 1)) {
    width = 600
    height = 400
  }

  const hash = await sha256Hex(input.bytes)
  const animation = svg ? null : await decodeAnimatedImage(input.bytes, mime)
  const asset: Asset = {
    id: crypto.randomUUID(),
    kind: svg ? 'svg' : 'image',
    name: input.name,
    mime,
    file: '',
    width,
    height,
    hash,
    originalPath: input.originalPath,
    animated: Boolean(animation),
    frameCount: animation?.frames.length ?? 1,
    svgAnimated: svg ? hasSvgDeclarativeAnimation(svgSource) : false,
    svgHasText: svg ? hasSvgText(svgSource) : false
  }

  return { asset, bytes: input.bytes, blobUrl, image, animation: animation ?? undefined }
}

export async function createAudioRuntime(input: {
  name: string
  mime?: string
  bytes: Uint8Array
  originalPath?: string
}): Promise<AssetRuntime> {
  const mime = input.mime || mimeForName(input.name)
  const blobUrl = URL.createObjectURL(new Blob([input.bytes.slice()], { type: mime }))
  const copy = input.bytes.slice()
  const audioBuffer = await getAudioContext().decodeAudioData(copy.buffer as ArrayBuffer)
  const hash = await sha256Hex(input.bytes)
  const asset: Asset = {
    id: crypto.randomUUID(),
    kind: 'audio',
    name: input.name,
    mime,
    file: '',
    width: 0,
    height: 0,
    hash,
    originalPath: input.originalPath
  }
  return { asset, bytes: input.bytes, blobUrl, image: null, buffer: audioBuffer }
}

export async function assetFromPath(path: string): Promise<AssetRuntime> {
  const bytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
  const name = window.newscribe.path.basename(path)
  return createAssetRuntime({ name, bytes, originalPath: path })
}

export async function assetFromFile(file: File): Promise<AssetRuntime> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return createAssetRuntime({ name: file.name, mime: file.type || undefined, bytes })
}

export function releaseAsset(runtime: AssetRuntime): void {
  URL.revokeObjectURL(runtime.blobUrl)
  for (const frame of runtime.animation?.frames ?? []) frame.image.close()
}

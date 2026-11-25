import { strFromU8, unzipSync } from 'fflate'
import {
  createElementFromAsset,
  createEmptyProject,
  createTextElement,
  type ChartKind,
  type ChartSpec,
  type Project,
  type SceneElement
} from '@shared/project'
import { createAssetRuntime, type AssetRuntime } from './assets'
import { useEditorStore } from './store'

const MAX_SCRIBE_BYTES = 200 * 1024 * 1024

function num(value: string | null, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function colorFromDecimal(value: string | null, fallback: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rgb = (parsed >>> 0) & 0xffffff
  return `#${rgb.toString(16).padStart(6, '0')}`
}

function findEntry(entries: Record<string, Uint8Array>, name: string): Uint8Array | undefined {
  const lower = name.toLowerCase()
  const key = Object.keys(entries).find((entry) => entry.toLowerCase() === lower)
  return key ? entries[key] : undefined
}

function lengthToPx(value: string | null, fallback: number): number {
  if (!value) return fallback
  const match = value.trim().match(/^([\d.]+)\s*(px|mm|cm|in|pt|pc)?$/i)
  if (!match) return fallback
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return fallback
  const unit = (match[2] ?? 'px').toLowerCase()
  const factor =
    unit === 'mm'
      ? 96 / 25.4
      : unit === 'cm'
        ? 96 / 2.54
        : unit === 'in'
          ? 96
          : unit === 'pt'
            ? 96 / 72
            : unit === 'pc'
              ? 16
              : 1
  return amount * factor
}

function svgSize(svg: string): { width: number; height: number } {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    const viewBox = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
    return {
      width: lengthToPx(root.getAttribute('width'), viewBox[2] || 1024) || 1024,
      height: lengthToPx(root.getAttribute('height'), viewBox[3] || 768) || 768
    }
  } catch {
    return { width: 1024, height: 768 }
  }
}

function textFromHtml(html: string): {
  content: string
  fontFamily: string
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
} {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const font = doc.querySelector('font')
    const paragraph = doc.querySelector('p')
    const alignValue = (paragraph?.getAttribute('align') ?? 'left').toLowerCase()
    const align = alignValue === 'center' || alignValue === 'right' ? alignValue : 'left'
    return {
      content: doc.body.textContent?.trim() || '文字',
      fontFamily: font?.getAttribute('face') || 'Microsoft YaHei',
      fontSize: Math.max(24, Math.min(140, (num(font?.getAttribute('size') ?? null, 18) || 18) * 3.2)),
      color: font?.getAttribute('color') || '#1f2937',
      align
    }
  } catch {
    return {
      content: '文字',
      fontFamily: 'Microsoft YaHei',
      fontSize: 64,
      color: '#1f2937',
      align: 'left'
    }
  }
}

function chartKindFromDesc(descName: string): ChartKind | null {
  if (descName === 'chart-line') return 'line'
  if (descName === 'chart-bar') return 'bar'
  if (descName === 'chart-pie') return 'pie'
  return null
}

function csvValues(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function chartFromDrawingText(drawingText: string, kind: ChartKind): ChartSpec | null {
  try {
    const doc = new DOMParser().parseFromString(drawingText, 'application/xml')
    const data = doc.querySelector('data')
    if (!data) return null
    const values = csvValues(data.getAttribute('values')).map(Number)
    if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return null
    const labels = csvValues(data.getAttribute('labels'))
    const normalizedLabels = values.map((_, index) => labels[index] || String(index + 1))
    return {
      kind,
      title: '',
      labels: normalizedLabels,
      series: [
        {
          name: '',
          color: '#f5a524',
          values
        }
      ],
      showLegend: false,
      showValues: data.getAttribute('displayValues') === 'yes',
      showAxis: kind !== 'pie'
    }
  } catch {
    return null
  }
}

export async function importScribeFile(path: string): Promise<void> {
  const bytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
  if (bytes.length > MAX_SCRIBE_BYTES) throw new Error('工程文件超过 200MB，暂不支持')

  const entries = unzipSync(bytes)
  const xmlBytes = findEntry(entries, 'drawing.xml')
  if (!xmlBytes) throw new Error('这个 .scribe 里没有 drawing.xml')

  const xml = strFromU8(xmlBytes)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (!root || root.nodeName === 'parsererror') throw new Error('drawing.xml 解析失败')

  const optionsDoc = new DOMParser().parseFromString(
    root.getAttribute('options') ?? '',
    'application/xml'
  )
  const options = optionsDoc.documentElement
  const canvas = createEmptyProject().canvas
  canvas.width = 1920
  canvas.height = 1080
  canvas.background = colorFromDecimal(options.getAttribute('paperColour'), '#ffffff')

  const elements: SceneElement[] = []
  const runtimes: AssetRuntime[] = []
  const rawElements = Array.from(root.querySelectorAll('element')).sort(
    (a, b) => num(a.getAttribute('zIndex')) - num(b.getAttribute('zIndex'))
  )

  const firstCameraWidth = rawElements.length
    ? num(rawElements[0].getAttribute('cameraCanvasWid'), 1185.78)
    : 1185.78
  // VideoScribe 的工作区不是相机画布：相机画布约 1186×667，
  // 实际工程工作区按 1600×900 处理，缩略图比例也符合这个基准。
  const workspaceWidth = 1600
  const factor = canvas.width / workspaceWidth

  for (let index = 0; index < rawElements.length; index += 1) {
    const node = rawElements[index]
    const type = node.getAttribute('elementType') ?? 'drawing'
    if (node.getAttribute('visible') === 'false') continue

    const target = num(node.getAttribute('targetTime'), 3000) / 1000
    const pause = num(node.getAttribute('pauseTime'), 0) / 1000
    const transition = num(node.getAttribute('transitionTime'), 500) / 1000
    const opacity = num(node.getAttribute('opacity'), 1)
    const rotation = num(node.getAttribute('rotation'), 0)
    const centerX = num(node.getAttribute('currentPosX')) * factor
    const centerY = num(node.getAttribute('currentPosY')) * factor
    const cameraCanvasWidth = num(node.getAttribute('cameraCanvasWid'), firstCameraWidth)
    const zoomBase = workspaceWidth / (cameraCanvasWidth > 100 ? cameraCanvasWidth : 1185.78)
    const cameraRawX = node.getAttribute('cameraPositionX')
    const cameraRawY = node.getAttribute('cameraPositionY')
    const cameraRawZoom = node.getAttribute('cameraScale')
    const hasCamera =
      Boolean(cameraRawX) &&
      Boolean(cameraRawY) &&
      cameraRawX !== 'null' &&
      cameraRawY !== 'null' &&
      Number.isFinite(Number(cameraRawX)) &&
      Number.isFinite(Number(cameraRawY))
    const cameraX = (num(cameraRawX) + num(node.getAttribute('currentPosX'))) * factor
    const cameraY = (num(cameraRawY) + num(node.getAttribute('currentPosY'))) * factor
    const zoomValue =
      cameraRawZoom && cameraRawZoom !== 'null' && Number.isFinite(Number(cameraRawZoom))
        ? Number(cameraRawZoom)
        : 1
    const cameraZoom = Math.max(0.1, zoomValue * zoomBase)
    const camera = hasCamera
      ? { x: cameraX, y: cameraY, zoom: cameraZoom }
      : { x: centerX, y: centerY, zoom: zoomBase }

    if (type === 'drawing') {
      const svg = node.getAttribute('drawingXML') ?? ''
      if (!svg.includes('<svg')) continue
      const size = svgSize(svg)
      const targetMax = num(node.getAttribute('targetHeight'), 800) || 800
      const normalize = targetMax / Math.max(1, size.width, size.height)
      const width = Math.max(20, size.width * normalize * num(node.getAttribute('scalesX'), 0.4))
      const height = Math.max(20, size.height * normalize * num(node.getAttribute('scalesY'), 0.4))
      const descName = node.getAttribute('descName')?.trim() || ''
      const chartKind = chartKindFromDesc(descName)
      if (chartKind) {
        const chart = chartFromDrawingText(node.getAttribute('drawingText') ?? '', chartKind)
        if (chart) {
          elements.push({
            id: crypto.randomUUID(),
            assetId: '',
            kind: 'chart',
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            rotation,
            opacity,
            hand: 'none',
            chart,
            camera,
            appear: { kind: 'chart', duration: Math.max(0.1, target), easing: 'easeOut' },
            hold: Math.max(0, pause),
            disappear: 0,
            transition: { duration: Math.max(0, transition), easing: 'easeInOut' }
          })
          continue
        }
      }
      const name = descName || `图形 ${index + 1}`
      const runtime = await createAssetRuntime({
        name: `${name}.svg`,
        mime: 'image/svg+xml',
        bytes: new TextEncoder().encode(svg)
      })
      runtimes.push(runtime)
      const element = createElementFromAsset(runtime.asset, {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height
      })
      elements.push({
        ...element,
        rotation,
        opacity,
        hand:
          (node.getAttribute('customHandMD5') ?? '').includes('nohand') ? 'none' : 'default',
        camera: { x: cameraX, y: cameraY, zoom: cameraZoom },
        appear: { kind: 'draw', duration: Math.max(0.1, target), easing: 'easeOut' },
        hold: Math.max(0, pause),
        disappear: 0,
        transition: { duration: Math.max(0, transition), easing: 'easeInOut' }
      })
    } else if (type === 'split_text') {
      const parsed = textFromHtml(node.getAttribute('drawingText') ?? '')
      const width = Math.max(220, parsed.content.length * parsed.fontSize * 0.95)
      const height = Math.max(80, parsed.fontSize * 1.7)
      const element = createTextElement(
        {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height
        },
        parsed.content
      )
      elements.push({
        ...element,
        rotation,
        opacity,
        camera: { x: cameraX, y: cameraY, zoom: cameraZoom },
        text: {
          ...element.text!,
          content: parsed.content,
          fontFamily: parsed.fontFamily,
          fontSize: parsed.fontSize,
          color: parsed.color,
          align: parsed.align
        },
        appear: { kind: 'fade', duration: Math.max(0.1, target), easing: 'easeOut' },
        hold: Math.max(0, pause),
        transition: { duration: Math.max(0, transition), easing: 'easeInOut' }
      })
      }
  }

  const project: Project = {
    version: 1,
    canvas,
    assets: runtimes.map((runtime) => runtime.asset),
    elements,
    ending: {
      enabled: options.getAttribute('zoomAtEnd') === 'yes',
      duration: 2.5,
      hold: 1.5
    }
  }
  const assets: Record<string, AssetRuntime> = {}
  for (const runtime of runtimes) assets[runtime.asset.id] = runtime

  const backing = findEntry(entries, root.getAttribute('backingTrack') ?? 'backingtrack.mp3')
  const voice = findEntry(entries, root.getAttribute('voiceOver') ?? 'voiceover.mp3')
  let backingId = ''
  let voiceId = ''
  if (backing) {
    const runtime = await createAssetRuntime({
      name: 'backingtrack.mp3',
      mime: 'audio/mpeg',
      bytes: backing
    })
    backingId = runtime.asset.id
    project.assets.push(runtime.asset)
    assets[runtime.asset.id] = runtime
  }
  if (voice) {
    const runtime = await createAssetRuntime({
      name: 'voiceover.mp3',
      mime: 'audio/mpeg',
      bytes: voice
    })
    voiceId = runtime.asset.id
    project.assets.push(runtime.asset)
    assets[runtime.asset.id] = runtime
  }

  const store = useEditorStore.getState()
  store.loadProject(project, assets, '', [])
  if (backingId) {
    store.setAudio(backingId, { volume: num(root.getAttribute('backingTrackVolume'), 1), loop: true })
  }
  if (voiceId) {
    store.setAudio2(voiceId, { volume: num(root.getAttribute('voiceOverVolume'), 1), loop: false })
  }
  useEditorStore.setState({ dirty: true })
}

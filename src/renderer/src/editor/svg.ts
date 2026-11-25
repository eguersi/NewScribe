import {
  buildSpanScribble,
  scanlineSpans,
  type Point,
  type Polyline,
  type Span
} from '@shared/geometry'

export interface ParsedStroke {
  points: Point[]
  color: string
  /** 元素局部单位 */
  width: number
  alpha: number
}

export interface ParsedSvg {
  strokes: ParsedStroke[]
  fillScribble: Polyline | null
  fillImage: HTMLImageElement | null
  width: number
  height: number
  complex?: boolean
}

const HIDDEN_STYLE =
  'position:fixed;left:-20000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none'

function viewBoxOf(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] }
    }
  }
  const width = Number.parseFloat(svg.getAttribute('width') ?? '')
  const height = Number.parseFloat(svg.getAttribute('height') ?? '')
  if (width > 0 && height > 0) return { width, height }
  return { width: 800, height: 600 }
}

function isRenderable(element: Element, root: Element): boolean {
  let parent = element.parentElement
  while (parent && parent !== root) {
    const tag = parent.tagName.toLowerCase()
    if (['defs', 'clippath', 'mask', 'pattern', 'symbol', 'marker'].includes(tag)) return false
    parent = parent.parentElement
  }
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function colorOf(value: string, fallback = '#2b2f3a'): string {
  if (!value || value === 'none') return fallback
  if (value.startsWith('url(')) return fallback
  return value
}

/**
 * 把 SVG 拆成「可以逐条描的折线」和「填充区域的涂绘计划」。
 * 坐标系：画布元素局部坐标，原点在元素中心，范围 [-w/2, w/2] × [-h/2, h/2]。
 */
export async function parseSvgForDrawing(
  source: string,
  width: number,
  height: number,
  seed = 1
): Promise<ParsedSvg> {
  const host = document.createElement('div')
  host.setAttribute('style', HIDDEN_STYLE)
  host.innerHTML = source
  const svg = host.querySelector('svg')
  if (!svg) {
    host.remove()
    return { strokes: [], fillScribble: null, fillImage: null, width, height }
  }

  document.body.appendChild(host)

  const viewBox = viewBoxOf(svg)
  svg.setAttribute('width', String(viewBox.width))
  svg.setAttribute('height', String(viewBox.height))
  if (!svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', `0 0 ${viewBox.width} ${viewBox.height}`)
  }

  const scaleX = width / viewBox.width
  const scaleY = height / viewBox.height
  const halfW = viewBox.width / 2
  const halfH = viewBox.height / 2

  const toLocal = (point: Point): Point => ({
    x: (point.x - halfW) * scaleX,
    y: (point.y - halfH) * scaleY
  })

  /** 给过于完美的矢量线加一点点手抖，避免看起来像机器画的 */
  const handWobble = (points: Point[], index: number): Point[] => {
    if (points.length < 3) return points
    const amplitude = Math.min(width, height) * 0.0022
    return points.map((point, i) => {
      const previous = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]
      const dx = next.x - previous.x
      const dy = next.y - previous.y
      const length = Math.hypot(dx, dy)
      if (length < 0.001) return point
      const offset =
        (Math.sin(i * 0.21 + index * 1.7) * 0.7 + Math.sin(i * 0.06 + index * 3.1) * 0.3) *
        amplitude
      return {
        x: point.x + (-dy / length) * offset,
        y: point.y + (dx / length) * offset
      }
    })
  }

  const strokes: ParsedStroke[] = []
  const geometry = Array.from(
    svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
  ) as SVGGeometryElement[]

  // 复杂地图类 SVG 不再直接整图降级：先限制采样量，保留一部分真实路径，
  // 结尾再切回完整图片。这样既有矢量描绘感，也不会长时间卡住主线程。
  let pathChars = 0
  for (const element of geometry) {
    pathChars += element.getAttribute('d')?.length ?? 0
    pathChars += element.getAttribute('points')?.length ?? 0
  }
  const tooComplex =
    geometry.length > 6000 || pathChars > 4_000_000 || source.length > 40_000_000
  const parsedGeometry = tooComplex ? geometry.slice(0, 2500) : geometry

  let hasFill = false
  let pointBudget = tooComplex ? 14_000 : 60_000
  let timedOut = false
  const sampleStarted = performance.now()

  for (const element of parsedGeometry) {
    if (performance.now() - sampleStarted > 7000) {
      timedOut = true
      break
    }
    if (!isRenderable(element, svg)) continue
    const style = getComputedStyle(element)
    if (style.fill && style.fill !== 'none' && Number.parseFloat(style.fillOpacity || '1') > 0.02) {
      hasFill = true
    }
    if (!style.stroke || style.stroke === 'none') continue
    const strokeWidth = Number.parseFloat(style.strokeWidth || '0')
    if (!(strokeWidth > 0.05)) continue

    let total = 0
    try {
      total = element.getTotalLength()
    } catch {
      total = 0
    }
    if (!(total > 0.5)) continue

    const matrix = element.getCTM()
    const desired = Math.min(tooComplex ? 900 : 2200, Math.max(2, Math.ceil(total / 1.6)))
    const count = Math.min(desired, pointBudget)
    if (count < 4) {
      timedOut = true
      break
    }
    pointBudget -= count
    const step = total / count
    const jumpLimit = Math.max(step * 6, 6)

    let current: Point[] = []
    let previous: Point | null = null
    const subpaths: Point[][] = []

    for (let index = 0; index <= count; index += 1) {
      const raw = element.getPointAtLength((total * index) / count)
      let x = raw.x
      let y = raw.y
      if (matrix) {
        x = matrix.a * raw.x + matrix.c * raw.y + matrix.e
        y = matrix.b * raw.x + matrix.d * raw.y + matrix.f
      }
      const point = { x, y }
      if (previous) {
        const jump = Math.hypot(point.x - previous.x, point.y - previous.y)
        if (jump > jumpLimit) {
          if (current.length > 1) subpaths.push(current)
          current = []
        }
      }
      current.push(point)
      previous = point
    }
    if (current.length > 1) subpaths.push(current)

    const color = colorOf(style.stroke)
    const alpha =
      Number.parseFloat(style.opacity || '1') * Number.parseFloat(style.strokeOpacity || '1')
    const strokeWidthLocal = Math.max(0.4, strokeWidth * ((scaleX + scaleY) / 2))

    for (const subpath of subpaths) {
      const local = subpath.map(toLocal)
      strokes.push({
        points: handWobble(local, strokes.length),
        color,
        width: strokeWidthLocal,
        alpha: Number.isFinite(alpha) ? alpha : 1
      })
    }
  }

  let fillScribble: Polyline | null = null
  let fillImage: HTMLImageElement | null = null

  // 纯填充 SVG（没有任何描边）也沿着路径描一遍，
  // 否则矢量图在描绘动画里会完全看不出形状。
  if (strokes.length === 0) {
    const outlineStarted = performance.now()
    for (const element of parsedGeometry) {
      if (performance.now() - outlineStarted > 1200) break
      if (!isRenderable(element, svg)) continue
      let total = 0
      try {
        total = element.getTotalLength()
      } catch {
        total = 0
      }
      if (!(total > 0.5)) continue
      const matrix = element.getCTM()
      const count = Math.min(1200, Math.max(4, Math.ceil(total / 2.2)))
      const points: Point[] = []
      for (let index = 0; index <= count; index += 1) {
        const raw = element.getPointAtLength((total * index) / count)
        let x = raw.x
        let y = raw.y
        if (matrix) {
          x = matrix.a * raw.x + matrix.c * raw.y + matrix.e
          y = matrix.b * raw.x + matrix.d * raw.y + matrix.f
        }
        points.push(toLocal({ x, y }))
      }
      if (points.length < 2) continue
      strokes.push({
        points: handWobble(points, strokes.length),
        color: '#1f2937',
        width: Math.max(0.8, 1.6 * ((scaleX + scaleY) / 2)),
        alpha: 1
      })
    }
  }

  if (timedOut && strokes.length === 0) {
    host.remove()
    return { strokes: [], fillScribble: null, fillImage: null, width, height, complex: true }
  }

  if (hasFill) {
    const rasterWidth = Math.min(1600, Math.max(900, Math.round(width * 1.5)))
    const rasterHeight = Math.max(2, Math.round((rasterWidth * height) / width))

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(rasterWidth))
    clone.setAttribute('height', String(rasterHeight))
    clone.querySelectorAll('*').forEach((node) => {
      if (node instanceof SVGElement) {
        node.style.stroke = 'none'
        node.style.strokeWidth = '0'
        node.setAttribute('stroke', 'none')
        node.setAttribute('stroke-width', '0')
      }
    })

    const markup = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.decoding = 'async'

    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('SVG 填充层渲染失败'))
        image.src = url
      })
      fillImage = image

      const canvas = document.createElement('canvas')
      canvas.width = rasterWidth
      canvas.height = rasterHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(image, 0, 0, rasterWidth, rasterHeight)
        const data = ctx.getImageData(0, 0, rasterWidth, rasterHeight).data
        let spans: Span[] = []
        let rowStep = 2
        for (let attempt = 0; attempt < 4; attempt += 1) {
          spans = scanlineSpans(data, rasterWidth, rasterHeight, { threshold: 40, rowStep })
          if (spans.length <= 2400) break
          rowStep *= 2
        }

        if (spans.length > 0) {
          const localSpans: Span[] = spans.map((span) => ({
            y: ((span.y + 0.5) / rasterHeight - 0.5) * height,
            x0: (span.x0 / rasterWidth - 0.5) * width,
            x1: (span.x1 / rasterWidth - 0.5) * width
          }))
          const brush = Math.max(5, Math.min(42, Math.min(width, height) * 0.055))
          fillScribble = buildSpanScribble(localSpans, {
            brushWidth: brush,
            jitter: brush * 0.16,
            step: Math.max(6, brush * 0.8),
            seed: 1337
          })
        }
      }
    } catch {
      fillImage = null
      fillScribble = null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  host.remove()
  return { strokes, fillScribble, fillImage, width, height, complex: tooComplex || timedOut }
}

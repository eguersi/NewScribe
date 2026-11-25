export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Polyline {
  points: Point[]
  /** lengths[i] = 从起点到 points[i] 的累计长度 */
  lengths: number[]
  total: number
}

export interface Span {
  /** 行号（像素坐标） */
  y: number
  /** 起点，含 */
  x0: number
  /** 终点，不含 */
  x1: number
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

export function makePolyline(points: Point[]): Polyline {
  if (points.length === 0) return { points: [], lengths: [], total: 0 }

  const lengths: number[] = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
    lengths.push(total)
  }
  return { points, lengths, total }
}

/** 按弧长取点（含切线方向），用于笔尖位置、手部跟随 */
export function pointAtLength(polyline: Polyline, distance: number): { x: number; y: number; angle: number } {
  const { points, lengths, total } = polyline
  if (points.length === 0) return { x: 0, y: 0, angle: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 }

  const target = clamp(distance, 0, total)

  let low = 0
  let high = lengths.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (lengths[middle] < target) low = middle + 1
    else high = middle
  }

  const index = Math.max(1, low)
  const span = lengths[index] - lengths[index - 1]
  const ratio = span <= 0 ? 0 : (target - lengths[index - 1]) / span
  const from = points[index - 1]
  const to = points[index]

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    angle: Math.atan2(to.y - from.y, to.x - from.x)
  }
}

/** 截取 [from, to] 区间的折线，用于「画到一半」的笔迹 */
export function slicePolyline(polyline: Polyline, from: number, to: number): Point[] {
  const total = polyline.total
  if (total <= 0 || polyline.points.length === 0) return []
  const start = clamp(from, 0, total)
  const end = clamp(to, 0, total)
  if (end <= start) return []

  if (start === 0 && end === total) return polyline.points

  const result: Point[] = [pointAtLength(polyline, start)]

  for (let index = 0; index < polyline.points.length; index += 1) {
    const length = polyline.lengths[index]
    if (length > start && length < end) result.push(polyline.points[index])
  }

  result.push(pointAtLength(polyline, end))
  return result
}

/** 确定性伪随机，保证同一工程每次渲染一致 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ScribbleOptions {
  /** 笔刷直径（世界像素） */
  brushWidth: number
  /** 行距 = brushWidth × lineSpacing，默认 0.72（保证覆盖） */
  lineSpacing?: number
  /** 手抖幅度（像素） */
  jitter?: number
  seed?: number
  /** 沿线采样步长 */
  step?: number
}

/**
 * 生成覆盖整个矩形的「来回涂」笔迹。
 * 行距小于笔刷直径，所以涂过之后不会留白；抖动让它看起来像手画的。
 */
export function buildRectScribble(rect: Rect, options: ScribbleOptions): Polyline {
  const brush = Math.max(1, options.brushWidth)
  const spacing = Math.max(1.5, brush * (options.lineSpacing ?? 0.72))
  const jitter = Math.max(0, options.jitter ?? brush * 0.18)
  const step = Math.max(4, options.step ?? brush * 0.9)
  const random = mulberry32(options.seed ?? 1)

  const left = rect.x - brush * 0.5
  const right = rect.x + rect.width + brush * 0.5
  const firstY = rect.y + brush * 0.5
  const lastY = rect.y + rect.height - brush * 0.5
  const height = Math.max(0, lastY - firstY)
  const rows = Math.max(1, Math.ceil(height / spacing) + 1)

  const points: Point[] = []
  let phase = random() * Math.PI * 2

  for (let row = 0; row < rows; row += 1) {
    const progress = rows === 1 ? 0.5 : row / (rows - 1)
    const baseY = firstY + (lastY - firstY) * progress
    const leftToRight = row % 2 === 0
    const from = leftToRight ? left : right
    const to = leftToRight ? right : left
    const distance = Math.abs(to - from)
    const steps = Math.max(1, Math.ceil(distance / step))

    phase += 0.9 + random() * 0.4
    const amplitude = jitter * (0.55 + random() * 0.45)

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps
      const x = from + (to - from) * t
      // 低频正弦 + 少量随机，避免机械感
      const wave = Math.sin(t * Math.PI * (2 + (row % 3)) + phase) * amplitude
      const noise = (random() - 0.5) * amplitude * 0.35
      points.push({ x, y: baseY + wave + noise })
    }
  }

  return makePolyline(points)
}

/**
 * 根据逐行实心区间（来自 SVG 填充区域的扫描）生成涂鸦笔迹。
 * 每段区间内来回涂，段与段之间自然连接。
 */
export function buildSpanScribble(spans: Span[], options: ScribbleOptions): Polyline {
  const brush = Math.max(1, options.brushWidth)
  const jitter = Math.max(0, options.jitter ?? brush * 0.16)
  const step = Math.max(4, options.step ?? brush * 0.9)
  const random = mulberry32(options.seed ?? 1)

  const points: Point[] = []
  let phase = random() * Math.PI * 2
  let flip = false

  for (const span of spans) {
    const width = span.x1 - span.x0
    if (width <= 0) continue

    const steps = Math.max(1, Math.ceil(width / step))
    const amplitude = jitter * (0.5 + random() * 0.5)
    phase += 0.7 + random() * 0.5
    const leftToRight = !flip
    flip = !flip

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps
      const x = leftToRight ? span.x0 + width * t : span.x1 - width * t
      const wave = Math.sin(t * Math.PI * 2 + phase) * amplitude
      const noise = (random() - 0.5) * amplitude * 0.3
      points.push({ x, y: span.y + wave + noise })
    }
  }

  return makePolyline(points)
}

export interface ScanlineOptions {
  /** alpha 阈值（0-255） */
  threshold?: number
  /** 每隔多少行取一次 */
  rowStep?: number
}

/**
 * 从 alpha 通道里逐行找出实心区间。
 * 用于 SVG 填充区域的涂绘，以及位图的有效区域裁剪。
 */
export function scanlineSpans(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  options: ScanlineOptions = {}
): Span[] {
  const threshold = options.threshold ?? 128
  const rowStep = Math.max(1, Math.round(options.rowStep ?? 1))
  const spans: Span[] = []

  for (let y = 0; y < height; y += rowStep) {
    const rowOffset = y * width * 4
    let start = -1
    for (let x = 0; x < width; x += 1) {
      const opaque = alpha[rowOffset + x * 4 + 3] > threshold
      if (opaque && start === -1) {
        start = x
      } else if (!opaque && start !== -1) {
        if (x - start > 1) spans.push({ y, x0: start, x1: x })
        start = -1
      }
    }
    if (start !== -1 && width - start > 1) spans.push({ y, x0: start, x1: width })
  }

  return spans
}

/** 把笔迹按总长度均分成 n 段，便于按「笔速」分配时间 */
export function polylineSectionLengths(polyline: Polyline, sections: number): number[] {
  const count = Math.max(1, Math.floor(sections))
  return Array.from({ length: count }, (_, index) => (polyline.total * (index + 1)) / count)
}

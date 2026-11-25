import type { SceneElement } from '@shared/project'
import {
  buildRectScribble,
  clamp,
  makePolyline,
  pointAtLength,
  slicePolyline,
  type Point,
  type Polyline
} from '@shared/geometry'
import type { AssetRuntime } from './assets'
import { imageForElement } from './assets'
import { parseSvgForDrawing } from './svg'
import { getBuiltinHand, getBuiltinHandImage, getHandConfig, getHandDrawHeight, getHandImage } from './hands'

export interface StrokePlan {
  points: Point[]
  lengths: number[]
  startFrac: number
  endFrac: number
  color: string
  width: number
  alpha: number
}

export interface DrawPlan {
  elementId: string
  kind: 'bitmap' | 'svg'
  width: number
  height: number
  strokes: StrokePlan[]
  fillScribble: Polyline | null
  fillImage: HTMLImageElement | null
  fillBrush: number
  strokeLength: number
  fillLength: number
  /** 描边阶段占总时长的比例 */
  strokeShare: number
  /** 大型 SVG 的快速模式：加大采样步长，结尾直接显示完整图片 */
  fast?: boolean
  error?: string
}

function hashSeed(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function bitmapPlan(element: SceneElement, seed: number, error?: string): DrawPlan {
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const brush = clamp(Math.min(width, height) * 0.065, 6, 48)
  const scribble = buildRectScribble(
    { x: -width / 2, y: -height / 2, width, height },
    {
      brushWidth: brush,
      lineSpacing: 0.45,
      jitter: brush * 0.16,
      step: Math.max(6, brush * 0.8),
      seed
    }
  )
  return {
    elementId: element.id,
    kind: 'bitmap',
    width,
    height,
    strokes: [],
    fillScribble: scribble,
    fillImage: null,
    fillBrush: brush,
    strokeLength: 0,
    fillLength: scribble.total,
    strokeShare: 0,
    error
  }
}

export async function buildDrawPlan(element: SceneElement, asset: AssetRuntime): Promise<DrawPlan> {
  const seed = hashSeed(element.id)
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)

  if (element.kind === 'image' || element.appear.kind === 'bitmap') {
    return bitmapPlan(element, seed)
  }

  try {
    const source = new TextDecoder().decode(asset.bytes)
    const parsed = await parseSvgForDrawing(source, width, height, seed)

    const usable = parsed.strokes
      .map((stroke) => ({ stroke, polyline: makePolyline(stroke.points) }))
      .filter((entry) => entry.polyline.total > 0.5)

    const strokeLength = usable.reduce((sum, entry) => sum + entry.polyline.total, 0)
    let cursor = 0
    const strokes: StrokePlan[] = usable.map((entry) => {
      const startFrac = strokeLength > 0 ? cursor / strokeLength : 0
      cursor += entry.polyline.total
      return {
        points: entry.polyline.points,
        lengths: entry.polyline.lengths,
        startFrac,
        endFrac: strokeLength > 0 ? cursor / strokeLength : 1,
        color: entry.stroke.color,
        width: entry.stroke.width,
        alpha: entry.stroke.alpha
      }
    })

    let fillScribble = parsed.fillScribble
    if (parsed.complex) {
      // 快速模式不逐条描填充轮廓，改成整块粗涂；
      // 真正的形状仍由 fillImage 的透明区域限制，不会涂出图形。
      if (parsed.fillImage && !element.strokeOnly) {
        const coarseBrush = clamp(Math.min(width, height) * 0.08, 8, 56)
        fillScribble = buildRectScribble(
          { x: -width / 2, y: -height / 2, width, height },
          {
            brushWidth: coarseBrush,
            lineSpacing: 0.9,
            jitter: coarseBrush * 0.2,
            step: Math.max(18, coarseBrush * 1.8),
            seed: seed + 17
          }
        )
      } else {
        fillScribble = null
      }
    }
    const fillLength = fillScribble?.total ?? 0

    if (strokes.length === 0 && !fillScribble) {
      return bitmapPlan(
        element,
        seed,
        parsed.complex
          ? 'SVG 路径数据过于复杂，已改用整图描绘'
          : 'SVG 没有可描绘的路径，已按位图处理'
      )
    }

    let strokeShare = 1
    if (parsed.complex) {
      strokeShare = fillScribble ? 0.55 : 1
    } else if (strokeLength > 0 && fillLength > 0) {
      // 纯按长度分配的话，大面积填充会把描边时间挤没；
      // 这里让描边至少占 40%，线稿多时最多 75%。
      const ratio = strokeLength / (strokeLength + fillLength)
      strokeShare = clamp(0.35 + ratio * 0.4, 0.4, 0.75)
    } else if (strokeLength === 0) {
      strokeShare = 0
    }

    return {
      elementId: element.id,
      kind: 'svg',
      width,
      height,
      strokes,
      fillScribble,
      fillImage: parsed.fillImage,
      fillBrush: Math.max(5, Math.min(42, Math.min(width, height) * 0.055)),
      strokeLength,
      fillLength,
      strokeShare,
      fast: parsed.complex
    }
  } catch (error) {
    return bitmapPlan(element, seed, error instanceof Error ? error.message : String(error))
  }
}

const planCache = new Map<string, DrawPlan>()
const pending = new Map<string, Promise<DrawPlan>>()

export function getDrawPlan(elementId: string): DrawPlan | undefined {
  return planCache.get(elementId)
}

export function invalidateDrawPlan(elementId: string): void {
  planCache.delete(elementId)
  pending.delete(elementId)
}

export async function ensureDrawPlans(
  project: { elements: SceneElement[] },
  assets: Record<string, AssetRuntime>,
  onProgress?: (done: number, total: number) => void,
  deadlineMs = Number.POSITIVE_INFINITY
): Promise<void> {
  const elements = project.elements.filter(
    (element) => element.appear.kind === 'draw' || element.appear.kind === 'bitmap'
  )
  const startedAt = performance.now()
  let done = 0
  onProgress?.(0, elements.length)
  for (const element of elements) {
    if (planCache.has(element.id)) {
      done += 1
      onProgress?.(done, elements.length)
      continue
    }
    if (performance.now() - startedAt > deadlineMs) {
      // 矢量描绘不能降级成整块涂抹，否则会丢失原本的描边路径。
      // 时间预算只允许位图类出现方式回退。
      if (element.appear.kind === 'bitmap') {
        planCache.set(
          element.id,
          bitmapPlan(element, hashSeed(element.id), 'first-preview time budget exceeded')
        )
        done += 1
        onProgress?.(done, elements.length)
        continue
      }
    }
    const existing = pending.get(element.id)
    if (existing) {
      await existing
      done += 1
      onProgress?.(done, elements.length)
      continue
    }
    const asset = assets[element.assetId]
    if (!asset) {
      done += 1
      onProgress?.(done, elements.length)
      continue
    }
    const task = buildDrawPlan(element, asset)
      .then((plan) => {
        planCache.set(element.id, plan)
        return plan
      })
      .catch((error) => {
        const plan = bitmapPlan(element, hashSeed(element.id), String(error))
        planCache.set(element.id, plan)
        return plan
      })
      .finally(() => {
        pending.delete(element.id)
      })
    pending.set(element.id, task)
    await task
    done += 1
    onProgress?.(done, elements.length)
    // 让出主线程，进度提示和“准备缓存”状态才能刷新。
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

interface OffscreenEntry {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

const offscreenCache = new Map<string, OffscreenEntry>()

function offscreenFor(elementId: string, width: number, height: number): OffscreenEntry {
  let entry = offscreenCache.get(elementId)
  if (!entry) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    entry = { canvas, width, height }
    offscreenCache.set(elementId, entry)
  } else if (Math.abs(entry.width - width) > 8 || Math.abs(entry.height - height) > 8) {
    entry.canvas.width = width
    entry.canvas.height = height
    entry.width = width
    entry.height = height
  }
  return entry
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lengths: number[],
  target: number,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  stride = 1
): boolean {
  if (points.length < 2 || target <= 0) return false
  ctx.beginPath()
  ctx.moveTo(mapX(points[0].x), mapY(points[0].y))
  for (let index = stride; index < points.length; index += stride) {
    if (lengths[index] >= target) {
      const span = lengths[index] - lengths[index - 1]
      const ratio = span > 0 ? (target - lengths[index - 1]) / span : 0
      const x = points[index - 1].x + (points[index].x - points[index - 1].x) * ratio
      const y = points[index - 1].y + (points[index].y - points[index - 1].y) * ratio
      ctx.lineTo(mapX(x), mapY(y))
      return true
    }
    ctx.lineTo(mapX(points[index].x), mapY(points[index].y))
  }
  return true
}

function hashNoise(value: number, seed: number): number {
  const raw = Math.sin(value * 12.9898 + seed * 78.233) * 43758.5453
  return raw - Math.floor(raw)
}

/**
 * 用一串半径略有变化的圆点沿途盖印，形成毛糙的笔刷边缘。
 * 比直接 stroke 更像「粗笔涂过去」，也不会出现一条笔直的分界线。
 */
function stampBrush(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lengths: number[],
  target: number,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  brush: number,
  seed: number
): void {
  if (points.length < 2 || target <= 0) return
  const total = lengths[lengths.length - 1]
  const limit = Math.min(target, total)
  const step = Math.max(1.2, brush * 0.14)
  const radius = brush / 2

  let segment = 1
  ctx.beginPath()

  for (let distance = 0; distance <= limit; distance += step) {
    while (segment < lengths.length - 1 && lengths[segment] < distance) segment += 1
    const span = lengths[segment] - lengths[segment - 1]
    const ratio = span > 0 ? (distance - lengths[segment - 1]) / span : 0
    const x = points[segment - 1].x + (points[segment].x - points[segment - 1].x) * ratio
    const y = points[segment - 1].y + (points[segment].y - points[segment - 1].y) * ratio

    const wobble = hashNoise(distance * 0.05, seed)
    const wobble2 = hashNoise(distance * 0.07 + 11, seed)
    const r = radius * (0.98 + wobble * 0.16)
    const offsetX = (wobble2 - 0.5) * brush * 0.1
    const offsetY = (hashNoise(distance * 0.09 + 23, seed) - 0.5) * brush * 0.1

    const cx = mapX(x) + offsetX * (mapX(1) - mapX(0))
    const cy = mapY(y) + offsetY * (mapY(1) - mapY(0))
    ctx.moveTo(cx + r, cy)
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }

  ctx.fillStyle = '#000000'
  ctx.fill()
}

let perfEnabled = false

export function setDrawPerfEnabled(value: boolean): void {
  perfEnabled = value
}

export const drawPerf = {
  strokeMs: 0,
  fillMs: 0,
  drawMs: 0,
  frames: 0
}

export function resetDrawPerf(): void {
  drawPerf.strokeMs = 0
  drawPerf.fillMs = 0
  drawPerf.drawMs = 0
  drawPerf.frames = 0
}

function drawPlanStrokes(
  ctx: CanvasRenderingContext2D,
  plan: DrawPlan,
  phase: number,
  sx: number,
  sy: number,
  opacity: number
): void {
  if (plan.strokes.length === 0 || phase <= 0) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of plan.strokes) {
    if (phase <= stroke.startFrac) continue
    const numerator = phase - stroke.startFrac
    const denominator = Math.max(1e-6, stroke.endFrac - stroke.startFrac)
    const localFraction = Math.min(1, numerator / denominator)
    const total = stroke.lengths[stroke.lengths.length - 1]
    if (!(total > 0)) continue
    const target = total * localFraction
    if (target <= 0) continue

    const drew = tracePath(
      ctx,
      stroke.points,
      stroke.lengths,
      target,
      (x) => x * sx,
      (y) => y * sy,
      plan.fast ? 2 : 1
    )
    if (!drew) continue
    ctx.lineWidth = Math.max(0.4, stroke.width * ((sx + sy) / 2))
    ctx.strokeStyle = stroke.color
    ctx.globalAlpha = stroke.alpha * Math.max(0, Math.min(1, opacity))
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

/**
 * 画一个「描绘」中的元素。progress 是 0..1 的线性进度（不含缓动）。
 * worldScale：世界单位 → CSS 像素；dpr：设备像素比。
 */
export function drawDrawElementLegacy(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  plan: DrawPlan,
  progress: number,
  asset: AssetRuntime,
  worldScale: number,
  dpr: number,
  opacity = 1
): void {
  const p = clamp(progress, 0, 1)
  const startedAt = perfEnabled ? performance.now() : 0
  const sx = element.width / plan.width
  const sy = element.height / plan.height
  const centerX = element.x + element.width / 2
  const centerY = element.y + element.height / 2

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate((element.rotation * Math.PI) / 180)
  if (element.flipX) ctx.scale(-1, 1)

  // 描绘完成的那一帧直接画完整图，保证不会留下没涂到的缝
  if (p >= 1 - 1e-6) {
    const image = imageForElement(element, asset)
    if (image) {
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
      ctx.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height)
      ctx.globalAlpha = 1
    }
    ctx.restore()
    return
  }

  if (plan.strokes.length > 0 && plan.strokeShare > 0) {
    const strokePhase = Math.min(1, p / plan.strokeShare)
    drawPlanStrokes(ctx, plan, strokePhase, sx, sy, opacity)
  }
  if (perfEnabled) drawPerf.strokeMs += performance.now() - startedAt

  const scribble = plan.fillScribble
  const fillStartedAt = perfEnabled ? performance.now() : 0
  const fillPhase =
    scribble && scribble.total > 0 && plan.strokeShare < 1
      ? clamp((p - plan.strokeShare) / (1 - plan.strokeShare), 0, 1)
      : 0

  if (scribble && fillPhase > 0) {
    const pixelWidth = Math.round(clamp(element.width * worldScale * dpr, 32, 2048))
    const pixelHeight = Math.round(clamp(element.height * worldScale * dpr, 32, 2048))
    const entry = offscreenFor(element.id, pixelWidth, pixelHeight)
    const mask = entry.canvas.getContext('2d')
    if (mask) {
      mask.setTransform(1, 0, 0, 1, 0, 0)
      mask.clearRect(0, 0, entry.width, entry.height)
      const image = plan.fillImage ?? imageForElement(element, asset)
      if (image) {
        mask.drawImage(image, 0, 0, entry.width, entry.height)

        mask.globalCompositeOperation = 'destination-in'
        mask.strokeStyle = '#000000'
        mask.fillStyle = '#000000'

        const target = scribble.total * fillPhase
        const mapX = (x: number): number => (x + element.width / 2) * (entry.width / element.width)
        const mapYBase = (y: number): number => (y + element.height / 2) * (entry.height / element.height)

        // 高倍缩放时笔刷在屏幕上会大得离谱；限制屏幕尺寸，
        // 同时多盖几遍把行距填满，避免出现漏涂。
        const rawBrush = plan.fillBrush * (entry.width / element.width)
        const brushPx = Math.min(rawBrush, 96)
        const spacingPx = plan.fillBrush * 0.45 * (entry.height / element.height)
        const passes = Math.max(1, Math.min(4, Math.ceil(spacingPx / Math.max(1, brushPx))))

        for (let pass = 0; pass < passes; pass += 1) {
          const offset = (pass - (passes - 1) / 2) * brushPx * 0.78
          const mapY = (y: number): number => mapYBase(y) + offset

          // 先用实线铺底，保证中间没有孔洞
          mask.beginPath()
          tracePath(mask, scribble.points, scribble.lengths, target, mapX, mapY)
          mask.lineWidth = Math.max(1, brushPx * 0.85)
          mask.lineCap = 'round'
          mask.lineJoin = 'round'
          mask.stroke()

          stampBrush(
            mask,
            scribble.points,
            scribble.lengths,
            target,
            mapX,
            mapY,
            brushPx,
            hashSeed(element.id)
          )
        }
        mask.globalCompositeOperation = 'source-over'

        ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
        ctx.drawImage(
          entry.canvas,
          -element.width / 2,
          -element.height / 2,
          element.width,
          element.height
        )
        ctx.globalAlpha = 1
      }
    }
  }

  // 填充的遮罩会盖住描边的内半边；填充阶段把描边重新画到最上层，
  // 保证最终观感仍然是「描边压住填充」。
  if (fillPhase > 0 && plan.strokes.length > 0) {
    drawPlanStrokes(ctx, plan, 1, sx, sy, opacity)
  }

  drawPerf.fillMs += perfEnabled ? performance.now() - fillStartedAt : 0
  drawPerf.drawMs += perfEnabled ? performance.now() - startedAt : 0
  drawPerf.frames += perfEnabled ? 1 : 0

  ctx.restore()
}

const scratchMaskCache = new Map<string, OffscreenEntry>()
const scratchResultCache = new Map<string, OffscreenEntry>()
function resolveHand(
  handId: string,
  heightOverride?: number
): {
  image: HTMLImageElement
  pivotX: number
  pivotY: number
  height: number
} | null {
  const builtin = getBuiltinHand(handId)
  if (builtin) {
    const image = getBuiltinHandImage(builtin)
    if (!image) return null
    return {
      image,
      pivotX: builtin.pivotX,
      pivotY: builtin.pivotY,
      height: Math.max(20, heightOverride ?? builtin.height)
    }
  }
  if (!handId || handId === 'none') return null
  const config = getHandConfig(handId)
  if (!config) return null
  const image = getHandImage(config.dataUrl)
  if (!image) return null
  return { image, pivotX: config.pivotX, pivotY: config.pivotY, height: config.height }
}

function scratchCanvas(
  cache: Map<string, OffscreenEntry>,
  key: string,
  width: number,
  height: number
): OffscreenEntry {
  let entry = cache.get(key)
  if (!entry) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    entry = { canvas, width, height }
    cache.set(key, entry)
  } else if (Math.abs(entry.width - width) > 8 || Math.abs(entry.height - height) > 8) {
    entry.canvas.width = width
    entry.canvas.height = height
    entry.width = width
    entry.height = height
  }
  return entry
}

/**
 * 刮刮乐式描绘：先把成品图当成底图，再在遮罩上沿路径「刮」出可见区域。
 * 不再单独画彩色描边，边缘溢出按用户要求忽略。
 */
function drawScratchFull(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  plan: DrawPlan,
  progress: number,
  asset: AssetRuntime,
  worldScale: number,
  dpr: number,
  opacity = 1
): void {
  const p = clamp(progress, 0, 1)
  const startedAt = perfEnabled ? performance.now() : 0
  const centerX = element.x + element.width / 2
  const centerY = element.y + element.height / 2
  const image = imageForElement(element, asset)

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate((element.rotation * Math.PI) / 180)
  if (element.flipX) ctx.scale(-1, 1)

  if (!image) {
    ctx.restore()
    return
  }

  if (p >= 1 - 1e-6) {
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    ctx.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height)
    ctx.globalAlpha = 1
    ctx.restore()
    return
  }

  const pixelWidth = Math.round(clamp(element.width * worldScale * dpr, 32, 8192))
  const pixelHeight = Math.round(clamp(element.height * worldScale * dpr, 32, 8192))
  const mask = scratchCanvas(scratchMaskCache, element.id, pixelWidth, pixelHeight)
  const mctx = mask.canvas.getContext('2d')
  if (!mctx) {
    ctx.restore()
    return
  }
  mctx.setTransform(1, 0, 0, 1, 0, 0)
  mctx.clearRect(0, 0, mask.width, mask.height)
  mctx.strokeStyle = '#000000'
  mctx.fillStyle = '#000000'
  mctx.lineCap = 'round'
  mctx.lineJoin = 'round'

  const sx = mask.width / element.width
  const sy = mask.height / element.height
  const mapX = (x: number): number => (x + element.width / 2) * sx
  const mapY = (y: number): number => (y + element.height / 2) * sy

  const strokePhase = plan.strokeShare > 0 ? Math.min(1, p / plan.strokeShare) : 0
  for (const stroke of plan.strokes) {
    if (strokePhase <= stroke.startFrac) continue
    const denominator = Math.max(1e-6, stroke.endFrac - stroke.startFrac)
    const localFraction = Math.min(1, (strokePhase - stroke.startFrac) / denominator)
    const total = stroke.lengths[stroke.lengths.length - 1]
    if (!(total > 0)) continue
    tracePath(mctx, stroke.points, stroke.lengths, total * localFraction, mapX, mapY)
    mctx.lineWidth = Math.max(1.5, stroke.width * ((sx + sy) / 2))
    mctx.stroke()
  }

  const scribble = plan.fillScribble
  const fillPhase =
    scribble && scribble.total > 0 && plan.strokeShare < 1
      ? clamp((p - plan.strokeShare) / (1 - plan.strokeShare), 0, 1)
      : 0
  if (scribble && fillPhase > 0) {
    const brush = Math.min(96, Math.max(2, plan.fillBrush * sx))
    tracePath(mctx, scribble.points, scribble.lengths, scribble.total * fillPhase, mapX, mapY)
    mctx.lineWidth = brush
    mctx.stroke()
  }

  const result = scratchCanvas(scratchResultCache, element.id, pixelWidth, pixelHeight)
  const rctx = result.canvas.getContext('2d')
  if (!rctx) {
    ctx.restore()
    return
  }
  rctx.setTransform(1, 0, 0, 1, 0, 0)
  rctx.clearRect(0, 0, result.width, result.height)
  rctx.drawImage(mask.canvas, 0, 0)
  rctx.globalCompositeOperation = 'source-in'
  rctx.drawImage(image, 0, 0, result.width, result.height)
  rctx.globalCompositeOperation = 'source-over'

  ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
  ctx.drawImage(result.canvas, -element.width / 2, -element.height / 2, element.width, element.height)
  ctx.globalAlpha = 1

  if (perfEnabled) {
    drawPerf.drawMs += performance.now() - startedAt
    drawPerf.frames += 1
  }
  ctx.restore()
}

interface MaskCheckpoint {
  p: number
  strokePhase: number
  fillPhase: number
  canvas: HTMLCanvasElement
}

interface MaskState {
  p: number
  strokePhase: number
  fillPhase: number
  width: number
  height: number
  checkpoints: MaskCheckpoint[]
}

const maskStates = new Map<string, MaskState>()

export function invalidateDrawElement(elementId: string): void {
  planCache.delete(elementId)
  pending.delete(elementId)
  scratchMaskCache.delete(elementId)
  scratchResultCache.delete(elementId)
  maskStates.delete(elementId)
}

function checkpointMask(state: MaskState, mask: OffscreenEntry): void {
  const last = state.checkpoints[state.checkpoints.length - 1]
  if (last && state.p - last.p < 0.18) return
  const width = Math.max(1, Math.floor(mask.width / 2))
  const height = Math.max(1, Math.floor(mask.height / 2))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(mask.canvas, 0, 0, width, height)
  state.checkpoints.push({
    p: state.p,
    strokePhase: state.strokePhase,
    fillPhase: state.fillPhase,
    canvas
  })
  if (state.checkpoints.length > 6) state.checkpoints.shift()
}

function strokeSlice(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lengths: number[],
  from: number,
  to: number,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  lineWidth: number
): void {
  if (points.length < 2) return
  const total = lengths[lengths.length - 1]
  if (!(total > 0)) return
  const start = clamp(from, 0, 1) * total
  const end = clamp(to, 0, 1) * total
  if (end <= start) return
  const slice = slicePolyline({ points, lengths, total }, start, end)
  if (slice.length < 2) return
  ctx.beginPath()
  ctx.moveTo(mapX(slice[0].x), mapY(slice[0].y))
  for (let index = 1; index < slice.length; index += 1) {
    ctx.lineTo(mapX(slice[index].x), mapY(slice[index].y))
  }
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

/**
 * 刮刮乐式描绘（增量版）：
 * 成品图只当底图，遮罩随进度生长；播放时只补新增墨迹，回拖才清空重建。
 */
export function drawDrawElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  plan: DrawPlan,
  progress: number,
  asset: AssetRuntime,
  worldScale: number,
  dpr: number,
  opacity = 1,
  extraScale = 1,
  extraRotation = 0,
  offsetX = 0,
  offsetY = 0
): void {
  const p = clamp(progress, 0, 1)
  const startedAt = perfEnabled ? performance.now() : 0
  const centerX = element.x + element.width / 2
  const centerY = element.y + element.height / 2
  const image = imageForElement(element, asset)

  ctx.save()
  ctx.translate(centerX + offsetX, centerY + offsetY)
  ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
  ctx.scale(extraScale, extraScale)
  if (element.flipX) ctx.scale(-1, 1)

  if (!image) {
    ctx.restore()
    return
  }

  if (p >= 1 - 1e-6) {
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    ctx.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height)
    ctx.globalAlpha = 1
    if (perfEnabled) {
      drawPerf.drawMs += performance.now() - startedAt
      drawPerf.frames += 1
    }
    ctx.restore()
    return
  }

  const pixelWidth = Math.round(clamp(element.width * worldScale * dpr, 32, 8192))
  const pixelHeight = Math.round(clamp(element.height * worldScale * dpr, 32, 8192))
  const mask = scratchCanvas(scratchMaskCache, element.id, pixelWidth, pixelHeight)
  const mctx = mask.canvas.getContext('2d')
  if (!mctx) {
    ctx.restore()
    return
  }

  const strokePhase = element.strokeOnly
    ? p
    : plan.strokeShare > 0
      ? Math.min(1, p / plan.strokeShare)
      : 0
  const fillPhase =
    !element.strokeOnly &&
    plan.fillScribble &&
    plan.fillScribble.total > 0 &&
    plan.strokeShare < 1
      ? clamp((p - plan.strokeShare) / (1 - plan.strokeShare), 0, 1)
      : 0

  let state = maskStates.get(element.id)
  if (
    !state ||
    state.width !== mask.width ||
    state.height !== mask.height
  ) {
    mctx.setTransform(1, 0, 0, 1, 0, 0)
    mctx.clearRect(0, 0, mask.width, mask.height)
    state = { p: 0, strokePhase: 0, fillPhase: 0, width: mask.width, height: mask.height, checkpoints: [] }
    maskStates.set(element.id, state)
  }

  // 往回拖时优先从最近的关键帧快照恢复，而不是从 0 重画
  if (p < state.p - 1e-6) {
    let checkpoint: MaskCheckpoint | null = null
    for (const item of state.checkpoints) {
      if (item.p <= p && (!checkpoint || item.p > checkpoint.p)) checkpoint = item
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0)
    mctx.clearRect(0, 0, mask.width, mask.height)
    if (checkpoint) {
      mctx.drawImage(checkpoint.canvas, 0, 0, mask.width, mask.height)
      state.p = checkpoint.p
      state.strokePhase = checkpoint.strokePhase
      state.fillPhase = checkpoint.fillPhase
    } else {
      state.p = 0
      state.strokePhase = 0
      state.fillPhase = 0
    }
  }

  mctx.strokeStyle = '#000000'
  mctx.fillStyle = '#000000'
  mctx.lineCap = 'round'
  mctx.lineJoin = 'round'

  const sx = mask.width / element.width
  const sy = mask.height / element.height
  const planScaleX = element.width / Math.max(1, plan.width)
  const planScaleY = element.height / Math.max(1, plan.height)
  const mapX = (x: number): number => (x * planScaleX + element.width / 2) * sx
  const mapY = (y: number): number => (y * planScaleY + element.height / 2) * sy

  if (strokePhase > state.strokePhase) {
    for (const stroke of plan.strokes) {
      const from = Math.max(stroke.startFrac, state.strokePhase)
      const to = Math.min(stroke.endFrac, strokePhase)
      if (to <= from) continue
      const span = Math.max(1e-6, stroke.endFrac - stroke.startFrac)
      strokeSlice(
        mctx,
        stroke.points,
        stroke.lengths,
        (from - stroke.startFrac) / span,
        (to - stroke.startFrac) / span,
        mapX,
        mapY,
        Math.max(1.5, stroke.width * ((sx * planScaleX + sy * planScaleY) / 2))
      )
    }
  }

  if (fillPhase > state.fillPhase && plan.fillScribble) {
    const brush = Math.min(96, Math.max(2, plan.fillBrush * planScaleX * sx))
    strokeSlice(
      mctx,
      plan.fillScribble.points,
      plan.fillScribble.lengths,
      state.fillPhase,
      fillPhase,
      mapX,
      mapY,
      brush
    )
  }

  state.p = p
  state.strokePhase = Math.max(state.strokePhase, strokePhase)
  state.fillPhase = Math.max(state.fillPhase, fillPhase)

  if (p < 0.999) checkpointMask(state, mask)

  const result = scratchCanvas(scratchResultCache, element.id, pixelWidth, pixelHeight)
  const rctx = result.canvas.getContext('2d')
  if (!rctx) {
    ctx.restore()
    return
  }
  rctx.setTransform(1, 0, 0, 1, 0, 0)
  rctx.clearRect(0, 0, result.width, result.height)
  rctx.drawImage(mask.canvas, 0, 0)
  rctx.globalCompositeOperation = 'source-in'
  rctx.drawImage(image, 0, 0, result.width, result.height)
  rctx.globalCompositeOperation = 'source-over'

  ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
  ctx.drawImage(result.canvas, -element.width / 2, -element.height / 2, element.width, element.height)
  ctx.globalAlpha = 1

  const hand = element.hand && element.hand !== 'none' ? resolveHand(element.hand, element.handHeight) : null
  if (hand) {
    let tip: Point | null = null
    if (strokePhase > 0 && strokePhase < 1) {
      for (const stroke of plan.strokes) {
        if (strokePhase > stroke.startFrac && strokePhase <= stroke.endFrac) {
          const span = Math.max(1e-6, stroke.endFrac - stroke.startFrac)
          const total = stroke.lengths[stroke.lengths.length - 1]
          tip = pointAtLength(
            { points: stroke.points, lengths: stroke.lengths, total },
            total * ((strokePhase - stroke.startFrac) / span)
          )
          break
        }
      }
    } else if (fillPhase > 0 && fillPhase < 1 && plan.fillScribble) {
      tip = pointAtLength(plan.fillScribble, plan.fillScribble.total * fillPhase)
    }
    if (tip) {
      tip = { x: tip.x * planScaleX, y: tip.y * planScaleY }
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const scale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
      ctx.save()
      ctx.translate(tip.x, tip.y)
      ctx.rotate(-((element.rotation * Math.PI) / 180))
      ctx.drawImage(
        hand.image,
        -hand.pivotX * scale,
        -hand.pivotY * scale,
        hand.image.naturalWidth * scale,
        hand.image.naturalHeight * scale
      )
      ctx.restore()
      ctx.globalAlpha = 1
    }
  }

  if (perfEnabled) {
    drawPerf.drawMs += performance.now() - startedAt
    drawPerf.frames += 1
  }
  ctx.restore()
}

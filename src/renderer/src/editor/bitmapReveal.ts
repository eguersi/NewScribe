import type { SceneElement } from '@shared/project'
import type { AssetRuntime } from './assets'
import { imageForElement } from './assets'
import { buildRectScribble, buildSpanScribble, scanlineSpans, type Polyline, type Span } from '@shared/geometry'
import { drawChartElement } from './chart'
import { drawMindMapElement } from './mindmap'
import { drawQrElement } from './qr'
import { drawTableElement } from './table'
import { drawTextElement } from './text'
import { drawShapeElement } from './shape'
import { drawMathElement } from './math'
import { drawMoleculeElement } from './molecule'
import { drawIpaElement } from './ipa'
import { getHandDrawHeight, getHandVisual } from './hands'

const cache = new Map<string, HTMLCanvasElement>()
const scribbleCache = new Map<string, Polyline>()

function renderElementCanvas(
  element: SceneElement,
  assets: Record<string, AssetRuntime>,
  pixelScale = 2
): HTMLCanvasElement {
  const key = `${element.id}\u0000${JSON.stringify(element)}\u0000${pixelScale}`
  const cached = cache.get(key)
  if (cached) return cached
  const scale = Math.max(1, pixelScale)
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(scale, scale)
  ctx.translate(width / 2, height / 2)

  if (element.kind === 'text') {
    drawTextElement(ctx, element, { alpha: 1 })
  } else if (element.kind === 'chart') {
    drawChartElement(ctx, element, 1, 1)
  } else if (element.kind === 'table') {
    drawTableElement(ctx, element, 1, 1)
  } else if (element.kind === 'qr') {
    drawQrElement(ctx, element, 1, 1)
  } else if (element.kind === 'mindmap') {
    drawMindMapElement(ctx, element, 1, 1)
  } else if (element.kind === 'shape') {
    drawShapeElement(ctx, element, 1, 1)
  } else if (element.kind === 'math') {
    drawMathElement(ctx, element, 1, 1)
  } else if (element.kind === 'molecule') {
    drawMoleculeElement(ctx, element, 1, 1)
  } else if (element.kind === 'ipa') {
    drawIpaElement(ctx, element, 1, 1)
  } else {
    const image = imageForElement(element, assets[element.assetId])
    if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height)
  }

  if (cache.size > 24) cache.clear()
  cache.set(key, canvas)
  return canvas
}

export function drawBitmapElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  assets: Record<string, AssetRuntime>,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const pixelScale = Math.max(
    2,
    Math.min(
      worldScale * (window.devicePixelRatio || 1),
      8192 / Math.max(1, element.width),
      8192 / Math.max(1, element.height)
    )
  )
  const full = renderElementCanvas(element, assets, pixelScale)
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const p = Math.max(0, Math.min(1, progress))
  const angle = ((element.appear.bitmapAngle ?? 0) * Math.PI) / 180
  const brush = Math.max(6, Math.min(42, Math.min(width, height) * 0.042))
  const seed = element.id.length * 17 + 3
  const key = `${element.id}:${JSON.stringify(element)}:${width}:${height}:${angle}:${brush}:${seed}`
  let scribble = scribbleCache.get(key)
  if (!scribble) {
    const fullCtx = full.getContext('2d', { willReadFrequently: true })
    let spans: Span[] = []
    if (fullCtx) {
      const data = fullCtx.getImageData(0, 0, full.width, full.height).data
      let rowStep = 2
      for (let attempt = 0; attempt < 4; attempt += 1) {
        spans = scanlineSpans(data, full.width, full.height, { threshold: 24, rowStep })
        if (spans.length <= 3500) break
        rowStep *= 2
      }
    }
    if (spans.length > 0 && Math.abs(angle) < 0.001) {
      const localSpans = spans.map((span) => ({
        y: ((span.y + 0.5) / full.height - 0.5) * height,
        x0: (span.x0 / full.width - 0.5) * width,
        x1: (span.x1 / full.width - 0.5) * width
      }))
      scribble = buildSpanScribble(localSpans, {
        brushWidth: brush,
        jitter: brush * 0.12,
        step: Math.max(8, brush * 0.8),
        seed
      })
    } else {
      // 旋转后的涂抹路径必须覆盖整个元素，否则宽图旋转 90° 时只会涂到中间。
      const cos = Math.abs(Math.cos(angle))
      const sin = Math.abs(Math.sin(angle))
      const spanWidth = width * cos + height * sin
      const spanHeight = width * sin + height * cos
      const base = buildRectScribble(
        { x: -spanWidth / 2, y: -spanHeight / 2, width: spanWidth, height: spanHeight },
        {
          brushWidth: brush,
          lineSpacing: 0.46,
          jitter: brush * 0.12,
          step: Math.max(8, brush * 0.8),
          seed
        }
      )
      if (Math.abs(angle) > 0.001) {
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        base.points = base.points.map((point) => ({
          x: point.x * cosA - point.y * sinA,
          y: point.x * sinA + point.y * cosA
        }))
      }
      scribble = base
    }
    scribbleCache.set(key, scribble)
  }

  const scale = pixelScale
  if (p >= 1) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    const source = element.kind === 'image' ? imageForElement(element, assets[element.assetId]) : null
    if (source) {
      // 已完成的状态直接画原图，避免经过一次中间画布再放大。
      ctx.drawImage(source, -width / 2, -height / 2, width, height)
    } else {
      ctx.drawImage(full, -width / 2, -height / 2, width, height)
    }
    ctx.restore()
    return
  }
  const mask = document.createElement('canvas')
  mask.width = Math.max(1, Math.round(width * scale))
  mask.height = Math.max(1, Math.round(height * scale))
  const maskCtx = mask.getContext('2d')
  if (!maskCtx) return
  maskCtx.scale(scale, scale)
  maskCtx.translate(width / 2, height / 2)
  maskCtx.strokeStyle = '#000000'
  maskCtx.lineWidth = brush
  maskCtx.lineCap = 'round'
  maskCtx.lineJoin = 'round'
  maskCtx.beginPath()
  const target = scribble.total * p
  let handPoint: { x: number; y: number } | null = null
  for (let index = 0; index < scribble.points.length; index += 1) {
    if (scribble.lengths[index] > target) break
    const point = scribble.points[index]
    if (index === 0) maskCtx.moveTo(point.x, point.y)
    else maskCtx.lineTo(point.x, point.y)
    handPoint = point
  }
  maskCtx.stroke()

  const result = document.createElement('canvas')
  result.width = mask.width
  result.height = mask.height
  const resultCtx = result.getContext('2d')
  if (!resultCtx) return
  resultCtx.drawImage(full, 0, 0)
  resultCtx.globalCompositeOperation = 'destination-in'
  resultCtx.drawImage(mask, 0, 0)
  resultCtx.globalCompositeOperation = 'source-over'

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.drawImage(result, -width / 2, -height / 2, width, height)
  ctx.restore()

  if (p > 0 && p < 1 && handPoint) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const rotatedX = handPoint.x
      const rotatedY = handPoint.y
      if (
        Math.abs(rotatedX) > width / 2 + brush ||
        Math.abs(rotatedY) > height / 2 + brush
      ) {
        return
      }
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const handScale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.save()
      ctx.translate(rotatedX, rotatedY)
      ctx.rotate(-((element.rotation * Math.PI) / 180))
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.drawImage(
        hand.image,
        -hand.pivotX * handScale,
        -hand.pivotY * handScale,
        hand.image.naturalWidth * handScale,
        hand.image.naturalHeight * handScale
      )
      ctx.restore()
    }
  }
}

export function drawUnfoldElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  assets: Record<string, AssetRuntime>,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const pixelScale = Math.max(
    2,
    Math.min(
      worldScale * (window.devicePixelRatio || 1),
      8192 / Math.max(1, element.width),
      8192 / Math.max(1, element.height)
    )
  )
  const source = element.kind === 'image' ? imageForElement(element, assets[element.assetId]) : null
  const full = source ? null : renderElementCanvas(element, assets, pixelScale)
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const p = Math.max(0, Math.min(1, progress))
  const angle = ((element.appear.bitmapAngle ?? 0) * Math.PI) / 180
  const diagonal = Math.hypot(width, height) * 1.4
  const left = -width / 2
  const top = -height / 2

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.save()
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.rect(-diagonal / 2, -diagonal / 2, diagonal * p, diagonal)
  ctx.clip()
  ctx.rotate(-angle)
  // 已完成展开的图片直接画原图，避免低分辨率中间画布被放大。
  if (source) ctx.drawImage(source, left, top, width, height)
  else if (full) ctx.drawImage(full, left, top, width, height)
  ctx.restore()
  ctx.restore()
}

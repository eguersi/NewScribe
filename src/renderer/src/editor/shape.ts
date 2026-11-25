import type { SceneElement, ShapePoint, ShapeSpec } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

interface LocalPoint {
  x: number
  y: number
}

function local(point: ShapePoint, element: SceneElement): LocalPoint {
  return {
    x: (point.x - 0.5) * element.width,
    y: (point.y - 0.5) * element.height
  }
}

function hasCurve(a: ShapePoint, b: ShapePoint): boolean {
  return Boolean(a.out || b.in)
}

function sampleShape(element: SceneElement, shape: ShapeSpec): LocalPoint[] {
  const points = shape.points
  if (points.length === 0) return []
  const result: LocalPoint[] = [local(points[0], element)]
  const count = shape.closed ? points.length : points.length - 1
  for (let index = 0; index < count; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    if (!hasCurve(a, b)) {
      result.push(local(b, element))
      continue
    }
    const p0 = local(a, element)
    const p1 = local(a.out ?? a, element)
    const p2 = local(b.in ?? b, element)
    const p3 = local(b, element)
    const steps = 24
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const mt = 1 - t
      result.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
      })
    }
  }
  return result
}

function buildPath(ctx: CanvasRenderingContext2D, element: SceneElement, shape: ShapeSpec): void {
  const points = shape.points
  if (points.length === 0) return
  const first = local(points[0], element)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  const count = shape.closed ? points.length : points.length - 1
  for (let index = 0; index < count; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    const end = local(b, element)
    if (!hasCurve(a, b)) {
      ctx.lineTo(end.x, end.y)
      continue
    }
    const control1 = local(a.out ?? a, element)
    const control2 = local(b.in ?? b, element)
    ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y)
  }
  if (shape.closed) ctx.closePath()
}

function trace(ctx: CanvasRenderingContext2D, points: LocalPoint[], fraction: number): LocalPoint | null {
  if (points.length === 0) return null
  const lengths = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
    lengths.push(total)
  }
  const target = total * Math.max(0, Math.min(1, fraction))
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  let tip = points[0]
  for (let index = 1; index < points.length; index += 1) {
    if (lengths[index] <= target) {
      ctx.lineTo(points[index].x, points[index].y)
      tip = points[index]
      continue
    }
    const span = Math.max(1e-6, lengths[index] - lengths[index - 1])
    const t = Math.max(0, Math.min(1, (target - lengths[index - 1]) / span))
    tip = {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * t
    }
    ctx.lineTo(tip.x, tip.y)
    break
  }
  return tip
}

export function drawShapeElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const shape = element.shape
  if (!shape || shape.points.length === 0) return
  const samples = sampleShape(element, shape)
  const p = Math.max(0, Math.min(1, progress))

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  if (shape.closed && shape.fillEnabled && p > 0) {
    const fillAlpha = p >= 1 ? 1 : Math.max(0, Math.min(1, (p - 0.62) / 0.38))
    if (fillAlpha > 0) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha * fillAlpha))
      ctx.fillStyle = shape.fill
      buildPath(ctx, element, shape)
      ctx.fill()
      ctx.restore()
    }
  }

  let tip: LocalPoint | null = null
  if (shape.strokeEnabled && shape.strokeWidth > 0) {
    ctx.strokeStyle = shape.stroke
    ctx.lineWidth = shape.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (shape.strokeStyle === 'dashed') ctx.setLineDash([shape.strokeWidth * 2.4, shape.strokeWidth * 1.6])
    if (shape.strokeStyle === 'dotted') ctx.setLineDash([shape.strokeWidth * 0.4, shape.strokeWidth * 1.8])
    if (p >= 1) {
      buildPath(ctx, element, shape)
      tip = null
    } else {
      tip = trace(ctx, samples, p)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (tip && p > 0 && p < 1) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const handScale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.save()
      ctx.translate(tip.x, tip.y)
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

  ctx.restore()
}

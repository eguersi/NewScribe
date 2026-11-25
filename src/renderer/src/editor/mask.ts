import type { SceneElement } from '@shared/project'
import type { ViewportState } from './store'
import { translate } from './i18n'

export interface MaskVisual {
  element: SceneElement
  strength: number
  scaleX?: number
  scaleY?: number
  offsetX?: number
  offsetY?: number
  rotation?: number
}

export function maskMode(mask: SceneElement): 'previous' | 'all' | 'specific' {
  if (mask.mask?.targetMode) return mask.mask.targetMode
  if (mask.mask?.targetId === 'all') return 'all'
  if (mask.mask?.targetId) return 'specific'
  return 'previous'
}

export function maskAppliesTo(mask: SceneElement, elementId: string): boolean {
  const mode = maskMode(mask)
  if (mode === 'all') return true
  if (mode === 'specific') return mask.mask?.targetId === elementId
  return false
}

export function maskIsGlobal(mask: SceneElement): boolean {
  return maskMode(mask) !== 'specific'
}

function traceMaskPath(
  ctx: CanvasRenderingContext2D,
  visual: MaskVisual,
  viewport: ViewportState
): void {
  const { element } = visual
  const scaleX = Math.max(0.001, visual.scaleX ?? 1)
  const scaleY = Math.max(0.001, visual.scaleY ?? 1)
  const centerX = (element.x + element.width / 2) * viewport.scale + viewport.tx
  const centerY = (element.y + element.height / 2) * viewport.scale + viewport.ty
  const width = Math.max(0.01, element.width * viewport.scale * scaleX)
  const height = Math.max(0.01, element.height * viewport.scale * scaleY)
  ctx.save()
  ctx.translate(centerX + (visual.offsetX ?? 0), centerY + (visual.offsetY ?? 0))
  ctx.rotate(
    ((element.rotation + (visual.rotation ?? 0)) * Math.PI) / 180
  )
  if (element.mask?.shape === 'ellipse') {
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2)
  } else {
    ctx.rect(-width / 2, -height / 2, width, height)
  }
  ctx.restore()
}

/**
 * 用 evenodd 裁剪出“蒙版之外”的区域。
 * 只用于单元素遮罩；全局遮罩走 applyGlobalMasks 的合成流程。
 */
export function clipOutsideMasks(
  ctx: CanvasRenderingContext2D,
  masks: MaskVisual[],
  viewport: ViewportState
): void {
  const usable = masks.filter((item) => item.strength > 0.001)
  if (usable.length === 0) return

  ctx.beginPath()
  ctx.rect(-1_000_000, -1_000_000, 2_000_000, 2_000_000)
  for (const visual of usable) traceMaskPath(ctx, visual, viewport)
  ctx.clip('evenodd')
}

/** 把蒙版范围从目标图层中擦掉，保留透明度过渡。 */
export function eraseMasks(
  ctx: CanvasRenderingContext2D,
  masks: MaskVisual[],
  viewport: ViewportState
): void {
  for (const visual of masks) {
    if (visual.strength <= 0.001) continue
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = Math.max(0, Math.min(1, visual.strength))
    drawMaskPath(ctx, visual, viewport)
    ctx.fill()
    ctx.restore()
  }
}

function drawMaskPath(
  ctx: CanvasRenderingContext2D,
  visual: MaskVisual,
  viewport: ViewportState
): void {
  ctx.beginPath()
  traceMaskPath(ctx, visual, viewport)
}

/**
 * 全局蒙版用“擦除 + 回绘背景”实现真正的透明度。
 * 这样淡化不会变成尺寸放大，缩放/移动也只改变蒙版区域本身。
 */
export function applyGlobalMasks(
  ctx: CanvasRenderingContext2D,
  masks: MaskVisual[],
  background: HTMLCanvasElement,
  viewport: ViewportState,
  width: number,
  height: number
): void {
  const usable = masks.filter((item) => item.strength > 0.001)
  if (usable.length === 0) return
  for (const visual of usable) {
    ctx.save()
    drawMaskPath(ctx, visual, viewport)
    ctx.clip()
    ctx.globalAlpha = Math.max(0, Math.min(1, visual.strength))
    ctx.drawImage(background, 0, 0, width, height)
    ctx.restore()
  }
}

/**
 * 特定元素蒙版的淡化：只回绘目标元素范围内的背景，
 * 避免把同一区域内的其他元素也一起盖住。
 */
export function applyMaskFadeToElement(
  ctx: CanvasRenderingContext2D,
  visual: MaskVisual,
  target: SceneElement,
  background: HTMLCanvasElement,
  viewport: ViewportState,
  width: number,
  height: number
): void {
  if (visual.strength <= 0.001) return
  ctx.save()
  drawMaskPath(ctx, visual, viewport)
  ctx.clip()
  // 只限制到目标元素所在的轴对齐区域，不把目标元素自身的旋转带进蒙版。
  const left = target.x * viewport.scale + viewport.tx
  const top = target.y * viewport.scale + viewport.ty
  ctx.beginPath()
  ctx.rect(
    left,
    top,
    target.width * viewport.scale,
    target.height * viewport.scale
  )
  ctx.clip()
  ctx.globalAlpha = Math.max(0, Math.min(1, visual.strength))
  ctx.drawImage(background, 0, 0, width, height)
  ctx.restore()
}

/** 编辑器中用来标记透明蒙版位置的虚线框。 */
export function drawMaskOutlines(
  ctx: CanvasRenderingContext2D,
  masks: SceneElement[],
  viewport: ViewportState,
  lightMode: boolean
): void {
  if (masks.length === 0) return
  ctx.save()
  ctx.strokeStyle = lightMode ? 'rgba(180, 83, 9, 0.9)' : 'rgba(245, 165, 36, 0.9)'
  ctx.fillStyle = lightMode ? 'rgba(180, 83, 9, 0.9)' : 'rgba(245, 165, 36, 0.9)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 4])
  ctx.font = '11px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  for (const mask of masks) {
    const centerX = (mask.x + mask.width / 2) * viewport.scale + viewport.tx
    const centerY = (mask.y + mask.height / 2) * viewport.scale + viewport.ty
    const width = mask.width * viewport.scale
    const height = mask.height * viewport.scale
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate((mask.rotation * Math.PI) / 180)
    ctx.beginPath()
    if (mask.mask?.shape === 'ellipse') {
      ctx.ellipse(0, 0, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(-width / 2, -height / 2, width, height)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillText(translate('蒙版'), -width / 2 + 4, -height / 2 - 4)
    ctx.restore()
    ctx.setLineDash([6, 4])
  }
  ctx.restore()
}

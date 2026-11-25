import type { Project } from '@shared/project'
import { sampleTimeline, type Timeline } from '@shared/timeline'
import type { AssetRuntime } from './assets'
import { imageForElement } from './assets'
import { drawDrawElement, getDrawPlan } from './draw'
import { drawTextElement } from './text'
import { drawChartElement } from './chart'
import { drawQrElement } from './qr'
import { drawTableElement } from './table'
import { drawMindMapElement } from './mindmap'
import { drawBitmapElement, drawUnfoldElement } from './bitmapReveal'
import { drawShapeElement } from './shape'
import { drawMathElement } from './math'
import { drawMoleculeElement } from './molecule'
import { drawIpaElement } from './ipa'
import { drawBackgroundImage } from './background'
import { drawPaperTexture } from './texture'
import { imageFrameAt, imagePlayWindow } from './animation'
import { applyGlobalMasks, clipOutsideMasks, eraseMasks, maskAppliesTo, maskMode, type MaskVisual } from './mask'

export interface PreviewFrameInput {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  project: Project
  assets: Record<string, AssetRuntime>
  timeline: Timeline
  time: number
  /** 只渲染这个元素，用于特定元素蒙版的独立图层 */
  onlyElementId?: string
  /** 透明背景，只保留元素像素 */
  transparentBackground?: boolean
  /** 不处理蒙版，避免递归 */
  disableMasks?: boolean
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

function maskVisualFor(
  mask: import('@shared/project').SceneElement,
  progress: number,
  disappearT: number,
  screenUnit: number
): MaskVisual {
  let strength = 1
  let scaleX = 1
  let scaleY = 1
  let offsetX = 0
  let offsetY = 0
  let rotation = 0
  const kind = mask.appear.kind
  const distance = Math.max(mask.width, mask.height) * screenUnit

  if (kind === 'fade' || kind === 'typewriter') {
    strength = progress
  } else if (kind === 'zoom') {
    scaleX = progress
    scaleY = progress
  } else if (kind === 'unfold') {
    scaleY = progress
  } else if (kind === 'spin') {
    rotation = (1 - progress) * 120
  } else if (kind === 'move') {
    const direction = mask.appear.direction ?? 'left'
    const amount = distance * (1 - progress)
    if (direction === 'left') offsetX = -amount
    if (direction === 'right') offsetX = amount
    if (direction === 'top') offsetY = -amount
    if (direction === 'bottom') offsetY = amount
  } else {
    strength = progress
  }

  if (disappearT > 0) {
    if (kind === 'fade' || kind === 'typewriter' || kind === 'draw' || kind === 'bitmap') {
      strength *= 1 - disappearT
    } else if (kind === 'zoom') {
      scaleX *= 1 - disappearT
      scaleY *= 1 - disappearT
    } else if (kind === 'unfold') {
      scaleY *= 1 - disappearT
    } else if (kind === 'move') {
      const direction = mask.appear.direction ?? 'left'
      const amount = distance * disappearT
      if (direction === 'left') offsetX -= amount
      if (direction === 'right') offsetX += amount
      if (direction === 'top') offsetY -= amount
      if (direction === 'bottom') offsetY += amount
    }
  }

  return { element: mask, strength, scaleX, scaleY, offsetX, offsetY, rotation }
}

/**
 * 预览 / 导出共用的一帧渲染。
 * 与编辑器不同：这里用「元素机位」决定镜头，画布底色铺满整个画面。
 */
export function renderPreviewFrame(input: PreviewFrameInput): void {
  const {
    ctx,
    width,
    height,
    dpr,
    project,
    assets,
    timeline,
    time,
    onlyElementId,
    transparentBackground = false,
    disableMasks = false
  } = input
  const sample = sampleTimeline(project, timeline, time)

  const scale = (width * sample.camera.zoom) / project.canvas.width
  const translateX = width / 2 - sample.camera.x * scale
  const translateY = height / 2 - sample.camera.y * scale

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  if (transparentBackground) {
    ctx.clearRect(0, 0, width, height)
  } else {
    ctx.fillStyle = project.canvas.background
    ctx.fillRect(0, 0, width, height)
  }

  const background = project.canvas.backgroundImage
  const backgroundImage = background ? assets[background.assetId]?.image : null
  if (!transparentBackground && background && backgroundImage && background.fixed) {
    drawBackgroundImage(ctx, backgroundImage, 0, 0, width, height, background.fit)
  }

  ctx.save()
  ctx.translate(translateX, translateY)
  ctx.scale(scale, scale)

  if (!transparentBackground && background && backgroundImage && !background.fixed) {
    drawBackgroundImage(
      ctx,
      backgroundImage,
      0,
      0,
      project.canvas.width,
      project.canvas.height,
      background.fit
    )
  }

  const texture = project.canvas.texture
  if (!transparentBackground && texture && texture !== 'none') {
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawPaperTexture(
      ctx,
      width,
      height,
      texture,
      project.canvas.textureOpacity ?? 0.9,
      {
        fixed: project.canvas.textureFixed,
        scale,
        offsetX: translateX,
        offsetY: translateY
      }
    )
    ctx.restore()
  }

  const maskElements = disableMasks
    ? []
    : project.elements.filter((element) => element.kind === 'mask')
  const allMasks = maskElements.filter((mask) => maskMode(mask) === 'all')
  const previousMasks = maskElements.filter((mask) => maskMode(mask) === 'previous')
  const visualOfMask = (mask: (typeof maskElements)[number], screenUnit: number): MaskVisual | null => {
    const maskState = sample.elements[mask.id]
    if (!maskState || !maskState.visible) return null
    let disappearT = 0
    const maskTiming = timeline.timing[mask.id]
    const maskDisappear = mask.disappear ?? 0
    const maskDisappearEnabled = mask.disappearEnabled ?? maskDisappear > 0
    if (
      maskTiming &&
      maskDisappearEnabled &&
      maskDisappear > 0 &&
      time > (maskTiming.disappearStart ?? maskTiming.holdEnd)
    ) {
      disappearT = clamp01(
        (time - (maskTiming.disappearStart ?? maskTiming.holdEnd)) / maskDisappear
      )
    }
    return maskVisualFor(mask, maskState.progress, disappearT, screenUnit)
  }
  const allMaskVisuals = allMasks
    .map((mask) => visualOfMask(mask, scale))
    .filter((visual): visual is MaskVisual => Boolean(visual && visual.strength > 0.001))
  const specificFadeTargets = new Set(
    maskElements
      .filter((mask) => maskMode(mask) === 'specific' && mask.appear.kind === 'fade')
      .map((mask) => mask.mask?.targetId)
      .filter((id): id is string => Boolean(id))
  )

  let backgroundSnapshot: HTMLCanvasElement | null = null
  if (allMaskVisuals.length > 0 || previousMasks.length > 0) {
    backgroundSnapshot = document.createElement('canvas')
    backgroundSnapshot.width = width
    backgroundSnapshot.height = height
    backgroundSnapshot.getContext('2d')?.drawImage(ctx.canvas, 0, 0, width, height)
  }

  for (const element of project.elements) {
    if (onlyElementId && element.id !== onlyElementId) continue
    if (element.kind === 'mask') {
      if (backgroundSnapshot && maskMode(element) === 'previous') {
        const visual = visualOfMask(element, scale)
        if (visual && visual.strength > 0.001) {
          ctx.save()
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          applyGlobalMasks(
            ctx,
            [visual],
            backgroundSnapshot,
            { scale, tx: translateX, ty: translateY },
            width,
            height
          )
          ctx.restore()
        }
      }
      continue
    }
    const state = sample.elements[element.id]
    if (!state || !state.visible || state.progress <= 0) continue

    if (!onlyElementId && specificFadeTargets.has(element.id)) {
      const layer = document.createElement('canvas')
      layer.width = Math.max(1, Math.round(width * dpr))
      layer.height = Math.max(1, Math.round(height * dpr))
      const layerCtx = layer.getContext('2d')
      if (!layerCtx) continue
      renderPreviewFrame({
        ...input,
        ctx: layerCtx,
        onlyElementId: element.id,
        transparentBackground: true,
        disableMasks: true
      })
      const targetIndex = project.elements.indexOf(element)
      const visuals = maskElements
        .filter((mask) => {
          const mode = maskMode(mask)
          if (mode === 'specific') return maskAppliesTo(mask, element.id)
          if (mode === 'all') return true
          if (mode === 'previous') return project.elements.indexOf(mask) < targetIndex
          return false
        })
        .map((mask) => visualOfMask(mask, scale))
        .filter((visual): visual is MaskVisual => Boolean(visual && visual.strength > 0.001))
      layerCtx.save()
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      eraseMasks(layerCtx, visuals, { scale, tx: translateX, ty: translateY })
      layerCtx.restore()
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.drawImage(layer, 0, 0, width, height)
      ctx.restore()
      continue
    }

    const kind = element.appear.kind
    const timing = timeline.timing[element.id]
    const rawProgress =
      timing && element.appear.duration > 0
        ? clamp01((time - timing.appearStart) / element.appear.duration)
        : 1
    const opacity = element.opacity ?? 1
    const centerX = element.x + element.width / 2
    const centerY = element.y + element.height / 2

    let lifeAlpha = 1
    const disappear = element.disappear ?? 0
    const disappearEnabled = element.disappearEnabled ?? disappear > 0
    let disappearT = 0
    if (disappearEnabled && disappear > 0 && timing) {
      const disappearStart = timing.disappearStart ?? timing.holdEnd
      if (time > disappearStart) {
        disappearT = clamp01((time - disappearStart) / disappear)
        lifeAlpha = 1 - disappearT
      }
    }

    let alpha = state.progress
    let offsetX = 0
    let offsetY = 0
    let extraScale = 1
    let extraRotation = 0
    let reveal: number | undefined

    if (kind === 'move') {
      const remaining = 1 - state.progress
      const distance =
        element.appear.distance ?? Math.max(element.width, element.height) * 0.35
      const direction = element.appear.direction ?? 'left'
      if (direction === 'left') offsetX = -distance * remaining
      if (direction === 'right') offsetX = distance * remaining
      if (direction === 'top') offsetY = -distance * remaining
      if (direction === 'bottom') offsetY = distance * remaining
      alpha = Math.min(1, state.progress * 2)
    } else if (kind === 'zoom') {
      extraScale = 0.45 + 0.55 * state.progress
      alpha = Math.min(1, state.progress * 1.7)
    } else if (kind === 'spin') {
      extraScale = 0.55 + 0.45 * state.progress
      extraRotation = (1 - state.progress) * -Math.PI * 0.85
      alpha = Math.min(1, state.progress * 1.5)
    } else if (kind === 'typewriter') {
      reveal = rawProgress
      alpha = 1
    }

    if (kind !== 'fade' && !element.appear.fadeIn) {
      alpha = 1
    } else if (kind !== 'fade' && element.appear.fadeIn) {
      alpha = Math.min(alpha, state.progress)
    }

    if (disappearT > 0) {
      const disappearKind = element.disappearKind ?? 'fade'
      if (disappearKind !== 'fade' && element.disappearFadeOut) {
        lifeAlpha *= 1 - disappearT
      }
      if (disappearKind === 'zoom') {
        extraScale *= 1 - 0.8 * disappearT
      } else if (disappearKind === 'spin') {
        extraRotation += disappearT * Math.PI * 1.2
      } else if (disappearKind === 'move') {
        const distance = Math.max(element.width, element.height) * 0.28 * disappearT
        const direction = element.disappearDirection ?? 'top'
        if (direction === 'left') offsetX -= distance
        if (direction === 'right') offsetX += distance
        if (direction === 'top') offsetY -= distance
        if (direction === 'bottom') offsetY += distance
      }
    }
    if (lifeAlpha <= 0) continue
    const activeMasks = maskElements.flatMap((mask) => {
      if (maskMode(mask) !== 'specific' || !maskAppliesTo(mask, element.id)) return []
      // 淡化交给整帧背景合成，避免裁剪成突然消失。
      if (mask.appear.kind === 'fade') return []
      const visual = visualOfMask(mask, 1)
      return visual && visual.strength > 0.001 ? [visual] : []
    })
    const masked = activeMasks.length > 0
    if (masked) {
      ctx.save()
      clipOutsideMasks(ctx, activeMasks, {
        scale: 1,
        tx: 0,
        ty: 0
      })
    }
    try {
    const progressive = kind === 'draw' || kind === 'bitmap' || kind === 'chart'

    if (kind === 'bitmap') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawBitmapElement(
        ctx,
        element,
        assets,
        rawProgress,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (kind === 'unfold') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawUnfoldElement(
        ctx,
        element,
        assets,
        rawProgress,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'qr') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      if (kind === 'draw') {
        drawBitmapElement(
          ctx,
          element,
          assets,
          rawProgress,
          clamp01(alpha * opacity * lifeAlpha),
          scale * extraScale
        )
      } else {
        drawQrElement(
          ctx,
          element,
          progressive ? rawProgress : 1,
          clamp01(alpha * opacity * lifeAlpha),
          scale * extraScale
        )
      }
      ctx.restore()
      continue
    }

    if (element.kind === 'mindmap') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawMindMapElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'math') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawMathElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'molecule') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawMoleculeElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'ipa') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawIpaElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'shape') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawShapeElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'table') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawTableElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha),
        scale * extraScale
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'chart') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawChartElement(
        ctx,
        element,
        progressive ? rawProgress : 1,
        clamp01(alpha * opacity * lifeAlpha)
      )
      ctx.restore()
      continue
    }

    if (element.kind === 'text') {
      ctx.save()
      ctx.translate(centerX + offsetX, centerY + offsetY)
      ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(extraScale, extraScale)
      drawTextElement(ctx, element, { alpha: clamp01(alpha * opacity * lifeAlpha), reveal })
      ctx.restore()
      continue
    }
    const asset = assets[element.assetId]
    if (!asset) continue

    if (progressive) {
      const plan = getDrawPlan(element.id)
      if (plan && (plan.fillImage || asset.image)) {
        ctx.globalAlpha = 1
        drawDrawElement(
          ctx,
          element,
          plan,
          rawProgress,
          asset,
          scale,
          dpr,
          opacity * lifeAlpha * alpha,
          extraScale,
          extraRotation,
          offsetX,
          offsetY
        )
        continue
      }
      alpha = 1
    }

    if (!asset.image && !asset.animation) continue

    const revealWidth = progressive ? element.width * rawProgress : element.width
    const playbackWindow =
      element.kind === 'image' && asset.animation ? imagePlayWindow(element, timeline) : null
    const animatedFrame =
      playbackWindow && asset.animation
        ? imageFrameAt(asset.animation, element.imagePlayback, playbackWindow, time)
        : null

    ctx.save()
    ctx.globalAlpha = clamp01(alpha * opacity * lifeAlpha)
    ctx.translate(centerX + offsetX, centerY + offsetY)
    ctx.rotate((element.rotation * Math.PI) / 180 + extraRotation)
    ctx.scale(extraScale, extraScale)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (progressive) {
      ctx.beginPath()
      ctx.rect(-element.width / 2, -element.height / 2, revealWidth, element.height)
      ctx.clip()
    }
    const image = animatedFrame ?? imageForElement(element, asset)
    if (image) {
      ctx.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height)
    }
    ctx.restore()
    } finally {
      if (masked) ctx.restore()
    }
  }

  ctx.restore()

  if (backgroundSnapshot) {
    applyGlobalMasks(
      ctx,
      allMaskVisuals,
      backgroundSnapshot,
      { scale, tx: translateX, ty: translateY },
      width,
      height
    )
  }
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

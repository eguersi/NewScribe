import type { Project, SceneElement } from '@shared/project'
import type { ViewportState } from './store'
import type { AssetRuntime } from './assets'
import { imageForElement } from './assets'
import { drawTextElement } from './text'
import { drawChartElement } from './chart'
import { drawQrElement } from './qr'
import { drawTableElement } from './table'
import { drawMindMapElement } from './mindmap'
import { drawShapeElement } from './shape'
import { drawMathElement } from './math'
import { drawMoleculeElement } from './molecule'
import { drawIpaElement } from './ipa'
import { drawBackgroundImage } from './background'
import { drawPaperTexture } from './texture'
import { applyGlobalMasks, clipOutsideMasks, drawMaskOutlines, maskIsGlobal, maskMode, maskAppliesTo } from './mask'
import { translate } from './i18n'

export interface Point {
  x: number
  y: number
}

export function worldToScreen(viewport: ViewportState, x: number, y: number): Point {
  return { x: x * viewport.scale + viewport.tx, y: y * viewport.scale + viewport.ty }
}

export function screenToWorld(viewport: ViewportState, x: number, y: number): Point {
  return { x: (x - viewport.tx) / viewport.scale, y: (y - viewport.ty) / viewport.scale }
}

export function elementCenter(element: SceneElement): Point {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 }
}

export function localToWorld(element: SceneElement, localX: number, localY: number): Point {
  const center = elementCenter(element)
  const angle = (element.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const x = element.flipX ? -localX : localX
  return {
    x: center.x + x * cos - localY * sin,
    y: center.y + x * sin + localY * cos
  }
}

export function worldToLocal(element: SceneElement, x: number, y: number): Point {
  const center = elementCenter(element)
  const angle = (-element.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const localX = (x - center.x) * cos - (y - center.y) * sin
  return {
    x: element.flipX ? -localX : localX,
    y: (x - center.x) * sin + (y - center.y) * cos
  }
}

export function hitTestElement(element: SceneElement, worldX: number, worldY: number): boolean {
  const local = worldToLocal(element, worldX, worldY)
  if (element.kind === 'mask' && element.mask?.shape === 'ellipse') {
    const rx = Math.max(1, element.width / 2)
    const ry = Math.max(1, element.height / 2)
    return (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry) <= 1
  }
  return Math.abs(local.x) <= element.width / 2 && Math.abs(local.y) <= element.height / 2
}

export function elementAt(
  project: Project,
  viewport: ViewportState,
  screenX: number,
  screenY: number
): SceneElement | null {
  const world = screenToWorld(viewport, screenX, screenY)
  for (let index = project.elements.length - 1; index >= 0; index -= 1) {
    if (hitTestElement(project.elements[index], world.x, world.y)) return project.elements[index]
  }
  return null
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface HandlePoint {
  id: HandleId
  x: number
  y: number
}

export function handlePoints(element: SceneElement, viewport: ViewportState): HandlePoint[] {
  const halfW = element.width / 2
  const halfH = element.height / 2
  const locals: Array<[HandleId, number, number]> = [
    ['nw', -halfW, -halfH],
    ['n', 0, -halfH],
    ['ne', halfW, -halfH],
    ['e', halfW, 0],
    ['se', halfW, halfH],
    ['s', 0, halfH],
    ['sw', -halfW, halfH],
    ['w', -halfW, 0]
  ]
  return locals.map(([id, localX, localY]) => {
    const world = localToWorld(element, localX, localY)
    return { id, ...worldToScreen(viewport, world.x, world.y) }
  })
}

export function rotateHandlePoint(element: SceneElement, viewport: ViewportState): Point {
  const topWorld = localToWorld(element, 0, -element.height / 2)
  const top = worldToScreen(viewport, topWorld.x, topWorld.y)
  const angle = (element.rotation * Math.PI) / 180
  return { x: top.x + Math.sin(angle) * 28, y: top.y - Math.cos(angle) * 28 }
}

export function handleAt(
  element: SceneElement,
  viewport: ViewportState,
  screenX: number,
  screenY: number,
  radius = 9
): HandleId | 'rotate' | null {
  const rotate = rotateHandlePoint(element, viewport)
  if (Math.hypot(rotate.x - screenX, rotate.y - screenY) <= radius + 3) return 'rotate'

  for (const handle of handlePoints(element, viewport)) {
    if (Math.abs(handle.x - screenX) <= radius && Math.abs(handle.y - screenY) <= radius) {
      return handle.id
    }
  }
  return null
}

export interface SceneRenderInput {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  project: Project
  assets: Record<string, AssetRuntime>
  viewport: ViewportState
  selectedIds: string[]
  showOutputFrame: boolean
  showCanvasOutside: boolean
  lightMode: boolean
  animationFrame?: { elementId: string; image: CanvasImageSource }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: ViewportState,
  lightMode: boolean
): void {
  const step = 32
  const offsetX = ((viewport.tx % step) + step) % step
  const offsetY = ((viewport.ty % step) + step) % step
  ctx.fillStyle = lightMode ? 'rgba(0,0,0,0.075)' : 'rgba(255,255,255,0.045)'
  for (let x = offsetX; x < width; x += step) {
    for (let y = offsetY; y < height; y += step) {
      ctx.fillRect(x, y, 1.5, 1.5)
    }
  }
}

export function selectionBounds(elements: SceneElement[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    minX = Math.min(minX, element.x)
    minY = Math.min(minY, element.y)
    maxX = Math.max(maxX, element.x + element.width)
    maxY = Math.max(maxY, element.y + element.height)
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

export function groupCornerPoints(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: ViewportState
): Array<{ id: 'nw' | 'ne' | 'se' | 'sw'; x: number; y: number }> {
  const corners: Array<['nw' | 'ne' | 'se' | 'sw', number, number]> = [
    ['nw', bounds.x, bounds.y],
    ['ne', bounds.x + bounds.width, bounds.y],
    ['se', bounds.x + bounds.width, bounds.y + bounds.height],
    ['sw', bounds.x, bounds.y + bounds.height]
  ]
  return corners.map(([id, x, y]) => ({ id, ...worldToScreen(viewport, x, y) }))
}

export function renderScene(input: SceneRenderInput): void {
  const { ctx, width, height, dpr, project, assets, viewport, selectedIds, showOutputFrame, showCanvasOutside, lightMode, animationFrame } = input
  const primaryId = selectedIds[selectedIds.length - 1] ?? null

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = showCanvasOutside ? project.canvas.background : lightMode ? '#e6eaf1' : '#0a0c10'
  ctx.fillRect(0, 0, width, height)
  drawGrid(ctx, width, height, viewport, lightMode)

  const board = {
    x: viewport.tx,
    y: viewport.ty,
    width: project.canvas.width * viewport.scale,
    height: project.canvas.height * viewport.scale
  }

  ctx.save()
  ctx.shadowColor = lightMode ? 'rgba(15,23,42,0.18)' : 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetY = 12
  ctx.fillStyle = project.canvas.background
  ctx.fillRect(board.x, board.y, board.width, board.height)
  ctx.restore()

  ctx.save()

  const background = project.canvas.backgroundImage
  const backgroundImage = background ? assets[background.assetId]?.image : null
  if (background && backgroundImage) {
    ctx.save()
    ctx.translate(viewport.tx, viewport.ty)
    ctx.scale(viewport.scale, viewport.scale)
    drawBackgroundImage(
      ctx,
      backgroundImage,
      0,
      0,
      project.canvas.width,
      project.canvas.height,
      background.fit
    )
    ctx.restore()
  }

  const texture = project.canvas.texture
  if (texture && texture !== 'none') {
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!showCanvasOutside) {
      ctx.beginPath()
      ctx.rect(board.x, board.y, board.width, board.height)
      ctx.clip()
    }
    drawPaperTexture(
      ctx,
      width,
      height,
      texture,
      project.canvas.textureOpacity ?? 0.9,
      {
        fixed: project.canvas.textureFixed,
        scale: viewport.scale,
        offsetX: viewport.tx,
        offsetY: viewport.ty
      }
    )
    ctx.restore()
  }

  const maskElements = project.elements.filter((element) => element.kind === 'mask')
  const allMasks = maskElements.filter((mask) => maskMode(mask) === 'all')
  const previousMasks = maskElements.filter((mask) => maskMode(mask) === 'previous')
  let backgroundSnapshot: HTMLCanvasElement | null = null
  if (allMasks.length > 0 || previousMasks.length > 0) {
    backgroundSnapshot = document.createElement('canvas')
    backgroundSnapshot.width = width
    backgroundSnapshot.height = height
    backgroundSnapshot.getContext('2d')?.drawImage(ctx.canvas, 0, 0, width, height)
  }

  for (const element of project.elements) {
    if (element.kind === 'mask') {
      if (backgroundSnapshot && maskMode(element) === 'previous') {
        applyGlobalMasks(
          ctx,
          [{ element, strength: 1 }],
          backgroundSnapshot,
          viewport,
          width,
          height
        )
      }
      continue
    }
    const masks = project.elements.filter(
      (item) => item.kind === 'mask' && !maskIsGlobal(item) && maskAppliesTo(item, element.id)
    )
    const hasMasks = masks.length > 0
    if (hasMasks) {
      ctx.save()
      clipOutsideMasks(
        ctx,
        masks.map((mask) => ({ element: mask, strength: 1 })),
        viewport
      )
    }
    if (element.kind === 'chart') {
      const center = elementCenter(element)
      const screen = worldToScreen(viewport, center.x, center.y)
      ctx.save()
      ctx.translate(screen.x, screen.y)
      ctx.rotate((element.rotation * Math.PI) / 180)
      if (element.flipX) ctx.scale(-1, 1)
      ctx.scale(viewport.scale, viewport.scale)
      drawChartElement(ctx, element, 1, element.opacity ?? 1)
      ctx.restore()
      if (hasMasks) ctx.restore()
      continue
    }
    const runtime = assets[element.assetId]
    const image =
      animationFrame?.elementId === element.id
        ? animationFrame.image
        : imageForElement(element, runtime)
    const center = elementCenter(element)
    const screen = worldToScreen(viewport, center.x, center.y)
    const opacity = element.opacity ?? 1

    ctx.save()
    ctx.translate(screen.x, screen.y)
    ctx.rotate((element.rotation * Math.PI) / 180)
    if (element.flipX) ctx.scale(-1, 1)
    ctx.scale(viewport.scale, viewport.scale)

    if (element.kind === 'text') {
      drawTextElement(ctx, element, { alpha: opacity })
    } else if (element.kind === 'qr') {
      drawQrElement(ctx, element, 1, opacity)
    } else if (element.kind === 'table') {
      drawTableElement(ctx, element, 1, opacity)
    } else if (element.kind === 'mindmap') {
      drawMindMapElement(ctx, element, 1, opacity)
    } else if (element.kind === 'shape') {
      drawShapeElement(ctx, element, 1, opacity)
    } else if (element.kind === 'math') {
      drawMathElement(ctx, element, 1, opacity)
    } else if (element.kind === 'molecule') {
      drawMoleculeElement(ctx, element, 1, opacity)
    } else if (element.kind === 'ipa') {
      drawIpaElement(ctx, element, 1, opacity)
    } else if (image) {
      ctx.globalAlpha = opacity
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height)
    } else {
      ctx.strokeStyle = 'rgba(255,107,107,0.9)'
      ctx.lineWidth = 2 / viewport.scale
      ctx.setLineDash([8 / viewport.scale, 6 / viewport.scale])
      ctx.strokeRect(-element.width / 2, -element.height / 2, element.width, element.height)
    }
    ctx.restore()

    if (!image && element.kind !== 'text' && element.kind !== 'qr' && element.kind !== 'table' && element.kind !== 'mindmap' && element.kind !== 'shape' && element.kind !== 'math' && element.kind !== 'molecule' && element.kind !== 'ipa') {
      ctx.fillStyle = 'rgba(255,107,107,0.9)'
      ctx.font = '12px "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(translate('素材丢失'), screen.x, screen.y + 4)
      ctx.textAlign = 'start'
    }
    if (hasMasks) ctx.restore()
  }
  ctx.restore()

  if (backgroundSnapshot) {
    applyGlobalMasks(
      ctx,
      allMasks.map((mask) => ({ element: mask, strength: 1 })),
      backgroundSnapshot,
      viewport,
      width,
      height
    )
  }

  drawMaskOutlines(ctx, project.elements.filter((element) => element.kind === 'mask'), viewport, lightMode)

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.strokeRect(board.x + 0.5, board.y + 0.5, board.width - 1, board.height - 1)

  if (showOutputFrame) {
    const selected = project.elements.find((element) => element.id === primaryId)
    const camera = selected?.camera ?? {
      x: project.canvas.width / 2,
      y: project.canvas.height / 2,
      zoom: 1
    }
    const zoom = Math.max(0.05, camera.zoom)
    const frameWidth = (project.canvas.width / zoom) * viewport.scale
    const frameHeight = (project.canvas.height / zoom) * viewport.scale
    const topLeft = worldToScreen(
      viewport,
      camera.x - project.canvas.width / zoom / 2,
      camera.y - project.canvas.height / zoom / 2
    )

    ctx.save()
    ctx.strokeStyle = '#4da3ff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.strokeRect(topLeft.x, topLeft.y, frameWidth, frameHeight)
    ctx.fillStyle = '#4da3ff'
    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.fillText(translate('输出画面'), topLeft.x + 6, topLeft.y - 7)
    ctx.restore()
  }

  const selectedElements = project.elements.filter((element) => selectedIds.includes(element.id))

  if (selectedElements.length === 1) {
    const selected = selectedElements[0]
    const corners = (
      [
        [-selected.width / 2, -selected.height / 2],
        [selected.width / 2, -selected.height / 2],
        [selected.width / 2, selected.height / 2],
        [-selected.width / 2, selected.height / 2]
      ] as Array<[number, number]>
    ).map(([localX, localY]) => {
      const world = localToWorld(selected, localX, localY)
      return worldToScreen(viewport, world.x, world.y)
    })

    ctx.strokeStyle = '#f5a524'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let index = 1; index < corners.length; index += 1) ctx.lineTo(corners[index].x, corners[index].y)
    ctx.closePath()
    ctx.stroke()

    const rotate = rotateHandlePoint(selected, viewport)
    const topWorld = localToWorld(selected, 0, -selected.height / 2)
    const top = worldToScreen(viewport, topWorld.x, topWorld.y)
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(rotate.x, rotate.y)
    ctx.stroke()

    ctx.fillStyle = '#f5a524'
    ctx.beginPath()
    ctx.arc(rotate.x, rotate.y, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#101319'
    ctx.strokeStyle = '#f5a524'
    ctx.lineWidth = 1.5
    for (const handle of handlePoints(selected, viewport)) {
      ctx.beginPath()
      ctx.rect(handle.x - 4.5, handle.y - 4.5, 9, 9)
      ctx.fill()
      ctx.stroke()
    }
  } else if (selectedElements.length > 1) {
    ctx.save()
    ctx.strokeStyle = 'rgba(245,165,36,0.6)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    for (const element of selectedElements) {
      const corners = (
        [
          [-element.width / 2, -element.height / 2],
          [element.width / 2, -element.height / 2],
          [element.width / 2, element.height / 2],
          [-element.width / 2, element.height / 2]
        ] as Array<[number, number]>
      ).map(([localX, localY]) => {
        const world = localToWorld(element, localX, localY)
        return worldToScreen(viewport, world.x, world.y)
      })
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let index = 1; index < corners.length; index += 1) {
        ctx.lineTo(corners[index].x, corners[index].y)
      }
      ctx.closePath()
      ctx.stroke()
    }

    ctx.setLineDash([])
    const bounds = selectionBounds(selectedElements)
    const topLeft = worldToScreen(viewport, bounds.x, bounds.y)
    const bottomRight = worldToScreen(viewport, bounds.x + bounds.width, bounds.y + bounds.height)
    ctx.strokeStyle = '#f5a524'
    ctx.lineWidth = 1.5
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)

    ctx.fillStyle = '#101319'
    ctx.strokeStyle = '#f5a524'
    for (const handle of groupCornerPoints(bounds, viewport)) {
      ctx.beginPath()
      ctx.rect(handle.x - 4.5, handle.y - 4.5, 9, 9)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
}

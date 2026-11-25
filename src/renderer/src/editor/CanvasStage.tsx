import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { SceneElement } from '@shared/project'
import type { Project } from '@shared/project'
import { useEditorStore, type ViewportState } from './store'
import { Icon } from './Icon'
import { assetFromPath } from './assets'
import { frameAtLocal } from './animation'
import { useLanguage } from './i18n'
import { pasteExternal } from './paste'
import { drawQrElement } from './qr'
import { getMathSvg } from './math'
import { getMoleculeSvg } from './molecule'
import {
  elementAt,
  elementCenter,
  groupCornerPoints,
  handleAt,
  renderScene,
  screenToWorld,
  selectionBounds,
  worldToLocal,
  type HandleId
} from './render'

type DragKind = 'pan' | 'move' | 'scale' | 'rotate' | 'group-scale' | 'marquee'

interface DragState {
  kind: DragKind
  startX: number
  startY: number
  element?: SceneElement
  elements?: SceneElement[]
  group?: { bounds: { x: number; y: number; width: number; height: number }; startDistance: number }
  handle?: HandleId
  snapshot: Project
  startViewport: ViewportState
  moved: boolean
}

const HANDLE_SIGNS: Record<HandleId, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0]
}

export function CanvasStage({
  onPreviewFrom,
  onPreviewStart,
  lightMode,
  showCanvasOutside
}: {
  onPreviewFrom: (id: string) => void
  onPreviewStart: () => void
  lightMode: boolean
  showCanvasOutside: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const spaceRef = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [moleculeTick, setMoleculeTick] = useState(0)
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [cursor, setCursor] = useState('default')
  const [menu, setMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(null)
  const pendingShape = useEditorStore((state) => state.pendingShape)
  const pendingMask = useEditorStore((state) => state.pendingMask)
  const shapeDraftRef = useRef<{ kind: NonNullable<typeof pendingShape> | 'mask'; start: { x: number; y: number }; screenStart: { x: number; y: number } } | null>(null)
  const [shapeDraftRect, setShapeDraftRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [animationFrame, setAnimationFrame] = useState<{ elementId: string; image: ImageBitmap } | null>(null)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

  const project = useEditorStore((state) => state.project)
  const assets = useEditorStore((state) => state.assets)
  const animationPreview = useEditorStore((state) => state.animationPreview)
  const language = useLanguage()
  const menuElement = menu?.elementId
    ? project.elements.find((element) => element.id === menu.elementId) ?? null
    : null

  const exportElementImage = async (elementId: string): Promise<void> => {
    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element) return
    const runtime = useEditorStore.getState().assets[element.assetId]
    if (!runtime) return
    const extension = runtime.asset.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = await window.newscribe.saveDialog({
      title: '导出图像',
      defaultPath: runtime.asset.name,
      filters: [{ name: '图像', extensions: [extension] }]
    })
    if (!path) return
    const copy = runtime.bytes.slice()
    await window.newscribe.fs.writeBinary(path, copy.buffer as ArrayBuffer)
  }

  const exportQrImage = async (elementId: string): Promise<void> => {
    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'qr') return
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(size / 2, size / 2)
    drawQrElement(ctx, { ...element, width: size, height: size }, 1, 1)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const path = await window.newscribe.saveDialog({
      title: '导出二维码',
      defaultPath: 'qrcode.png',
      filters: [{ name: 'PNG 图像', extensions: ['png'] }]
    })
    if (!path) return
    const buffer = await blob.arrayBuffer()
    await window.newscribe.fs.writeBinary(path, buffer)
  }

  const exportTableCsv = async (elementId: string): Promise<void> => {
    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'table' || !element.table) return
    const rows = element.table.rows
    const columns = Math.max(1, ...rows.map((row) => row.length))
    const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`
    const csv = rows
      .map((row) => Array.from({ length: columns }, (_, index) => escape(row[index] ?? '')).join(','))
      .join('\r\n')
    const name = (element.table.title.trim() || '表格').replace(/[\\/:*?"<>|]/g, '_')
    const path = await window.newscribe.saveDialog({
      title: '导出表格',
      defaultPath: `${name}.csv`,
      filters: [{ name: 'CSV 表格', extensions: ['csv'] }]
    })
    if (!path) return
    const buffer = new TextEncoder().encode(`\uFEFF${csv}`).buffer
    await window.newscribe.fs.writeBinary(path, buffer)
  }

  const exportMoleculeSvg = async (elementId: string): Promise<void> => {
    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'molecule' || !element.molecule) return
    const markup = getMoleculeSvg(element.molecule.smiles, element.molecule.strokeWidth ?? 3)
    if (!markup) return
    const path = await window.newscribe.saveDialog({
      title: '导出分子结构 SVG',
      defaultPath: 'molecule.svg',
      filters: [{ name: 'SVG 结构图', extensions: ['svg'] }]
    })
    if (!path) return
    await window.newscribe.fs.writeBinary(path, new TextEncoder().encode(markup).buffer)
  }

  const exportMathSvg = async (elementId: string): Promise<void> => {    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'math' || !element.math) return
    const markup = getMathSvg(element.math.latex, element.math.displayMode, element.math.color)
    if (!markup) return
    const path = await window.newscribe.saveDialog({
      title: '导出公式 SVG',
      defaultPath: 'formula.svg',
      filters: [{ name: 'SVG 公式', extensions: ['svg'] }]
    })
    if (!path) return
    await window.newscribe.fs.writeBinary(path, new TextEncoder().encode(markup).buffer)
  }

  const exportShapeSvg = async (elementId: string): Promise<void> => {
    const element = useEditorStore.getState().project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'shape' || !element.shape) return
    const shape = element.shape
    const pointText = (point: { x: number; y: number }): string =>
      `${(point.x * element.width).toFixed(2)} ${(point.y * element.height).toFixed(2)}`
    const segments = shape.closed ? shape.points.length : shape.points.length - 1
    let d = ''
    if (shape.points.length > 0) {
      d = `M ${pointText(shape.points[0])}`
      for (let index = 0; index < segments; index += 1) {
        const a = shape.points[index]
        const b = shape.points[(index + 1) % shape.points.length]
        if (a.out || b.in) {
          d += ` C ${pointText(a.out ?? a)} ${pointText(b.in ?? b)} ${pointText(b)}`
        } else {
          d += ` L ${pointText(b)}`
        }
      }
      if (shape.closed) d += ' Z'
    }
    const dash = shape.strokeStyle === 'dashed'
      ? ` stroke-dasharray="${shape.strokeWidth * 2.4} ${shape.strokeWidth * 1.6}"`
      : shape.strokeStyle === 'dotted'
        ? ` stroke-dasharray="${shape.strokeWidth * 0.4} ${shape.strokeWidth * 1.8}"`
        : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${element.width}" height="${element.height}" viewBox="0 0 ${element.width} ${element.height}">\n  <path d="${d}" fill="${shape.fillEnabled && shape.closed ? shape.fill : 'none'}" stroke="${shape.strokeEnabled ? shape.stroke : 'none'}" stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}/>\n</svg>\n<!-- Created with NewScribe -->\n`
    const path = await window.newscribe.saveDialog({
      title: '导出图形 SVG',
      defaultPath: 'shape.svg',
      filters: [{ name: 'SVG 图形', extensions: ['svg'] }]
    })
    if (!path) return
    await window.newscribe.fs.writeBinary(path, new TextEncoder().encode(svg).buffer)
  }
  const viewport = useEditorStore((state) => state.viewport)
  const selectedId = useEditorStore((state) => state.selectedId)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const showOutputFrame = useEditorStore((state) => state.showOutputFrame)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: rect.width, height: rect.height })
      useEditorStore.getState().setViewSize({ width: rect.width, height: rect.height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onMoleculeReady = (): void => setMoleculeTick((value) => value + 1)
    window.addEventListener('newscribe:molecule-ready', onMoleculeReady)
    return () => window.removeEventListener('newscribe:molecule-ready', onMoleculeReady)
  }, [])

  useEffect(() => {
    const preview = animationPreview
    if (!preview) {
      setAnimationFrame(null)
      return
    }
    const element = project.elements.find((item) => item.id === preview.elementId)
    const animation = element ? assets[element.assetId]?.animation : undefined
    if (!element || !animation) {
      setAnimationFrame(null)
      return
    }
    const playback = element.imagePlayback ?? 'once'
    if (playback === 'first' || playback === 'last') {
      setAnimationFrame({ elementId: element.id, image: frameAtLocal(animation, playback, 0) })
      return
    }
    let raf = 0
    const tick = (): void => {
      const local = (performance.now() - preview.startedAt) / 1000
      setAnimationFrame({ elementId: element.id, image: frameAtLocal(animation, playback, local) })
      if (playback === 'once' && local >= animation.total) return
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [animationPreview, project.elements, assets])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(size.width * dpr))
    const pixelHeight = Math.max(1, Math.round(size.height * dpr))
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderScene({
      ctx,
      width: size.width,
      height: size.height,
      dpr,
      project,
      assets,
      viewport,
      selectedIds,
      showOutputFrame,
      showCanvasOutside,
      lightMode,
      animationFrame: animationFrame ?? undefined
    })
  }, [project, assets, viewport, selectedIds, size, showOutputFrame, showCanvasOutside, lightMode, moleculeTick, animationFrame, language])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = (event: WheelEvent): void => {
      event.preventDefault()
      const state = useEditorStore.getState()
      const rect = container.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top

      if (event.altKey) {
        const elements = state.project.elements
        if (elements.length === 0) return
        const currentId = state.selectedIds[state.selectedIds.length - 1] ?? state.selectedId
        const currentIndex = elements.findIndex((element) => element.id === currentId)
        const direction = event.deltaY >= 0 ? 1 : -1
        const nextIndex =
          currentIndex < 0
            ? direction > 0
              ? 0
              : elements.length - 1
            : (currentIndex + direction + elements.length) % elements.length
        state.select(elements[nextIndex].id)
        return
      }

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
      if (delta === 0) return

      if (event.shiftKey) {
        state.setViewport({
          ...state.viewport,
          tx: state.viewport.tx - delta
        })
        return
      }
      if (event.ctrlKey || event.metaKey) {
        state.setViewport({
          ...state.viewport,
          ty: state.viewport.ty - delta
        })
        return
      }

      const factor = Math.exp(-event.deltaY * 0.0016)
      const scale = Math.min(20, Math.max(0.04, state.viewport.scale * factor))
      const worldX = (px - state.viewport.tx) / state.viewport.scale
      const worldY = (py - state.viewport.ty) / state.viewport.scale
      state.setViewport({
        scale,
        tx: px - worldX * scale,
        ty: py - worldY * scale
      })
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceRef.current = true
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const beginPan = (point: { x: number; y: number }, snapshot: Project): DragState => ({
    kind: 'pan',
    startX: point.x,
    startY: point.y,
    snapshot,
    startViewport: useEditorStore.getState().viewport,
    moved: false
  })

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    setMenu(null)
    const point = pointOf(event)
    lastPointerRef.current = point
    const state = useEditorStore.getState()
    if ((state.pendingShape || state.pendingMask) && event.button === 0) {
      const world = screenToWorld(state.viewport, point.x, point.y)
      shapeDraftRef.current = {
        kind: state.pendingMask ? 'mask' : state.pendingShape!,
        start: world,
        screenStart: point
      }
      setShapeDraftRect({ x: point.x, y: point.y, width: 0, height: 0 })
      canvas.setPointerCapture(event.pointerId)
      setCursor('crosshair')
      return
    }
    const selectedElements = state.project.elements.filter((element) =>
      state.selectedIds.includes(element.id)
    )
    const primary = selectedElements[selectedElements.length - 1] ?? null
    const snapshot = structuredClone(state.project)

    let drag: DragState | null = null

    if (event.button === 1 || spaceRef.current || event.altKey) {
      drag = beginPan(point, snapshot)
    } else if (event.button === 0 && event.shiftKey) {
      drag = {
        kind: 'marquee',
        startX: point.x,
        startY: point.y,
        snapshot,
        startViewport: state.viewport,
        moved: false
      }
      setMarqueeRect({ x: point.x, y: point.y, width: 0, height: 0 })
    } else if (event.button === 0) {
      if (selectedElements.length === 1 && primary) {
        const handle = handleAt(primary, state.viewport, point.x, point.y)
        if (handle === 'rotate') {
          drag = { kind: 'rotate', startX: point.x, startY: point.y, element: primary, snapshot, startViewport: state.viewport, moved: false }
        } else if (handle) {
          drag = { kind: 'scale', startX: point.x, startY: point.y, element: primary, handle, snapshot, startViewport: state.viewport, moved: false }
        }
      } else if (selectedElements.length > 1) {
        const bounds = selectionBounds(selectedElements)
        for (const corner of groupCornerPoints(bounds, state.viewport)) {
          if (Math.abs(corner.x - point.x) <= 9 && Math.abs(corner.y - point.y) <= 9) {
            const center = {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2
            }
            const world = screenToWorld(state.viewport, point.x, point.y)
            drag = {
              kind: 'group-scale',
              startX: point.x,
              startY: point.y,
              elements: structuredClone(selectedElements),
              group: {
                bounds,
                startDistance: Math.max(1, Math.hypot(world.x - center.x, world.y - center.y))
              },
              snapshot,
              startViewport: state.viewport,
              moved: false
            }
            break
          }
        }
      }

      if (!drag) {
        const hit = elementAt(state.project, state.viewport, point.x, point.y)
        if (hit) {
          const additive = event.ctrlKey || event.metaKey
          if (additive) {
            state.select(hit.id, true)
            return
          }
          if (!state.selectedIds.includes(hit.id)) state.select(hit.id)
          const latest = useEditorStore.getState()
          drag = {
            kind: 'move',
            startX: point.x,
            startY: point.y,
            elements: latest.project.elements.filter((element) =>
              latest.selectedIds.includes(element.id)
            ),
            snapshot,
            startViewport: state.viewport,
            moved: false
          }
        } else {
          if (!event.ctrlKey && !event.metaKey) state.select(null)
          drag = beginPan(point, snapshot)
        }
      }
    }

    if (drag) {
      dragRef.current = drag
      canvas.setPointerCapture(event.pointerId)
      setCursor(drag.kind === 'pan' ? 'grabbing' : drag.kind === 'marquee' ? 'crosshair' : 'default')
    }
  }

  useEffect(() => {
    let frame = 0
    const tick = (): void => {
      const drag = dragRef.current
      const pointer = lastPointerRef.current
      const container = containerRef.current
      if (drag?.kind === 'move' && drag.elements && pointer && container) {
        const rect = container.getBoundingClientRect()
        const margin = 54
        let panX = 0
        let panY = 0
        if (pointer.x < margin) panX = 4 + ((margin - pointer.x) / margin) * 10
        else if (pointer.x > rect.width - margin) {
          panX = -(4 + ((pointer.x - (rect.width - margin)) / margin) * 10)
        }
        if (pointer.y < margin) panY = 4 + ((margin - pointer.y) / margin) * 10
        else if (pointer.y > rect.height - margin) {
          panY = -(4 + ((pointer.y - (rect.height - margin)) / margin) * 10)
        }
        if (panX !== 0 || panY !== 0) {
          const state = useEditorStore.getState()
          const scale = Math.max(0.02, state.viewport.scale)
          state.setViewport({
            ...state.viewport,
            tx: state.viewport.tx + panX,
            ty: state.viewport.ty + panY
          })
          for (const item of drag.elements) {
            const current = useEditorStore
              .getState()
              .project.elements.find((element) => element.id === item.id)
            if (!current) continue
            state.updateElement(
              item.id,
              { x: current.x - panX / scale, y: current.y - panY / scale },
              false
            )
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (shapeDraftRef.current) {
      const point = pointOf(event)
      const start = shapeDraftRef.current.screenStart
      setShapeDraftRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y)
      })
      setCursor('crosshair')
      return
    }
    const drag = dragRef.current
    if (!drag) return
    const point = pointOf(event)
    lastPointerRef.current = point
    const state = useEditorStore.getState()

    if (drag.kind === 'marquee') {
      setMarqueeRect({
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.abs(point.x - drag.startX),
        height: Math.abs(point.y - drag.startY)
      })
      setCursor('crosshair')
      return
    }

    if (drag.kind === 'pan') {
      const dx = point.x - drag.startX
      const dy = point.y - drag.startY
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
      state.setViewport({
        scale: drag.startViewport.scale,
        tx: drag.startViewport.tx + dx,
        ty: drag.startViewport.ty + dy
      })
      return
    }

    const element = drag.element

    if (drag.kind === 'group-scale' && drag.group && drag.elements) {
      const world = screenToWorld(state.viewport, point.x, point.y)
      const center = {
        x: drag.group.bounds.x + drag.group.bounds.width / 2,
        y: drag.group.bounds.y + drag.group.bounds.height / 2
      }
      const distance = Math.hypot(world.x - center.x, world.y - center.y)
      const factor = Math.min(10, Math.max(0.1, distance / drag.group.startDistance))
      if (Math.abs(factor - 1) > 0.005) drag.moved = true
      for (const item of drag.elements) {
        state.updateElement(
          item.id,
          {
            x: center.x + (item.x - center.x) * factor,
            y: center.y + (item.y - center.y) * factor,
            width: item.width * factor,
            height: item.height * factor
          },
          false
        )
      }
      return
    }

    if (drag.kind === 'move' && drag.elements) {
      const startWorld = screenToWorld(drag.startViewport, drag.startX, drag.startY)
      const world = screenToWorld(state.viewport, point.x, point.y)
      const dx = world.x - startWorld.x
      const dy = world.y - startWorld.y
      if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true
      for (const item of drag.elements) {
        state.updateElement(item.id, { x: item.x + dx, y: item.y + dy }, false)
      }
      return
    }

    if (!element) return

    if (drag.kind === 'move') {
      const startWorld = screenToWorld(drag.startViewport, drag.startX, drag.startY)
      const world = screenToWorld(state.viewport, point.x, point.y)
      const dx = world.x - startWorld.x
      const dy = world.y - startWorld.y
      if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.moved = true
      state.updateElement(element.id, { x: element.x + dx, y: element.y + dy }, false)
      return
    }

    const world = screenToWorld(state.viewport, point.x, point.y)

    if (drag.kind === 'rotate') {
      const center = elementCenter(element)
      const startWorld = screenToWorld(drag.startViewport, drag.startX, drag.startY)
      const angleStart = Math.atan2(startWorld.y - center.y, startWorld.x - center.x)
      const angleNow = Math.atan2(world.y - center.y, world.x - center.x)
      let rotation = element.rotation + ((angleNow - angleStart) * 180) / Math.PI
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      drag.moved = true
      state.updateElement(element.id, { rotation }, false)
      return
    }

    if (drag.kind === 'scale' && drag.handle) {
      const [sx, sy] = HANDLE_SIGNS[drag.handle]
      const halfW = element.width / 2
      const halfH = element.height / 2
      const anchor = { x: -sx * halfW, y: -sy * halfH }
      const local = worldToLocal(element, world.x, world.y)

      let width = element.width
      let height = element.height
      if (sx !== 0) width = Math.max(8, Math.abs(local.x - anchor.x))
      if (sy !== 0) height = Math.max(8, Math.abs(local.y - anchor.y))

      if (sx !== 0 && sy !== 0) {
        const ratio = Math.max(width / element.width, height / element.height)
        width = element.width * ratio
        height = element.height * ratio
      }

      const center = elementCenter(element)
      const centerLocal = {
        x: anchor.x + (sx !== 0 ? sx * (width / 2) : 0),
        y: anchor.y + (sy !== 0 ? sy * (height / 2) : 0)
      }
      const angle = (element.rotation * Math.PI) / 180
      const worldCenter = {
        x: center.x + centerLocal.x * Math.cos(angle) - centerLocal.y * Math.sin(angle),
        y: center.y + centerLocal.x * Math.sin(angle) + centerLocal.y * Math.cos(angle)
      }

      drag.moved = true
      state.updateElement(
        element.id,
        {
          width,
          height,
          x: worldCenter.x - width / 2,
          y: worldCenter.y - height / 2
        },
        false
      )
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (shapeDraftRef.current) {
      const draft = shapeDraftRef.current
      shapeDraftRef.current = null
      setShapeDraftRect(null)
      const state = useEditorStore.getState()
      const point = pointOf(event)
      const world = screenToWorld(state.viewport, point.x, point.y)
      const width = Math.abs(world.x - draft.start.x)
      const height = Math.abs(world.y - draft.start.y)
      const screenUnit = 1 / Math.max(0.02, state.viewport.scale)
      const rect = width < 10 || height < 10
        ? { x: draft.start.x - 120 * screenUnit, y: draft.start.y - 80 * screenUnit, width: 240 * screenUnit, height: 160 * screenUnit }
        : {
            x: Math.min(draft.start.x, world.x),
            y: Math.min(draft.start.y, world.y),
            width,
            height
          }
      if (draft.kind === 'mask') state.addMask(rect)
      else state.addShape(rect, draft.kind)
      setCursor('default')
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
        canvasRef.current.releasePointerCapture(event.pointerId)
      }
      return
    }
    const drag = dragRef.current
    dragRef.current = null
    setCursor('default')
    if (drag?.kind === 'marquee') {
      setMarqueeRect(null)
      const state = useEditorStore.getState()
      const point = pointOf(event)
      const start = screenToWorld(drag.startViewport, drag.startX, drag.startY)
      const end = screenToWorld(state.viewport, point.x, point.y)
      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)
      const ids =
        Math.abs(point.x - drag.startX) < 3 && Math.abs(point.y - drag.startY) < 3
          ? []
          : state.project.elements
              .filter(
                (element) =>
                  element.x + element.width >= minX &&
                  element.x <= maxX &&
                  element.y + element.height >= minY &&
                  element.y <= maxY
              )
              .map((element) => element.id)
      state.selectMany(ids)
    }
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId)
    }
    if (drag && drag.moved && drag.kind !== 'pan' && drag.kind !== 'marquee') {
      useEditorStore.getState().pushHistory(drag.snapshot)
    }
  }

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>): void => {
    const point = pointOf(event)
    const state = useEditorStore.getState()
    const hit = elementAt(state.project, state.viewport, point.x, point.y)
    if (hit) {
      state.select(hit.id)
      if (hit.kind === 'shape') {
        state.openShapeEditor(hit.id)
        return
      }
      state.recallCamera(hit.id)
      if (hit.kind === 'text') state.requestTextFocus()
    }
  }

  const onContextMenu = (event: ReactMouseEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    const point = pointOf(event)
    const state = useEditorStore.getState()
    const hit = elementAt(state.project, state.viewport, point.x, point.y)
    if (hit) state.select(hit.id)
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 360)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 340)),
      elementId: hit?.id ?? null
    })
  }

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return (
    <div className="canvas-wrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="canvas"
        style={{ width: size.width || '100%', height: size.height || '100%', cursor: pendingShape || pendingMask ? 'crosshair' : cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      {shapeDraftRect && (
        <div
          className="shape-create-preview"
          style={{
            left: shapeDraftRect.x,
            top: shapeDraftRect.y,
            width: shapeDraftRect.width,
            height: shapeDraftRect.height
          }}
        />
      )}
      {marqueeRect && (
        <div
          className="marquee-rect"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height
          }}
        />
      )}
      {menu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 300 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.elementId ? (
            <>
          <button
            disabled={!menu.elementId}
            onClick={() => {
              const id = menu.elementId
              setMenu(null)
              if (!id) return
              const element = useEditorStore.getState().project.elements.find((item) => item.id === id)
              if (element) useEditorStore.getState().updateElement(id, { flipX: !element.flipX })
            }}
          >
            <Icon name="mirror" />水平翻转
          </button>
          <button
            disabled={!menu.elementId}
            onClick={() => {
              if (menu.elementId) onPreviewFrom(menu.elementId)
              setMenu(null)
            }}
          >
            <Icon name="eye" />从该元素预览
          </button>
          {menuElement?.kind === 'image' &&
            (assets[menuElement.assetId]?.animation?.frames.length ?? 0) > 1 && (
              <button
                onClick={() => {
                  const id = menu.elementId
                  setMenu(null)
                  if (id) useEditorStore.getState().playAnimation(id)
                }}
              >
                <Icon name="video" />播放
              </button>
            )}
          {animationPreview?.elementId === menu.elementId && (
            <button
              onClick={() => {
                useEditorStore.getState().stopAnimation()
                setMenu(null)
              }}
            >
              <Icon name="pause" />停止播放
            </button>
          )}
          <button
            disabled={!menu.elementId}
            onClick={() => {
              const id = menu.elementId
              setMenu(null)
              if (!id) return
              void (async () => {
                const paths = await window.newscribe.openDialog({
                  title: '替换元素',
                  filters: [{ name: '图片与 SVG', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'] }]
                })
                if (!paths[0]) return
                try {
                  const runtime = await assetFromPath(paths[0])
                  useEditorStore.getState().replaceElementAsset(id, runtime)
                } catch {
                  // 导入失败时保持原元素
                }
              })()
            }}
          >
            <Icon name="image" />替换元素…
          </button>
          {menuElement && (menuElement.kind === 'image' || menuElement.kind === 'svg') && (
            <button
              onClick={() => {
                const id = menu.elementId
                setMenu(null)
                if (id) void exportElementImage(id)
              }}
            >
              <Icon name="export" />导出图像…
            </button>
          )}
          {menuElement?.kind === 'shape' && (
            <>
              <button
                onClick={() => {
                  const id = menu.elementId
                  setMenu(null)
                  if (id) useEditorStore.getState().openShapeEditor(id)
                }}
              >
                <Icon name="pencil" />编辑图形…
              </button>
              <button
                onClick={() => {
                  const id = menu.elementId
                  setMenu(null)
                  if (id) void exportShapeSvg(id)
                }}
              >
                <Icon name="export" />导出图形 SVG…
              </button>
            </>
          )}
          {menuElement?.kind === 'molecule' && (
            <button
              onClick={() => {
                const id = menu.elementId
                setMenu(null)
                if (id) void exportMoleculeSvg(id)
              }}
            >
              <Icon name="export" />导出分子 SVG
            </button>
          )}
          {menuElement?.kind === 'math' && (
            <button
              onClick={() => {
                const id = menu.elementId
                setMenu(null)
                if (id) void exportMathSvg(id)
              }}
            >
              <Icon name="export" />导出公式 SVG
            </button>
          )}
          {menuElement?.kind === 'qr' && (            <button
              onClick={() => {
                const id = menu.elementId
                setMenu(null)
                if (id) void exportQrImage(id)
              }}
            >
              <Icon name="export" />导出二维码
            </button>
          )}
          {menuElement?.kind === 'table' && (
            <button
              onClick={() => {
                const id = menu.elementId
                setMenu(null)
                if (id) void exportTableCsv(id)
              }}
            >
              <Icon name="export" />导出表格
            </button>
          )}
          <div className="context-submenu">
            <button disabled={!menu.elementId}>
              <span className="context-icon-spacer" /><span>挪动到</span><span className="context-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                disabled={!menu.elementId}
                onClick={() => {
                  if (menu.elementId) useEditorStore.getState().moveElementBy(menu.elementId, -1)
                  setMenu(null)
                }}
              >
                <Icon name="move2previdous" />上一个
              </button>
              <button
                disabled={!menu.elementId}
                onClick={() => {
                  if (menu.elementId) useEditorStore.getState().moveElementBy(menu.elementId, 1)
                  setMenu(null)
                }}
              >
                <Icon name="move2next" />下一个
              </button>
              <button
                disabled={!menu.elementId}
                onClick={() => {
                  if (menu.elementId) useEditorStore.getState().moveElementTo(menu.elementId, 'start')
                  setMenu(null)
                }}
              >
                <Icon name="move2start" />开头
              </button>
              <button
                disabled={!menu.elementId}
                onClick={() => {
                  if (menu.elementId) useEditorStore.getState().moveElementTo(menu.elementId, 'end')
                  setMenu(null)
                }}
              >
                <Icon name="move2end" />结尾
              </button>
            </div>
          </div>
          <div className="context-sep" />
          <button
            disabled={!menu.elementId}
            onClick={() => {
              useEditorStore.getState().copySelected()
              setMenu(null)
            }}
          >
            <Icon name="copy" />复制
          </button>
          <button
            onClick={() => {
              void pasteExternal()
              setMenu(null)
            }}
          >
            <Icon name="add-box" />粘贴
          </button>
          <button
            disabled={!menu.elementId}
            onClick={() => {
              const id = menu.elementId
              setMenu(null)
              if (id) useEditorStore.getState().duplicateElement(id)
            }}
          >
            <Icon name="duplicate" />复制一份
          </button>
          <div className="context-sep" />
          <button
            onClick={() => {
              useEditorStore.getState().selectAll()
              setMenu(null)
            }}
          >
            <Icon name="circle-check" />全选
          </button>
          <button
            disabled={!menu.elementId}
            onClick={() => {
              if (menu.elementId) useEditorStore.getState().deleteSelected()
              setMenu(null)
            }}
          >
            <Icon name="trash" />删除
          </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  onPreviewStart()
                  setMenu(null)
                }}
              >
                <Icon name="preview-start" />从头预览
              </button>
              <button
                onClick={() => {
                  void pasteExternal()
                  setMenu(null)
                }}
              >
                <Icon name="add-box" />粘贴
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

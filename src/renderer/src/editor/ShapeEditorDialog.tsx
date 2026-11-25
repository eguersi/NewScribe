import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ShapeSpec } from '@shared/project'
import { Icon } from './Icon'
import { useEditorStore } from './store'
import { useLanguage } from './i18n'

const WIDTH = 640
const HEIGHT = 440
const PAD = 24
const PALETTE = ['#2b2f3a', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#8b5a2b', '#9ca3af']

function pointToSegmentDistance(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  if (length < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t))
}

export function ShapeEditorDialog({ elementId, onClose }: { elementId: string; onClose: () => void }) {
  const language = useLanguage()
  const text = (zh: string, english: string): string => (language === 'en' ? english : zh)
  const element = useEditorStore((state) => state.project.elements.find((item) => item.id === elementId))
  const updateElement = useEditorStore((state) => state.updateElement)
  const [shape, setShape] = useState<ShapeSpec | null>(() => element?.shape ? structuredClone(element.shape) : null)
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [tool, setTool] = useState<'select' | 'pencil' | 'pen'>('select')
  const [undoStack, setUndoStack] = useState<ShapeSpec[]>([])
  const [redoStack, setRedoStack] = useState<ShapeSpec[]>([])
  const [drawing, setDrawing] = useState(false)
  const [warning, setWarning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<number | null>(null)
  const handleRef = useRef<{ index: number; type: 'in' | 'out' } | null>(null)
  const penRef = useRef<{ index: number; start: { x: number; y: number } } | null>(null)

  const fit = (() => {
    const width = Math.max(1, element?.width ?? 400)
    const height = Math.max(1, element?.height ?? 300)
    const scaleX = (WIDTH - PAD * 2) / width
    const scaleY = (HEIGHT - PAD * 2) / height
    return {
      scaleX,
      scaleY,
      ox: (WIDTH - width * scaleX) / 2,
      oy: (HEIGHT - height * scaleY) / 2,
      width,
      height
    }
  })()

  const toScreen = (x: number, y: number): { x: number; y: number } => ({
    x: fit.ox + x * fit.width * fit.scaleX,
    y: fit.oy + y * fit.height * fit.scaleY
  })
  const fromScreen = (x: number, y: number): { x: number; y: number } => ({
    x: Math.max(0, Math.min(1, (x - fit.ox) / Math.max(1, fit.width * fit.scaleX))),
    y: Math.max(0, Math.min(1, (y - fit.oy) / Math.max(1, fit.height * fit.scaleY)))
  })

  const commit = (next: ShapeSpec): void => {
    setShape((current) => {
      if (current) setUndoStack((stack) => [...stack.slice(-40), structuredClone(current)])
      setRedoStack([])
      return next
    })
  }

  useEffect(() => {
    if (element?.shape) setShape(structuredClone(element.shape))
  }, [element?.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !shape) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    const grid = 20
    ctx.strokeStyle = 'rgba(120,130,150,0.2)'
    ctx.lineWidth = 1
    for (let x = 0; x <= WIDTH; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke()
    }
    for (let y = 0; y <= HEIGHT; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke()
    }
    const screen = shape.points.map((point) => toScreen(point.x, point.y))
    if (selectedEdge !== null && screen.length > 1) {
      const edgeCount = shape.closed ? screen.length : screen.length - 1
      const index = Math.min(selectedEdge, Math.max(0, edgeCount - 1))
      const start = screen[index]
      const end = screen[(index + 1) % screen.length]
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = 'rgba(245,158,11,0.9)'
      ctx.lineWidth = 5
      ctx.stroke()
    }
    const buildScreenPath = (): void => {
      if (screen.length === 0) return
      ctx.beginPath()
      ctx.moveTo(screen[0].x, screen[0].y)
      const count = shape.closed ? shape.points.length : shape.points.length - 1
      for (let index = 0; index < count; index += 1) {
        const a = shape.points[index]
        const b = shape.points[(index + 1) % shape.points.length]
        const end = screen[(index + 1) % screen.length]
        if (a.out || b.in) {
          const c1 = a.out ? toScreen(a.out.x, a.out.y) : screen[index]
          const c2 = b.in ? toScreen(b.in.x, b.in.y) : end
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y)
        } else {
          ctx.lineTo(end.x, end.y)
        }
      }
      if (shape.closed) ctx.closePath()
    }
    if (shape.closed && shape.fillEnabled && screen.length > 2) {
      buildScreenPath()
      ctx.fillStyle = shape.fill
      ctx.fill()
    }
    if (shape.strokeEnabled && shape.strokeWidth > 0) {
      buildScreenPath()
      ctx.strokeStyle = shape.stroke
      ctx.lineWidth = Math.max(1, shape.strokeWidth)
      if (shape.strokeStyle === 'dashed') ctx.setLineDash([8, 5])
      else if (shape.strokeStyle === 'dotted') ctx.setLineDash([2, 5])
      else ctx.setLineDash([])
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (selected !== null && shape.points[selected]) {
      const point = shape.points[selected]
      const node = screen[selected]
      for (const handle of [point.in, point.out]) {
        if (!handle) continue
        const screenHandle = toScreen(handle.x, handle.y)
        ctx.beginPath()
        ctx.moveTo(node.x, node.y)
        ctx.lineTo(screenHandle.x, screenHandle.y)
        ctx.strokeStyle = 'rgba(245,158,11,0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(screenHandle.x, screenHandle.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.fill()
      }
    }
    screen.forEach((point, index) => {
      ctx.beginPath()
      ctx.arc(point.x, point.y, index === selected ? 7 : 5, 0, Math.PI * 2)
      ctx.fillStyle = index === selected ? '#f59e0b' : '#ffffff'
      ctx.strokeStyle = '#2b2f3a'
      ctx.lineWidth = 2
      ctx.fill()
      ctx.stroke()
    })
  }, [shape, selected, selectedEdge, fit.ox, fit.oy, fit.scaleX, fit.scaleY])

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return fromScreen(
      (event.clientX - rect.left) * (WIDTH / rect.width),
      (event.clientY - rect.top) * (HEIGHT / rect.height)
    )
  }

  const edgeSamples = (index: number): Array<{ x: number; y: number }> => {
    if (!shape || shape.points.length < 2) return []
    const a = shape.points[index]
    const b = shape.points[(index + 1) % shape.points.length]
    if (!a || !b) return []
    const start = toScreen(a.x, a.y)
    const end = toScreen(b.x, b.y)
    if (!a.out && !b.in) return [start, end]
    const c1 = a.out ? toScreen(a.out.x, a.out.y) : start
    const c2 = b.in ? toScreen(b.in.x, b.in.y) : end
    const points: Array<{ x: number; y: number }> = []
    for (let step = 0; step <= 24; step += 1) {
      const t = step / 24
      const mt = 1 - t
      points.push({
        x: mt * mt * mt * start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x,
        y: mt * mt * mt * start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y
      })
    }
    return points
  }

  const findEdge = (point: { x: number; y: number }): number | null => {
    if (!shape || shape.points.length < 2) return null
    const count = shape.closed ? shape.points.length : shape.points.length - 1
    let nearest: number | null = null
    let best = 12
    for (let index = 0; index < count; index += 1) {
      const points = edgeSamples(index)
      for (let step = 1; step < points.length; step += 1) {
        const distance = pointToSegmentDistance(point, points[step - 1], points[step])
        if (distance < best) {
          best = distance
          nearest = index
        }
      }
    }
    return nearest
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!shape) return
    const point = pointFromEvent(event)
    if (tool === 'pencil') {
      commit({ ...shape, points: [point], closed: false })
      setDrawing(true)
      return
    }
    if (tool === 'pen') {
      if (shape.points.length > 2) {
        const first = shape.points[0]
        const firstScreen = toScreen(first.x, first.y)
        if (Math.hypot(firstScreen.x - toScreen(point.x, point.y).x, firstScreen.y - toScreen(point.x, point.y).y) < 14) {
          commit({ ...shape, closed: true })
          setSelected(0)
          setSelectedEdge(null)
          return
        }
      }
      let nearestNode = -1
      let nearestDistance = 14
      shape.points.forEach((candidate, index) => {
        const screenCandidate = toScreen(candidate.x, candidate.y)
        const distance = Math.hypot(
          screenCandidate.x - toScreen(point.x, point.y).x,
          screenCandidate.y - toScreen(point.x, point.y).y
        )
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestNode = index
        }
      })
      if (nearestNode >= 0) {
        setSelected(nearestNode)
        setSelectedEdge(null)
        setUndoStack((stack) => [...stack.slice(-40), structuredClone(shape)])
        setRedoStack([])
        dragRef.current = nearestNode
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
      const edge = findEdge(toScreen(point.x, point.y))
      const index = edge !== null ? edge + 1 : shape.points.length
      commit({
        ...shape,
        points: [...shape.points.slice(0, index), point, ...shape.points.slice(index)]
      })
      setSelected(index)
      setSelectedEdge(null)
      penRef.current = { index, start: point }
      setDrawing(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const screenPoint = toScreen(point.x, point.y)
    let nearest = -1
    let best = 14
    shape.points.forEach((candidate, index) => {
      const screenCandidate = toScreen(candidate.x, candidate.y)
      const distance = Math.hypot(screenCandidate.x - screenPoint.x, screenCandidate.y - screenPoint.y)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    if (nearest >= 0) {
      setSelected(nearest)
      setSelectedEdge(null)
      setUndoStack((stack) => [...stack.slice(-40), structuredClone(shape)])
      setRedoStack([])
      dragRef.current = nearest
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (selected !== null && shape.points[selected]) {
      const pointAtNode = shape.points[selected]
      for (const type of ['in', 'out'] as const) {
        const handle = pointAtNode[type]
        if (!handle) continue
        const screenHandle = toScreen(handle.x, handle.y)
        if (Math.hypot(screenHandle.x - screenPoint.x, screenHandle.y - screenPoint.y) < 12) {
          setSelectedEdge(null)
          setUndoStack((stack) => [...stack.slice(-40), structuredClone(shape)])
          setRedoStack([])
          handleRef.current = { index: selected, type }
          event.currentTarget.setPointerCapture(event.pointerId)
          return
        }
      }
    }
    const edge = findEdge(screenPoint)
    setSelected(null)
    setSelectedEdge(edge)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!shape) return
    const point = pointFromEvent(event)
    if (tool === 'pencil' && drawing) {
      const last = shape.points[shape.points.length - 1]
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.008) {
        setShape({ ...shape, points: [...shape.points, point] })
      }
      return
    }
    if (tool === 'pen' && penRef.current) {
      const { index, start } = penRef.current
      const dx = point.x - start.x
      const dy = point.y - start.y
      setShape({
        ...shape,
        points: shape.points.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, out: { x: point.x, y: point.y }, in: { x: start.x - dx, y: start.y - dy } }
            : item
        )
      })
      return
    }
    if (dragRef.current !== null) {
      const index = dragRef.current
      const points = shape.points.map((item, itemIndex) => (itemIndex === index ? point : item))
      setShape({ ...shape, points })
      return
    }
    if (handleRef.current) {
      const { index, type } = handleRef.current
      setShape({
        ...shape,
        points: shape.points.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [type]: point } : item
        )
      })
    }
  }

  const endPointer = (): void => {
    setDrawing(false)
    dragRef.current = null
    handleRef.current = null
    penRef.current = null
  }

  const addNode = (): void => {
    if (!shape) return
    const edge = selectedEdge ?? (selected !== null ? selected : shape.points.length - 1)
    const current = shape.points[edge] ?? { x: 0.5, y: 0.5 }
    const next = shape.points[(edge + 1) % shape.points.length] ?? current
    commit({
      ...shape,
      points: [
        ...shape.points.slice(0, edge + 1),
        { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
        ...shape.points.slice(edge + 1)
      ]
    })
    setSelected(edge + 1)
    setSelectedEdge(null)
  }

  const removeNode = (): void => {
    if (!shape || selected === null) return
    const minimum = shape.closed ? 3 : 2
    if (shape.points.length <= minimum) return
    commit({ ...shape, points: shape.points.filter((_, index) => index !== selected) })
    setSelected(null)
    setSelectedEdge(null)
  }

  const clearShape = (): void => {
    if (!shape || shape.points.length === 0) return
    commit({ ...shape, points: [] })
    setSelected(null)
    setSelectedEdge(null)
  }

  const undo = (): void => {
    if (!shape || undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack([...redoStack, structuredClone(shape)])
    setShape(previous)
  }

  const redo = (): void => {
    if (!shape || redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack([...undoStack, structuredClone(shape)])
    setShape(next)
  }

  const isEmpty = shape
    ? shape.points.length === 0 || (!shape.strokeEnabled && !shape.fillEnabled)
    : true

  const requestClose = (): void => {
    if (isEmpty) {
      setWarning(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        event.stopImmediatePropagation()
        redo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!element || !shape) return null

  return (
    <div className="shape-editor-backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-editor">
        <header>
          <h2><Icon name="shape" />{text('图形编辑器', 'Shape editor')}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={text('关闭', 'Close')}><Icon name="close" /></button>
        </header>
        <div className="shape-editor-body">
          <div className="shape-editor-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              className="shape-editor-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            />
            <div className="shape-editor-hint">
              {tool === 'pencil'
                ? text('按住鼠标绘制任意形状', 'Hold the mouse button to draw a freeform shape')
                : text('拖动节点调整位置，或切换到铅笔自由绘制', 'Drag nodes to adjust the shape, or switch to Pencil for freehand drawing')}
            </div>
          </div>
          <aside className="shape-editor-side">
            <div className="shape-tool-row">
              <button className={`mini-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}>
                <Icon name="cursor" />{text('选择', 'Select')}
              </button>
              <button className={`mini-btn ${tool === 'pencil' ? 'active' : ''}`} onClick={() => setTool('pencil')}>
                <Icon name="pencil_only" />{text('铅笔', 'Pencil')}
              </button>
              <button className={`mini-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')}>
                <Icon name="pen" />{text('钢笔', 'Pen')}
              </button>
              <button className="mini-btn" onClick={addNode} disabled={tool !== 'select'}><Icon name="plus" />{text('节点', 'Node')}</button>
              <button className="mini-btn" onClick={removeNode} disabled={selected === null}><Icon name="minus" />{text('删除', 'Delete')}</button>
              <button className="mini-btn" onClick={undo} disabled={undoStack.length === 0}><Icon name="undo" />{text('撤销', 'Undo')}</button>
              <button className="mini-btn" onClick={redo} disabled={redoStack.length === 0}><Icon name="redo" />{text('重做', 'Redo')}</button>
              <button className="mini-btn" onClick={clearShape} disabled={shape.points.length === 0}><Icon name="trash" />{text('清空', 'Clear')}</button>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={shape.closed} onChange={(event) => commit({ ...shape, closed: event.target.checked })} />
              <span>{text('闭合路径', 'Closed path')}</span>
            </label>
            <div className="shape-color-block">
              <div className="shape-color-head"><Icon name="palette" /><span>{text('描边', 'Stroke')}</span>
                <input type="checkbox" checked={shape.strokeEnabled} onChange={(event) => commit({ ...shape, strokeEnabled: event.target.checked })} />
              </div>
              <input type="color" value={shape.stroke} onChange={(event) => commit({ ...shape, stroke: event.target.value })} />
              <div className="shape-swatches">
                {PALETTE.map((color) => (
                  <button key={color} className="shape-swatch" style={{ background: color }} onClick={() => commit({ ...shape, stroke: color })} aria-label={color} />
                ))}
              </div>
              <div className="field-row">
                <label className="field"><span className="field-label">{text('粗细', 'Width')}</span><span className="field-input"><input type="number" min={0} max={40} value={shape.strokeWidth} onChange={(event) => commit({ ...shape, strokeWidth: Number(event.target.value) })} /></span></label>
                <label className="field"><span className="field-label">{text('线型', 'Line style')}</span><span className="field-input"><select value={shape.strokeStyle} onChange={(event) => commit({ ...shape, strokeStyle: event.target.value as ShapeSpec['strokeStyle'] })}><option value="solid">{text('实线', 'Solid')}</option><option value="dashed">{text('虚线', 'Dashed')}</option><option value="dotted">{text('点线', 'Dotted')}</option></select></span></label>
              </div>
            </div>
            <div className="shape-color-block">
              <div className="shape-color-head"><Icon name="paint_bucket" /><span>{text('填充', 'Fill')}</span>
                <input type="checkbox" checked={shape.fillEnabled} onChange={(event) => commit({ ...shape, fillEnabled: event.target.checked })} />
              </div>
              <input type="color" value={shape.fill} onChange={(event) => commit({ ...shape, fill: event.target.value })} />
              <div className="shape-swatches">
                {PALETTE.map((color) => (
                  <button key={color} className="shape-swatch" style={{ background: color }} onClick={() => commit({ ...shape, fill: color })} aria-label={color} />
                ))}
              </div>
            </div>
            <button
              className="primary-btn"
              onClick={() => {
                if (isEmpty) {
                  setWarning(true)
                  return
                }
                updateElement(element.id, { shape }, true)
                onClose()
              }}
            >
              <Icon name="save" />{text('保存', 'Save')}
            </button>
          </aside>
        </div>
        {warning && (
          <div className="shape-warning">
            <div className="shape-warning-box">
              <h3>{text('图形是空的', 'The shape is empty')}</h3>
              <p>
                {shape.points.length === 0
                  ? text('当前没有节点。', 'There are no nodes yet.')
                  : text('描边和填充都已关闭。', 'Stroke and fill are both turned off.')}
                {' '}
                {text('退出后画面上不会显示这个图形。', 'This shape will not appear on the canvas after you leave.')}
              </p>
              <div className="shape-warning-actions">
                <button className="mini-btn" onClick={() => setWarning(false)}>{text('继续编辑', 'Continue editing')}</button>
                <button className="mini-btn danger" onClick={onClose}>{text('仍然退出', 'Leave anyway')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

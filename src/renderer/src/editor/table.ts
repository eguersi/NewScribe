import type { SceneElement, TableSpec } from '@shared/project'
import { defaultTable } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return ['']
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const char of paragraph) {
      const next = current + char
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current)
        current = char
      } else {
        current = next
      }
    }
    lines.push(current)
  }
  return lines
}

interface BorderSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  length: number
}

function borderSegments(
  left: number,
  top: number,
  width: number,
  height: number,
  rows: number,
  columns: number,
  rowHeight: number,
  cellWidth: number
): BorderSegment[] {
  const segments: BorderSegment[] = []
  const add = (x1: number, y1: number, x2: number, y2: number): void => {
    segments.push({ x1, y1, x2, y2, length: Math.hypot(x2 - x1, y2 - y1) })
  }
  add(left, top, left + width, top)
  add(left + width, top, left + width, top + height)
  add(left + width, top + height, left, top + height)
  add(left, top + height, left, top)
  for (let row = 1; row < rows; row += 1) {
    const y = top + row * rowHeight
    add(left, y, left + width, y)
  }
  for (let col = 1; col < columns; col += 1) {
    const x = left + col * cellWidth
    add(x, top, x, top + height)
  }
  return segments
}

export function drawTableElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const table: TableSpec = element.table ?? defaultTable()
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const left = -width / 2
  const top = -height / 2
  const p = Math.max(0, Math.min(1, progress))
  const rows = Math.max(1, table.rows.length)
  const columns = Math.max(1, ...table.rows.map((row) => row.length))
  const titleHeight = table.showTitle ? Math.min(height * 0.22, table.fontSize * 1.9) : 0
  const tableHeight = height - titleHeight
  const rowHeight = tableHeight / rows
  const cellWidth = width / columns
  const border = Math.max(0, table.borderWidth)
  const family = `"${table.fontFamily}", "Microsoft YaHei", sans-serif`
  const borderPhase = p >= 1 ? 1 : Math.max(0, Math.min(1, p / 0.35))
  const contentPhase = p >= 1 ? 1 : Math.max(0, (p - 0.35) / 0.65)

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.fillStyle = table.background
  ctx.fillRect(left, top + titleHeight, width, tableHeight)
  ctx.textBaseline = 'middle'

  let handPoint: { x: number; y: number } | null = null
  if (border > 0) {
    const segments = borderSegments(
      left,
      top + titleHeight,
      width,
      tableHeight,
      rows,
      columns,
      rowHeight,
      cellWidth
    )
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
    let remaining = totalLength * borderPhase
    ctx.strokeStyle = table.borderColor
    ctx.lineWidth = border
    ctx.beginPath()
    for (const segment of segments) {
      if (remaining <= 0) break
      const part = Math.min(1, remaining / Math.max(0.001, segment.length))
      const x2 = segment.x1 + (segment.x2 - segment.x1) * part
      const y2 = segment.y1 + (segment.y2 - segment.y1) * part
      ctx.moveTo(segment.x1, segment.y1)
      ctx.lineTo(x2, y2)
      handPoint = { x: x2, y: y2 }
      remaining -= segment.length
    }
    ctx.stroke()
  }

  if (contentPhase > 0) {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * contentPhase))
    if (table.showTitle) {
      ctx.fillStyle = table.color
      ctx.font = `700 ${table.fontSize * 1.18}px ${family}`
      ctx.textAlign = 'center'
      ctx.fillText(table.title, 0, top + titleHeight / 2, width * 0.94)
    }

    const visibleRows = p >= 1 ? rows : Math.max(0, Math.ceil(rows * contentPhase))
    for (let row = 0; row < visibleRows; row += 1) {
      const isHeader = table.headerRow && row === 0
      const rowTop = top + titleHeight + row * rowHeight
      for (let col = 0; col < columns; col += 1) {
        const cellLeft = left + col * cellWidth
        if (isHeader) {
          ctx.fillStyle = table.headerBackground
          ctx.fillRect(cellLeft, rowTop, cellWidth, rowHeight)
        }
        const value = table.rows[row]?.[col] ?? ''
        ctx.save()
        ctx.beginPath()
        ctx.rect(cellLeft + border, rowTop + border, cellWidth - border * 2, rowHeight - border * 2)
        ctx.clip()
        ctx.fillStyle = isHeader ? table.headerColor : table.color
        ctx.font = `${isHeader ? '700 ' : ''}${table.fontSize}px ${family}`
        ctx.textAlign = table.align
        const maxWidth = Math.max(4, cellWidth - table.cellPadding * 2)
        const lines = wrapLines(ctx, value, maxWidth)
        const lineHeight = table.fontSize * 1.28
        const totalHeight = lines.length * lineHeight
        const startY = rowTop + rowHeight / 2 - totalHeight / 2 + lineHeight / 2
        const textX =
          table.align === 'left'
            ? cellLeft + table.cellPadding
            : table.align === 'right'
              ? cellLeft + cellWidth - table.cellPadding
              : cellLeft + cellWidth / 2
        lines.forEach((line, index) => {
          ctx.fillText(line, textX, startY + index * lineHeight, maxWidth)
        })
        ctx.restore()
      }
    }
  }

  if (contentPhase > 0 && border > 0) {
    // 表头底色会盖住边框，内容画完后再补一次网格线。
    const segments = borderSegments(
      left,
      top + titleHeight,
      width,
      tableHeight,
      rows,
      columns,
      rowHeight,
      cellWidth
    )
    ctx.strokeStyle = table.borderColor
    ctx.lineWidth = border
    ctx.beginPath()
    for (const segment of segments) {
      ctx.moveTo(segment.x1, segment.y1)
      ctx.lineTo(segment.x2, segment.y2)
    }
    ctx.stroke()
  }

  if (p < 1 && borderPhase < 1 && handPoint) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const scale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.save()
      ctx.translate(handPoint.x, handPoint.y)
      ctx.rotate(-((element.rotation * Math.PI) / 180))
      ctx.drawImage(
        hand.image,
        -hand.pivotX * scale,
        -hand.pivotY * scale,
        hand.image.naturalWidth * scale,
        hand.image.naturalHeight * scale
      )
      ctx.restore()
    }
  }

  ctx.restore()
}

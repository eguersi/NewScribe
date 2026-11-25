import type { MindMapSpec, SceneElement } from '@shared/project'
import { defaultMindMap } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

interface MindNode {
  text: string
  children: MindNode[]
}

interface LayoutNode {
  node: MindNode
  depth: number
  x: number
  y: number
  width: number
  height: number
  lines: string[]
  subtreeHeight: number
  children: LayoutNode[]
  index: number
}

function parseOutline(outline: string): MindNode {
  const lines = outline
    .split(/\r?\n/)
    .map((line) => ({ text: line.trim(), indent: (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length }))
    .filter((line) => line.text.length > 0)
  if (lines.length === 0) return { text: '中心主题', children: [] }
  const root: MindNode = { text: lines[0].text, children: [] }
  if (lines.length === 1) return root
  const stack: Array<{ level: number; node: MindNode }> = [{ level: 0, node: root }]
  for (const line of lines.slice(1)) {
    const level = Math.max(0, Math.floor(line.indent / 2))
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack[stack.length - 1].node
    const node: MindNode = { text: line.text, children: [] }
    parent.children.push(node)
    stack.push({ level, node })
  }
  return root
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function layoutMindMap(
  ctx: CanvasRenderingContext2D,
  spec: MindMapSpec
): { root: LayoutNode; width: number; height: number; nodes: LayoutNode[] } {
  const maxNodeWidth = 230
  const fontFamily = '"Microsoft YaHei", sans-serif'
  const margin = 24
  let index = 0

  const measure = (node: MindNode, depth: number): LayoutNode => {
    const bold = depth === 0
    ctx.font = `${bold ? '700 ' : ''}${spec.fontSize}px ${fontFamily}`
    const lines = wrapText(ctx, node.text, maxNodeWidth - spec.nodePadding * 2)
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0)
    const width = Math.max(spec.fontSize * 2, Math.min(maxNodeWidth, textWidth + spec.nodePadding * 2))
    const height = Math.max(
      spec.fontSize * 1.8,
      lines.length * spec.fontSize * 1.25 + spec.nodePadding * 2
    )
    const children = node.children.map((child) => measure(child, depth + 1))
    const childHeight =
      children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
      Math.max(0, children.length - 1) * spec.gapY
    const layout: LayoutNode = {
      node,
      depth,
      x: 0,
      y: 0,
      width,
      height,
      lines,
      subtreeHeight: Math.max(height, childHeight),
      children,
      index: index++
    }
    return layout
  }

  const root = measure(parseOutline(spec.outline), 0)
  const maxWidthByDepth: number[] = []
  const collectWidths = (node: LayoutNode): void => {
    maxWidthByDepth[node.depth] = Math.max(maxWidthByDepth[node.depth] ?? 0, node.width)
    node.children.forEach(collectWidths)
  }
  collectWidths(root)
  const xForDepth = (depth: number): number => {
    let x = margin
    for (let d = 0; d < depth; d += 1) x += (maxWidthByDepth[d] ?? 0) + spec.gapX
    return x
  }

  const place = (node: LayoutNode, top: number): void => {
    node.x = xForDepth(node.depth)
    const childHeight =
      node.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
      Math.max(0, node.children.length - 1) * spec.gapY
    node.y = top + (node.subtreeHeight - node.height) / 2
    if (node.children.length === 0) return
    let childTop = top + (node.subtreeHeight - childHeight) / 2
    for (const child of node.children) {
      place(child, childTop)
      childTop += child.subtreeHeight + spec.gapY
    }
  }
  place(root, margin)

  let width = margin
  let height = margin
  const nodes: LayoutNode[] = []
  const collect = (node: LayoutNode): void => {
    nodes.push(node)
    width = Math.max(width, node.x + node.width + margin)
    height = Math.max(height, node.y + node.height + margin)
    node.children.forEach(collect)
  }
  collect(root)
  return { root, width, height, nodes }
}

export function drawMindMapElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const spec = element.mindmap ?? defaultMindMap()
  const canvas = ctx.canvas
  const layout = layoutMindMap(ctx, spec)
  const p = Math.max(0, Math.min(1, progress))
  const scale = Math.min(
    1,
    Math.max(0.05, (element.width - 16) / Math.max(1, layout.width)),
    Math.max(0.05, (element.height - 16) / Math.max(1, layout.height))
  )

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate(0, 0)
  ctx.scale(scale, scale)
  ctx.translate(-layout.width / 2, -layout.height / 2)

  const visible = p >= 1 ? layout.nodes.length : Math.ceil(layout.nodes.length * p)
  const visibleNodes = new Set(layout.nodes.slice(0, Math.max(0, visible)).map((node) => node.index))

  ctx.lineWidth = 2.2
  ctx.strokeStyle = spec.connector
  for (const parent of layout.nodes) {
    if (!visibleNodes.has(parent.index)) continue
    for (const child of parent.children) {
      if (!visibleNodes.has(child.index)) continue
      const sx = parent.x + parent.width
      const sy = parent.y + parent.height / 2
      const ex = child.x
      const ey = child.y + child.height / 2
      const center = (sx + ex) / 2
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.bezierCurveTo(center, sy, center, ey, ex, ey)
      ctx.stroke()
    }
  }

  for (const node of layout.nodes) {
    if (!visibleNodes.has(node.index)) continue
    const isRoot = node.depth === 0
    ctx.fillStyle = isRoot ? spec.nodeBorder : spec.nodeFill
    ctx.strokeStyle = spec.nodeBorder
    ctx.lineWidth = isRoot ? 0 : 1.4
    roundedRect(ctx, node.x, node.y, node.width, node.height, 9)
    ctx.fill()
    if (!isRoot) ctx.stroke()

    ctx.fillStyle = isRoot ? '#fffaf2' : spec.nodeText
    ctx.font = `${isRoot ? '700 ' : ''}${spec.fontSize}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineHeight = spec.fontSize * 1.25
    const startY = node.y + node.height / 2 - ((node.lines.length - 1) * lineHeight) / 2
    node.lines.forEach((line, lineIndex) => {
      ctx.fillText(line, node.x + node.width / 2, startY + lineIndex * lineHeight, node.width - 8)
    })
  }

  if (p > 0 && p < 1) {
    const last = layout.nodes[Math.min(layout.nodes.length - 1, Math.max(0, visible - 1))]
    const hand = last ? getHandVisual(element.hand, element.handHeight) : null
    if (last && hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const handScale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.save()
      ctx.translate(last.x + last.width / 2, last.y + last.height)
      ctx.rotate(-((element.rotation * Math.PI) / 180))
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

  void canvas
  ctx.restore()
}

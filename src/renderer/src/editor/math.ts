import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'
import type { SceneElement } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

interface MathPath {
  d: string
  matrix: [number, number, number, number, number, number]
  center: { x: number; y: number }
}

interface MathData {
  width: number
  height: number
  minX: number
  minY: number
  paths: MathPath[]
  svgMarkup: string
}

let initialized = false
let converter: ReturnType<typeof mathjax.document> | null = null
const cache = new Map<string, MathData>()

function ensureConverter(): void {
  if (initialized) return
  initialized = true
  const adaptor = browserAdaptor()
  RegisterHTMLHandler(adaptor)
  const tex = new TeX({ packages: AllPackages })
  const svg = new SVG({ fontCache: 'none' })
  converter = mathjax.document('', { InputJax: tex, OutputJax: svg })
}

function getMathData(latex: string, displayMode: boolean): MathData | null {
  ensureConverter()
  if (!converter) return null
  const key = `${displayMode ? 'display' : 'inline'}\u0000${latex}`
  const cached = cache.get(key)
  if (cached) return cached
  try {
    const node = converter.convert(latex, { display: displayMode }) as HTMLElement
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
    const adaptor = browserAdaptor()
    host.innerHTML = adaptor.outerHTML(node)
    document.body.appendChild(host)
    const svg = host.querySelector('svg')
    if (!svg) {
      host.remove()
      return null
    }
    const viewBox = svg.viewBox?.baseVal
    const width = viewBox && viewBox.width > 0 ? viewBox.width : 100
    const height = viewBox && viewBox.height > 0 ? viewBox.height : 100
    const minX = viewBox?.x ?? 0
    const minY = viewBox?.y ?? 0
    const root = svg.getScreenCTM()
    const paths: MathPath[] = []
    for (const raw of Array.from(svg.querySelectorAll('path,rect'))) {
      const element = raw as SVGGraphicsElement
      if (element.closest('defs')) continue
      const ctm = element.getScreenCTM()
      if (!ctm) continue
      const relative = root ? root.inverse().multiply(ctm) : ctm
      let d = element.getAttribute('d')
      if (element.tagName.toLowerCase() === 'rect') {
        const x = Number(element.getAttribute('x') ?? 0)
        const y = Number(element.getAttribute('y') ?? 0)
        const w = Number(element.getAttribute('width') ?? 0)
        const h = Number(element.getAttribute('height') ?? 0)
        d = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
      }
      if (!d) continue
      const box = element.getBBox()
      const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(relative)
      paths.push({
        d,
        matrix: [relative.a, relative.b, relative.c, relative.d, relative.e, relative.f],
        center: { x: center.x, y: center.y }
      })
    }
    host.remove()
    const data = { width, height, minX, minY, paths, svgMarkup: svg.outerHTML }
    cache.set(key, data)
    return data
  } catch {
    return null
  }
}

export function getMathSvg(latex: string, displayMode: boolean, color: string): string | null {
  const data = getMathData(latex, displayMode)
  if (!data) return null
  try {
    const doc = new DOMParser().parseFromString(data.svgMarkup, 'image/svg+xml')
    const svg = doc.documentElement
    svg.setAttribute('color', color)
    svg.setAttribute('fill', color)
    return `${new XMLSerializer().serializeToString(svg)}\n<!-- Created with NewScribe -->`
  } catch {
    return null
  }
}

export function drawMathElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const spec = element.math
  if (!spec || !spec.latex.trim()) return
  const data = getMathData(spec.latex, spec.displayMode)
  if (!data || data.paths.length === 0) return
  const p = Math.max(0, Math.min(1, progress))
  const fit = Math.min(element.width / Math.max(1, data.width), element.height / Math.max(1, data.height))
  const visible = p >= 1 ? data.paths.length : Math.ceil(data.paths.length * p)

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate((-data.width * fit) / 2, (-data.height * fit) / 2)
  ctx.scale(fit, fit)
  ctx.translate(-data.minX, -data.minY)
  ctx.fillStyle = spec.color
  const last = data.paths[Math.min(data.paths.length - 1, Math.max(0, visible - 1))]
  for (let index = 0; index < visible; index += 1) {
    const path = data.paths[index]
    ctx.save()
    ctx.transform(path.matrix[0], path.matrix[1], path.matrix[2], path.matrix[3], path.matrix[4], path.matrix[5])
    ctx.fill(new Path2D(path.d))
    ctx.restore()
  }
  ctx.restore()

  if (p > 0 && p < 1 && last) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const handScale = drawHeight / Math.max(1, hand.image.naturalHeight)
      const x = (last.center.x - data.minX) * fit - (data.width * fit) / 2
      const y = (last.center.y - data.minY) * fit - (data.height * fit) / 2
      ctx.save()
      ctx.translate(x, y)
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

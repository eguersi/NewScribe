import initRDKit from '@rdkit/rdkit'
import rdkitWasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url'
import type { SceneElement } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

interface MoleculePath {
  d: string
  matrix: [number, number, number, number, number, number]
  center: { x: number; y: number }
  fill: boolean
  stroke: boolean
  strokeWidth: number
}

interface MoleculeData {
  width: number
  height: number
  minX: number
  minY: number
  paths: MoleculePath[]
  svg: string
  image: HTMLImageElement | null
}

type RDKitModule = Awaited<ReturnType<typeof initRDKit>>
let rdkit: RDKitModule | null = null
let initPromise: Promise<void> | null = null
const cache = new Map<string, MoleculeData>()

function ensureRDKit(): void {
  if (rdkit || initPromise) return
  initPromise = (async () => {
    let wasmBinary: ArrayBuffer | undefined
    try {
      if (rdkitWasmUrl.startsWith('file:')) {
        const path = decodeURIComponent(new URL(rdkitWasmUrl).pathname).replace(/^\/([A-Za-z]:)/, '$1')
        wasmBinary = await window.newscribe.fs.readBinary(path)
      } else {
        wasmBinary = await fetch(rdkitWasmUrl).then((response) => response.arrayBuffer())
      }
    } catch {
      wasmBinary = undefined
    }
    let blobUrl: string | null = null
    if (wasmBinary) {
      blobUrl = URL.createObjectURL(new Blob([wasmBinary], { type: 'application/wasm' }))
    }
    try {
      rdkit = await initRDKit({ locateFile: () => blobUrl ?? rdkitWasmUrl })
      window.dispatchEvent(new Event('newscribe:molecule-ready'))
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  })()
}

function parseSvg(markup: string, width: number, height: number): MoleculeData | null {
  try {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
    host.innerHTML = markup
    document.body.appendChild(host)
    const svg = host.querySelector('svg')
    if (!svg) {
      host.remove()
      return null
    }
    const viewBox = svg.viewBox?.baseVal
    const vbWidth = viewBox && viewBox.width > 0 ? viewBox.width : width
    const vbHeight = viewBox && viewBox.height > 0 ? viewBox.height : height
    const minX = viewBox?.x ?? 0
    const minY = viewBox?.y ?? 0
    const root = svg.getScreenCTM()
    const paths: MoleculePath[] = []
    for (const raw of Array.from(svg.querySelectorAll('path,rect,line'))) {
      const element = raw as SVGGraphicsElement
      if (element.closest('defs')) continue
      const ctm = element.getScreenCTM()
      if (!ctm) continue
      const relative = root ? root.inverse().multiply(ctm) : ctm
      let d = element.getAttribute('d')
      const tag = element.tagName.toLowerCase()
      if (tag === 'rect') {
        const x = Number(element.getAttribute('x') ?? 0)
        const y = Number(element.getAttribute('y') ?? 0)
        const w = Number(element.getAttribute('width') ?? 0)
        const h = Number(element.getAttribute('height') ?? 0)
        if (w >= vbWidth * 0.9 && h >= vbHeight * 0.9) continue
        d = `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
      } else if (tag === 'line') {
        d = `M ${element.getAttribute('x1') ?? 0} ${element.getAttribute('y1') ?? 0} L ${element.getAttribute('x2') ?? 0} ${element.getAttribute('y2') ?? 0}`
      }
      if (!d) continue
      const box = element.getBBox()
      const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(relative)
      const style = getComputedStyle(element)
      paths.push({
        d,
        matrix: [relative.a, relative.b, relative.c, relative.d, relative.e, relative.f],
        center: { x: center.x, y: center.y },
        fill: style.fill !== 'none',
        stroke: style.stroke !== 'none',
        strokeWidth: Math.max(0.5, Number.parseFloat(style.strokeWidth || '1') || 1)
      })
    }
    host.remove()

    const imageSvg = svg.cloneNode(true) as SVGSVGElement
    for (const raw of Array.from(imageSvg.querySelectorAll('rect'))) {
      const rect = raw as SVGGraphicsElement
      if (
        Number(rect.getAttribute('width') ?? 0) >= vbWidth * 0.9 &&
        Number(rect.getAttribute('height') ?? 0) >= vbHeight * 0.9
      ) {
        rect.remove()
      }
    }
    const image = new Image()
    image.onload = () => window.dispatchEvent(new Event('newscribe:molecule-ready'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageSvg.outerHTML)}`
    return { width: vbWidth, height: vbHeight, minX, minY, paths, svg: markup, image }
  } catch {
    return null
  }
}

export function getMoleculeData(smiles: string, strokeWidth = 3): MoleculeData | null {
  ensureRDKit()
  if (!rdkit) return null
  const key = `${smiles}\u0000${strokeWidth}`
  const cached = cache.get(key)
  if (cached) return cached
  try {
    const mol = rdkit.get_mol(smiles)
    if (!mol || !mol.is_valid()) {
      mol?.delete()
      return null
    }
    mol.set_new_coords()
    let svg = ''
    try {
      svg = mol.get_svg_with_highlights(JSON.stringify({ width: 1000, height: 720, bondLineWidth: strokeWidth }))
    } catch {
      svg = mol.get_svg(1000, 720)
    }
    mol.delete()
    const data = parseSvg(svg, 1000, 720)
    if (data) cache.set(key, data)
    return data
  } catch {
    return null
  }
}

export function drawMoleculeElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const spec = element.molecule
  if (!spec || !spec.smiles.trim()) return
  const data = getMoleculeData(spec.smiles, spec.strokeWidth ?? 3)
  if (!data || data.paths.length === 0) return
  const p = Math.max(0, Math.min(1, progress))
  const fit = Math.min(element.width / Math.max(1, data.width), element.height / Math.max(1, data.height))
  const visible = p >= 1 ? data.paths.length : Math.ceil(data.paths.length * p)

  if (p >= 1 && data.image?.complete && data.image.naturalWidth > 0) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.drawImage(
      data.image,
      (-data.width * fit) / 2,
      (-data.height * fit) / 2,
      data.width * fit,
      data.height * fit
    )
    ctx.restore()
    return
  }

  if (data.paths.length === 0) {
    if (data.image?.complete) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.drawImage(
        data.image,
        (-data.width * fit) / 2,
        (-data.height * fit) / 2,
        data.width * fit,
        data.height * fit
      )
      ctx.restore()
    }
    return
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate((-data.width * fit) / 2, (-data.height * fit) / 2)
  ctx.scale(fit, fit)
  ctx.translate(-data.minX, -data.minY)
  ctx.fillStyle = spec.color
  ctx.strokeStyle = spec.color
  const last = data.paths[Math.min(data.paths.length - 1, Math.max(0, visible - 1))]
  for (let index = 0; index < visible; index += 1) {
    const path = data.paths[index]
    ctx.save()
    ctx.transform(path.matrix[0], path.matrix[1], path.matrix[2], path.matrix[3], path.matrix[4], path.matrix[5])
    const shape = new Path2D(path.d)
    if (path.fill) ctx.fill(shape)
    if (path.stroke) {
      ctx.lineWidth = path.strokeWidth
      ctx.stroke(shape)
    }
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

export function getMoleculeSvg(smiles: string, strokeWidth = 3): string | null {
  const data = getMoleculeData(smiles, strokeWidth)
  return data ? `${data.svg}\n<!-- Created with NewScribe -->` : null
}


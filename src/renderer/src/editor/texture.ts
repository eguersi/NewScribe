import type { TextureKind } from '@shared/project'

const TILE_WIDTH = 1024
const TILE_HEIGHT = 576
const cache = new Map<TextureKind, HTMLCanvasElement>()

function seeded(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0xffffffff
  }
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_WIDTH
  canvas.height = TILE_HEIGHT
  return { canvas, ctx: canvas.getContext('2d') }
}

function drawPaper(ctx: CanvasRenderingContext2D, random: () => number): void {
  for (let index = 0; index < 3000; index += 1) {
    const x = random() * TILE_WIDTH
    const y = random() * TILE_HEIGHT
    const length = 2 + random() * 24
    const angle = random() * Math.PI
    ctx.strokeStyle = `rgba(105, 92, 72, ${0.045 + random() * 0.1})`
    ctx.lineWidth = 0.6 + random() * 1.1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    ctx.stroke()
  }
  for (let index = 0; index < 1400; index += 1) {
    const x = random() * TILE_WIDTH
    const y = random() * TILE_HEIGHT
    ctx.fillStyle = `rgba(95, 84, 66, ${0.05 + random() * 0.09})`
    ctx.fillRect(x, y, 0.7 + random() * 1.5, 0.5 + random() * 1)
  }
}

function drawGrain(ctx: CanvasRenderingContext2D, random: () => number): void {
  for (let index = 0; index < 9000; index += 1) {
    const x = random() * TILE_WIDTH
    const y = random() * TILE_HEIGHT
    ctx.fillStyle = `rgba(80, 72, 60, ${0.04 + random() * 0.09})`
    ctx.fillRect(x, y, 0.8, 0.8)
  }
}

function drawCanvasWeave(ctx: CanvasRenderingContext2D, random: () => number): void {
  const step = 7
  for (let x = 0; x < TILE_WIDTH; x += step) {
    ctx.strokeStyle = `rgba(105, 92, 72, ${0.035 + random() * 0.04})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + random() * 2, 0)
    ctx.lineTo(x + random() * 2, TILE_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y < TILE_HEIGHT; y += step) {
    ctx.strokeStyle = `rgba(255, 248, 230, ${0.035 + random() * 0.04})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y + random() * 2)
    ctx.lineTo(TILE_WIDTH, y + random() * 2)
    ctx.stroke()
  }
}

function drawLinen(ctx: CanvasRenderingContext2D, random: () => number): void {
  const step = 9
  for (let index = -TILE_HEIGHT; index < TILE_WIDTH; index += step) {
    ctx.strokeStyle = `rgba(102, 92, 76, ${0.035 + random() * 0.04})`
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(index, 0)
    ctx.lineTo(index + TILE_HEIGHT, TILE_HEIGHT)
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 249, 235, ${0.03 + random() * 0.035})`
    ctx.beginPath()
    ctx.moveTo(index + 3, 0)
    ctx.lineTo(index + 3 - TILE_HEIGHT, TILE_HEIGHT)
    ctx.stroke()
  }
}

function drawLeather(ctx: CanvasRenderingContext2D, random: () => number): void {
  for (let index = 0; index < 1100; index += 1) {
    const x = random() * TILE_WIDTH
    const y = random() * TILE_HEIGHT
    const radius = 2 + random() * 12
    ctx.strokeStyle = `rgba(70, 52, 35, ${0.035 + random() * 0.055})`
    ctx.lineWidth = 0.8 + random() * 1.2
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.45 + random() * 0.7), random() * Math.PI, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (let index = 0; index < 5000; index += 1) {
    ctx.fillStyle = `rgba(52, 38, 25, ${0.02 + random() * 0.05})`
    ctx.fillRect(random() * TILE_WIDTH, random() * TILE_HEIGHT, 1, 1)
  }
}

function drawEmbossed(ctx: CanvasRenderingContext2D): void {
  const image = ctx.createImageData(TILE_WIDTH, TILE_HEIGHT)
  const data = image.data
  const height = (x: number, y: number): number =>
    Math.sin(x * 0.037 + y * 0.013) * 0.28 +
    Math.cos(y * 0.041 - x * 0.009) * 0.24 +
    Math.sin((x + y) * 0.083) * 0.14 +
    Math.cos((x - y) * 0.117) * 0.1 +
    Math.sin(x * 0.21) * 0.035 +
    Math.cos(y * 0.19) * 0.035
  for (let y = 0; y < TILE_HEIGHT; y += 1) {
    for (let x = 0; x < TILE_WIDTH; x += 1) {
      const dx = height(x + 1, y) - height(x - 1, y)
      const dy = height(x, y + 1) - height(x, y - 1)
      const light = Math.max(0, Math.min(1, 0.5 + dx * 2.8 - dy * 2.2))
      const shade = Math.max(0, Math.min(1, 0.5 - dx * 2.2 + dy * 2.8))
      const index = (y * TILE_WIDTH + x) * 4
      data[index] = Math.round(92 + light * 42 + shade * 8)
      data[index + 1] = Math.round(80 + light * 38 + shade * 7)
      data[index + 2] = Math.round(64 + light * 32 + shade * 6)
      data[index + 3] = Math.round(74 + light * 42 - shade * 10)
    }
  }
  ctx.putImageData(image, 0, 0)
}

function textureCanvas(kind: TextureKind): HTMLCanvasElement {
  const cached = cache.get(kind)
  if (cached) return cached
  const { canvas, ctx } = makeCanvas()
  if (!ctx) return canvas
  const random = seeded(kind === 'paper' ? 20261102 : kind === 'grain' ? 99173 : 44117)
  if (kind === 'paper') drawPaper(ctx, random)
  else if (kind === 'grain') drawGrain(ctx, random)
  else if (kind === 'canvas') drawCanvasWeave(ctx, random)
  else if (kind === 'linen') drawLinen(ctx, random)
  else if (kind === 'leather') drawLeather(ctx, random)
  else if (kind === 'embossed') drawEmbossed(ctx)
  cache.set(kind, canvas)
  return canvas
}

export interface TextureDrawOptions {
  /** 固定在屏幕上，不随镜头移动/缩放 */
  fixed?: boolean
  /** 世界坐标 → 屏幕像素 */
  scale?: number
  /** 世界原点在屏幕上的位置 */
  offsetX?: number
  offsetY?: number
}

/**
 * 将纹理铺满整个可见区域。纹理采用世界坐标平铺，超出画布也会继续延伸；
 * fixed 为 true 时改为屏幕坐标平铺。
 */
export function drawPaperTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  kind: TextureKind,
  opacity = 0.7,
  options: TextureDrawOptions = {}
): void {
  if (kind === 'none') return
  const source = textureCanvas(kind)
  const scale = options.fixed ? 1 : Math.max(0.001, options.scale ?? 1)
  const tileWidth = TILE_WIDTH * scale
  const tileHeight = TILE_HEIGHT * scale
  const offsetX = options.fixed ? 0 : options.offsetX ?? 0
  const offsetY = options.fixed ? 0 : options.offsetY ?? 0
  const startX = offsetX - Math.ceil(offsetX / tileWidth) * tileWidth
  const startY = offsetY - Math.ceil(offsetY / tileHeight) * tileHeight

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (let x = startX; x < width; x += tileWidth) {
    for (let y = startY; y < height; y += tileHeight) {
      ctx.drawImage(source, x, y, tileWidth, tileHeight)
    }
  }
  ctx.restore()
}

import qrcode from 'qrcode-generator'
import type { SceneElement } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'

interface QrMatrix {
  count: number
  isDark: (row: number, col: number) => boolean
}

const cache = new Map<string, QrMatrix>()

function qrMatrix(spec: NonNullable<SceneElement['qr']>): QrMatrix {
  const key = `${spec.content}\u0000${spec.errorCorrection}`
  const cached = cache.get(key)
  if (cached) return cached
  const qr = qrcode(0, spec.errorCorrection)
  qr.addData(spec.content)
  qr.make()
  const matrix: QrMatrix = {
    count: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col)
  }
  cache.set(key, matrix)
  return matrix
}

export function drawQrElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const spec = element.qr
  if (!spec || !spec.content) return

  let matrix: QrMatrix
  try {
    matrix = qrMatrix(spec)
  } catch {
    // 内容超过二维码容量时保持空白，不打断整个画布渲染
    return
  }

  const size = Math.min(element.width, element.height)
  const margin = Math.max(0, Math.round(spec.margin))
  const total = matrix.count + margin * 2
  const cell = size / total
  const left = -size / 2
  const top = -size / 2
  const p = Math.max(0, Math.min(1, progress))

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  if (!spec.transparentBackground) {
    ctx.fillStyle = spec.background
    ctx.fillRect(left, top, size, size)
  }

  ctx.beginPath()
  ctx.rect(left, top, size, size * p)
  ctx.clip()
  ctx.fillStyle = spec.foreground
  for (let row = 0; row < matrix.count; row += 1) {
    for (let col = 0; col < matrix.count; col += 1) {
      if (!matrix.isDark(row, col)) continue
      const x = left + (col + margin) * cell
      const y = top + (row + margin) * cell
      ctx.fillRect(x, y, cell + 0.2, cell + 0.2)
    }
  }
  ctx.restore()

  if (p > 0 && p < 1) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const scale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.save()
      ctx.translate(0, top + size * p)
      ctx.rotate(-((element.rotation * Math.PI) / 180))
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
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
}

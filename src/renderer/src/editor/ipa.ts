import type { SceneElement } from '@shared/project'
import { getHandDrawHeight, getHandVisual } from './hands'
import { xsampaToIpa } from './xsampa'

const FONT = '"NewScribe IPA", "Noto Sans", "Segoe UI", "Arial", sans-serif'

if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts.load(`54px "NewScribe IPA"`)
}

interface IpaLine {
  text: string
  width: number
}

function layoutLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxWidth: number
): IpaLine[] {
  ctx.font = `${fontSize}px ${FONT}`
  const lines: IpaLine[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const char of paragraph) {
      const next = current + char
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push({ text: current, width: ctx.measureText(current).width })
        current = char
      } else {
        current = next
      }
    }
    lines.push({ text: current, width: ctx.measureText(current).width })
  }
  return lines
}

export function drawIpaElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha: number,
  worldScale = 1
): void {
  const spec = element.ipa
  if (!spec) return
  const text = xsampaToIpa(spec.xsampa)
  if (!text.trim()) return
  const fontSize = Math.max(8, spec.fontSize)
  const lines = layoutLines(ctx, text, fontSize, Math.max(40, element.width - 16))
  const lineHeight = fontSize * 1.3
  const totalHeight = lines.length * lineHeight
  const maxLineWidth = Math.max(1, ...lines.map((line) => line.width))
  const fit = Math.min(1, (element.width - 12) / maxLineWidth, (element.height - 12) / totalHeight)
  const p = Math.max(0, Math.min(1, progress))
  const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0)
  const visibleChars = p >= 1 ? totalChars : Math.floor(totalChars * p)

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.font = `${fontSize}px ${FONT}`
  ctx.fillStyle = spec.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.scale(fit, fit)
  let remaining = visibleChars
  let lastX = 0
  let lastY = 0
  lines.forEach((line, index) => {
    if (remaining <= 0) return
    const shown = line.text.slice(0, remaining)
    remaining -= shown.length
    const y = -((lines.length - 1) * lineHeight) / 2 + index * lineHeight
    ctx.fillText(shown, 0, y)
    const width = ctx.measureText(shown).width
    lastX = width / 2
    lastY = y
  })
  ctx.restore()

  if (p > 0 && p < 1) {
    const hand = getHandVisual(element.hand, element.handHeight)
    if (hand) {
      const drawHeight = getHandDrawHeight(element, hand, worldScale)
      const handScale = drawHeight / Math.max(1, hand.image.naturalHeight)
      ctx.save()
      ctx.translate(lastX * fit, lastY * fit)
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

import type { SceneElement, TextSpec } from '@shared/project'

export function fontString(spec: TextSpec): string {
  const italic = spec.italic ? 'italic ' : ''
  const weight = spec.bold ? '700 ' : '400 '
  return `${italic}${weight}${spec.fontSize}px "${spec.fontFamily}", "Microsoft YaHei", sans-serif`
}

export interface TextLine {
  text: string
  width: number
}

export function layoutText(
  ctx: CanvasRenderingContext2D,
  spec: TextSpec,
  maxWidth: number
): TextLine[] {
  ctx.save()
  ctx.font = fontString(spec)
  const lines: TextLine[] = []

  for (const paragraph of spec.content.split('\n')) {
    if (paragraph.length === 0) {
      lines.push({ text: '', width: 0 })
      continue
    }
    let current = ''
    for (const character of paragraph) {
      const candidate = current + character
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push({ text: current, width: ctx.measureText(current).width })
        current = character
      } else {
        current = candidate
      }
    }
    lines.push({ text: current, width: ctx.measureText(current).width })
  }

  ctx.restore()
  return lines
}

export interface DrawTextOptions {
  alpha: number
  /** 0..1，打字机效果用；不传则全部显示 */
  reveal?: number
}

function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  spec: TextSpec,
  options: DrawTextOptions
): void {
  const columns = spec.content.split('\n')
  const lineHeight = spec.fontSize * spec.lineHeight
  const maxChars = Math.max(1, ...columns.map((column) => [...column].length))
  const totalWidth = Math.max(lineHeight, columns.length * lineHeight)
  const startX = -totalWidth / 2 + lineHeight / 2
  const startY = -(maxChars - 1) * lineHeight / 2
  const totalChars = columns.reduce((sum, column) => sum + [...column].length, 0)
  let remaining =
    options.reveal === undefined ? totalChars : Math.max(0, Math.floor(options.reveal * totalChars))

  ctx.save()
  ctx.beginPath()
  ctx.rect(-element.width / 2, -element.height / 2, element.width, element.height)
  ctx.clip()
  ctx.font = fontString(spec)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillStyle = spec.color
  ctx.globalAlpha = Math.max(0, Math.min(1, options.alpha))

  columns.forEach((column, columnIndex) => {
    const chars = [...column]
    chars.forEach((char, charIndex) => {
      if (remaining <= 0) return
      remaining -= 1
      const x = startX + columnIndex * lineHeight
      const y = startY + charIndex * lineHeight
      ctx.fillText(char, x, y)
    })
  })
  ctx.restore()
}

export function drawTextElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  options: DrawTextOptions
): void {
  const spec = element.text
  if (!spec) return

  if (spec.vertical) {
    drawVerticalText(ctx, element, spec, options)
    return
  }

  const maxWidth = Math.max(20, element.width)
  const lines = layoutText(ctx, spec, maxWidth)
  const lineHeight = spec.fontSize * spec.lineHeight
  const totalHeight = lines.length * lineHeight
  const startY = -totalHeight / 2 + lineHeight / 2

  const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0)
  let remaining =
    options.reveal === undefined ? totalChars : Math.floor(options.reveal * totalChars)

  ctx.save()
  ctx.beginPath()
  ctx.rect(-element.width / 2, -element.height / 2, element.width, element.height)
  ctx.clip()
  ctx.font = fontString(spec)
  ctx.textBaseline = 'middle'
  ctx.textAlign = spec.align
  ctx.fillStyle = spec.color
  ctx.strokeStyle = spec.color
  ctx.globalAlpha = Math.max(0, Math.min(1, options.alpha))

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    let visible = line.text
    if (remaining < line.text.length) {
      visible = line.text.slice(0, Math.max(0, remaining))
    }
    remaining -= line.text.length
    if (!visible) continue

    const x = spec.align === 'left' ? -element.width / 2 : spec.align === 'right' ? element.width / 2 : 0
    const y = startY + index * lineHeight
    ctx.fillText(visible, x, y)

    const width = ctx.measureText(visible).width
    const left = spec.align === 'left' ? x : spec.align === 'right' ? x - width : x - width / 2
    const thickness = Math.max(1.5, spec.fontSize * 0.055)
    if (spec.underline) {
      ctx.fillRect(left, y + spec.fontSize * 0.4, width, thickness)
    }
    if (spec.strikethrough) {
      ctx.fillRect(left, y - thickness / 2, width, thickness)
    }
  }

  ctx.restore()
}

export const FONT_FAMILIES = [
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'SimHei',
  'SimSun',
  'KaiTi',
  'FangSong',
  'DengXian',
  'STKaiti',
  'STSong',
  'PingFang SC',
  'Source Han Sans SC',
  'Noto Sans SC',
  'Segoe UI',
  'Arial',
  'Calibri',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Garamond',
  'Consolas',
  'Courier New',
  'Comic Sans MS',
  'Impact',
  'WenQuanYi Micro Hei',
  'WenQuanYi Zen Hei',
  'Sarasa Gothic SC',
  'LXGW WenKai',
  'Smiley Sans',
  'Zihun BianTaoTi',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Source Sans 3',
  'DejaVu Sans',
  'Fira Sans',
  'IBM Plex Sans',
  'JetBrains Mono'
]

export function isFontAvailable(fontFamily: string): boolean {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return true
    const sample = 'mmmmmmmmmmlli'
    ctx.font = '72px monospace'
    const baseline = ctx.measureText(sample).width
    ctx.font = `72px "${fontFamily}", monospace`
    return Math.abs(ctx.measureText(sample).width - baseline) > 0.5
  } catch {
    return true
  }
}

const SAFE_FONTS = [
  'sourcehansans',
  'sourcehanserif',
  'notosans',
  'notoserif',
  '思源黑体',
  '思源宋体',
  '文泉驿',
  'wenquanyi',
  '得意黑',
  'smileysans',
  '字魂扁桃体',
  'zihunbian',
  '更纱黑体',
  'sarasagothic',
  '霞鹜',
  'lxgw',
  'opendsans',
  'roboto',
  'opensans',
  'lato',
  'sourcesans',
  'dejavu',
  'firasans',
  'ibmplex',
  'jetbrainsmono',
  'inter'
]

export function isSafeFont(fontFamily: string): boolean {
  const normalized = fontFamily.toLowerCase().replace(/[\s\-_]/g, '')
  return SAFE_FONTS.some((safe) => normalized.includes(safe))
}

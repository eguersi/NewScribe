import type { ChartSeries, ChartSpec, SceneElement } from '@shared/project'

const PALETTE = ['#f5a524', '#4da3ff', '#38d39f', '#ff6b6b', '#a78bfa', '#f472b6']
const LABEL_COLOR = '#475569'
const AXIS_COLOR = 'rgba(71, 85, 105, 0.45)'
const GRID_COLOR = 'rgba(71, 85, 105, 0.12)'

function seriesColor(series: ChartSeries, index: number): string {
  return series.color || PALETTE[index % PALETTE.length]
}

function niceMax(value: number): number {
  if (!(value > 0)) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  maxValue: number,
  chart: ChartSpec,
  uiScale: number
): void {
  if (!chart.showAxis) return
  ctx.save()
  ctx.strokeStyle = AXIS_COLOR
  ctx.lineWidth = Math.max(0.5, uiScale)
  ctx.beginPath()
  ctx.moveTo(left, top)
  ctx.lineTo(left, top + height)
  ctx.lineTo(left + width, top + height)
  ctx.stroke()

  ctx.fillStyle = LABEL_COLOR
  ctx.font = `${11 * uiScale}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4
    const y = top + height - ratio * height
    ctx.strokeStyle = GRID_COLOR
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(left + width, y)
    ctx.stroke()
    ctx.fillText(String(Math.round(maxValue * ratio)), left - 8 * uiScale, y)
  }
  ctx.restore()
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  chart: ChartSpec,
  left: number,
  bottom: number,
  width: number,
  uiScale: number
): void {
  const count = Math.max(1, chart.labels.length)
  ctx.save()
  ctx.fillStyle = LABEL_COLOR
  ctx.font = `${12 * uiScale}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  chart.labels.forEach((label, index) => {
    const x = left + ((index + 0.5) / count) * width
    ctx.fillText(label, x, bottom + 8 * uiScale)
  })
  ctx.restore()
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  chart: ChartSpec,
  x: number,
  y: number,
  uiScale: number
): void {
  if (!chart.showLegend) return
  ctx.save()
  ctx.font = `${12 * uiScale}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  let cursor = x
  chart.series.forEach((series, index) => {
    const color = seriesColor(series, index)
    ctx.fillStyle = color
    ctx.fillRect(cursor, y - 5 * uiScale, 10 * uiScale, 10 * uiScale)
    ctx.fillStyle = LABEL_COLOR
    ctx.fillText(series.name, cursor + 15 * uiScale, y)
    cursor += 15 * uiScale + ctx.measureText(series.name).width + 18 * uiScale
  })
  ctx.restore()
}

function drawLineChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartSpec,
  left: number,
  top: number,
  width: number,
  height: number,
  maxValue: number,
  progress: number,
  uiScale: number
): void {
  const count = Math.max(1, chart.labels.length)
  const pointsFor = (values: number[]): Array<[number, number]> =>
    values.map((value, index) => [
      left + (count === 1 ? width / 2 : (index / (count - 1)) * width),
      top + height - (Math.max(0, value) / maxValue) * height
    ])
  const totalSegments = Math.max(1, count - 1)
  const visible = progress * totalSegments

  chart.series.forEach((series, seriesIndex) => {
    const points = pointsFor(series.values)
    const color = seriesColor(series, seriesIndex)
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 3 * uiScale
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y)
      else {
        const segment = index - 0.5
        if (segment <= visible) ctx.lineTo(x, y)
        else if (segment - 1 < visible) {
          const t = visible - (segment - 1)
          const previous = points[index - 1]
          ctx.lineTo(previous[0] + (x - previous[0]) * t, previous[1] + (y - previous[1]) * t)
        }
      }
    })
    ctx.stroke()
    ctx.fillStyle = color
    points.forEach(([x, y], index) => {
      if (index <= visible + 0.001) {
        ctx.beginPath()
        ctx.arc(x, y, 4 * uiScale, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    if (chart.showValues && progress > 0.98) {
      ctx.fillStyle = LABEL_COLOR
      ctx.font = `${11 * uiScale}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      points.forEach(([x, y], index) => ctx.fillText(String(series.values[index] ?? 0), x, y - 7 * uiScale))
    }
    ctx.restore()
  })
}

function drawBarChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartSpec,
  left: number,
  top: number,
  width: number,
  height: number,
  maxValue: number,
  progress: number,
  uiScale: number
): void {
  const count = Math.max(1, chart.labels.length)
  const groupWidth = width / count
  const seriesCount = Math.max(1, chart.series.length)
  const barWidth = Math.min(46 * uiScale, (groupWidth * 0.68) / seriesCount)
  const groupInner = barWidth * seriesCount
  chart.series.forEach((series, seriesIndex) => {
    const color = seriesColor(series, seriesIndex)
    ctx.save()
    ctx.fillStyle = color
    chart.labels.forEach((_, index) => {
      const value = Math.max(0, series.values[index] ?? 0)
      const barHeight = (value / maxValue) * height * progress
      const groupLeft = left + index * groupWidth + (groupWidth - groupInner) / 2
      const x = groupLeft + seriesIndex * barWidth
      const y = top + height - barHeight
      ctx.beginPath()
      ctx.roundRect(x + 1, y, Math.max(2, barWidth - 2), barHeight, 4 * uiScale)
      ctx.fill()
      if (chart.showValues && progress > 0.98 && value > 0) {
        ctx.fillStyle = LABEL_COLOR
        ctx.font = `${11 * uiScale}px "Microsoft YaHei", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(value), x + barWidth / 2, y - 5 * uiScale)
        ctx.fillStyle = color
      }
    })
    ctx.restore()
  })
}

function drawPieChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartSpec,
  left: number,
  top: number,
  width: number,
  height: number,
  progress: number,
  uiScale: number
): void {
  const series = chart.series[0]
  if (!series) return
  const values = chart.labels.map((_, index) => Math.max(0, series.values[index] ?? 0))
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return
  const radius = Math.min(width, height) * 0.42
  const centerX = left + width / 2
  const centerY = top + height / 2
  let angle = -Math.PI / 2
  const sweepTotal = Math.PI * 2 * progress
  let drawn = 0
  values.forEach((value, index) => {
    const full = (value / total) * Math.PI * 2
    const sweep = Math.max(0, Math.min(full, sweepTotal - drawn))
    if (sweep <= 0) return
    ctx.save()
    ctx.fillStyle = seriesColor({ ...series, color: PALETTE[index % PALETTE.length] }, index)
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, angle, angle + sweep)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    const mid = angle + full / 2
    const ratio = total > 0 ? value / total : 0
    if (ratio >= 0.04 && sweep > 0.18) {
      const labelX = centerX + Math.cos(mid) * radius * 0.62
      const labelY = centerY + Math.sin(mid) * radius * 0.62
      const label = chart.labels[index] ?? ''
      const detail = `${value}（${Math.round(ratio * 100)}%）`
      ctx.save()
      ctx.font = `${12 * uiScale}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3 * uiScale
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'
      ctx.strokeText(label, labelX, labelY - 7 * uiScale)
      ctx.strokeText(detail, labelX, labelY + 8 * uiScale)
      ctx.fillStyle = '#1f2937'
      ctx.fillText(label, labelX, labelY - 7 * uiScale)
      ctx.fillText(detail, labelX, labelY + 8 * uiScale)
      ctx.restore()
    }

    angle += full
    drawn += full
  })
}

export function drawChartElement(
  ctx: CanvasRenderingContext2D,
  element: SceneElement,
  progress: number,
  alpha = 1
): void {
  const chart = element.chart
  if (!chart) return
  const p = Math.max(0, Math.min(1, progress))
  const left = -element.width / 2
  const top = -element.height / 2

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  const uiScale = Math.max(
    0.12,
    Math.min(2.5, Math.min(element.width / 760, element.height / 471.2))
  )
  const padding = 24 * uiScale
  const isPie = chart.kind === 'pie'
  const titleHeight = chart.title ? 34 * uiScale : 0
  const legendHeight = chart.showLegend && !isPie ? 24 * uiScale : 0
  const labelHeight = isPie ? 0 : 26 * uiScale
  const axisWidth = chart.showAxis && !isPie ? 42 * uiScale : 0
  const plotLeft = left + padding + axisWidth
  const plotTop = top + padding + titleHeight
  const plotWidth = element.width - padding * 2 - axisWidth
  const plotHeight = element.height - padding * 2 - titleHeight - legendHeight - labelHeight
  const bottom = plotTop + plotHeight

  if (chart.title) {
    ctx.fillStyle = '#1f2937'
    ctx.font = `bold ${18 * uiScale}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(chart.title, left + padding, top + padding)
  }
  if (legendHeight > 0) drawLegend(ctx, chart, plotLeft, top + padding + titleHeight - 14 * uiScale, uiScale)

  const allValues = chart.series.flatMap((series) => series.values)
  const maxValue = niceMax(Math.max(0, ...allValues))
  if (!isPie) {
    drawAxis(ctx, plotLeft, plotTop, plotWidth, plotHeight, maxValue, chart, uiScale)
    drawLabels(ctx, chart, plotLeft, bottom, plotWidth, uiScale)
  }

  if (chart.kind === 'line') {
    drawLineChart(ctx, chart, plotLeft, plotTop, plotWidth, plotHeight, maxValue, p, uiScale)
  } else if (chart.kind === 'bar') {
    drawBarChart(ctx, chart, plotLeft, plotTop, plotWidth, plotHeight, maxValue, p, uiScale)
  } else {
    drawPieChart(ctx, chart, plotLeft, plotTop, plotWidth, plotHeight, p, uiScale)
  }

  ctx.restore()
}

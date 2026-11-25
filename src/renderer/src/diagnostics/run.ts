import type { AppInfo, CheckResult, DiagnosticsReport } from '@shared/types'

const W = 1920
const H = 1080
const FPS = 30

const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40))

function runtimeCheck(app: AppInfo): CheckResult {
  return {
    id: 'runtime',
    label: '运行环境',
    status: 'ok',
    detail: `Electron ${app.electron} · Chromium ${app.chrome} · Node ${app.node} · ${app.platform}/${app.arch}`
  }
}

async function videoCheck(): Promise<CheckResult> {
  const VE = (globalThis as { VideoEncoder?: any }).VideoEncoder
  if (!VE) {
    return {
      id: 'video',
      label: '视频编码（H.264）',
      status: 'fail',
      detail: '当前 Chromium 不支持 WebCodecs，需要启用内置 ffmpeg 兜底'
    }
  }

  const candidates: Array<[string, string]> = [
    ['avc1.640028', 'H.264 High 4.0'],
    ['avc1.4d401f', 'H.264 Main 3.1'],
    ['avc1.42001f', 'H.264 Baseline 3.1']
  ]

  for (const [codec, name] of candidates) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      try {
        const result = await VE.isConfigSupported({
          codec,
          width: W,
          height: H,
          bitrate: 8_000_000,
          framerate: FPS,
          hardwareAcceleration
        })
        if (result?.supported) {
          return {
            id: 'video',
            label: '视频编码（H.264）',
            status: 'ok',
            detail: `${name} · ${W}×${H}@${FPS} · ${hardwareAcceleration === 'prefer-hardware' ? '优先硬件' : '自动选择'}`
          }
        }
      } catch {
        // 继续尝试下一档
      }
    }
  }

  return {
    id: 'video',
    label: '视频编码（H.264）',
    status: 'warn',
    detail: 'H.264 编码器不可用，导出将改用内置 ffmpeg（较慢，但不影响成片）'
  }
}

async function audioCheck(): Promise<CheckResult> {
  const AE = (globalThis as { AudioEncoder?: any }).AudioEncoder
  if (!AE) {
    return {
      id: 'audio',
      label: '音频编码（AAC）',
      status: 'warn',
      detail: 'WebCodecs 音频编码不可用，背景音乐将走 ffmpeg 混流'
    }
  }

  const candidates: Array<[string, string]> = [
    ['mp4a.40.2', 'AAC-LC'],
    ['opus', 'Opus']
  ]

  for (const [codec, name] of candidates) {
    try {
      const result = await AE.isConfigSupported({
        codec,
        sampleRate: 48_000,
        numberOfChannels: 1,
        bitrate: 128_000
      })
      if (result?.supported) {
        if (codec === 'mp4a.40.2') {
          return {
            id: 'audio',
            label: '音频编码（AAC）',
            status: 'ok',
            detail: `${name} · 48 kHz · 128 kbps`
          }
        }
        return {
          id: 'audio',
          label: '音频编码（AAC）',
          status: 'warn',
          detail: 'AAC 不可用，将使用 Opus（部分播放器不兼容）'
        }
      }
    } catch {
      // 继续
    }
  }

  return {
    id: 'audio',
    label: '音频编码（AAC）',
    status: 'warn',
    detail: '没有可用的音频编码器，导出将没有声音'
  }
}

function makeStrokes(count: number, pointsPerStroke: number): number[][][] {
  let seed = 20261027
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  const strokes: number[][][] = []
  for (let s = 0; s < count; s += 1) {
    let x = random() * W
    let y = random() * H
    let angle = random() * Math.PI * 2
    const points: number[][] = []
    for (let i = 0; i < pointsPerStroke; i += 1) {
      angle += (random() - 0.5) * 0.4
      x += Math.cos(angle) * 12
      y += Math.sin(angle) * 12
      points.push([x, y])
    }
    strokes.push(points)
  }
  return strokes
}

function canvasCheck(): CheckResult {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    return { id: 'canvas', label: '画布渲染性能', status: 'fail', detail: '无法创建 2D 画布' }
  }

  const strokes = makeStrokes(240, 80)
  let seed = 7
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  const draw = (): void => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const points of strokes) {
      ctx.strokeStyle = `rgba(20,22,28,${0.35 + random() * 0.65})`
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1])
      ctx.stroke()
    }
  }

  draw()
  draw()

  const frames = 12
  const started = performance.now()
  for (let i = 0; i < frames; i += 1) draw()
  const ms = (performance.now() - started) / frames

  const segments = strokes.length * (80 - 1)
  const status = ms < 16 ? 'ok' : ms < 33 ? 'warn' : 'fail'
  return {
    id: 'canvas',
    label: '画布渲染性能',
    status,
    detail: `${ms.toFixed(1)} ms/帧 · ${segments.toLocaleString()} 条线段 · 全量重绘（实际有缓存，会更快）`,
    ms
  }
}

function buildSvg(): string {
  const parts: string[] = []
  for (let i = 0; i < 120; i += 1) {
    const x = (i % 12) * 62 + 24
    const y = Math.floor(i / 12) * 48 + 30
    parts.push(
      `<path d="M${x} ${y} C${x + 14} ${y - 18} ${x + 36} ${y + 26} ${x + 52} ${y + 4}" fill="none" stroke="#111" stroke-width="2"/>`
    )
  }
  for (let i = 0; i < 12; i += 1) {
    parts.push(`<circle cx="${110 + i * 48}" cy="560" r="18" fill="#111"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">${parts.join('')}</svg>`
}

function svgCheck(): CheckResult {
  const host = document.createElement('div')
  host.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden')
  host.innerHTML = buildSvg()
  document.body.appendChild(host)

  try {
    const elements = Array.from(
      host.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon')
    ) as SVGGeometryElement[]

    let points = 0
    let length = 0
    const sampleStarted = performance.now()

    for (const element of elements) {
      const total = element.getTotalLength()
      length += total
      const matrix = element.getCTM()
      const steps = Math.max(2, Math.ceil(total / 2))
      for (let i = 0; i <= steps; i += 1) {
        const point = element.getPointAtLength((total * i) / steps)
        if (matrix) {
          // 烘焙变换矩阵，得到画布坐标
          void (matrix.a * point.x + matrix.c * point.y + matrix.e)
          void (matrix.b * point.x + matrix.d * point.y + matrix.f)
        }
        points += 1
      }
    }

    const sampleMs = performance.now() - sampleStarted

    // 填充扫描：验证「逐行找实心区间」的速度。
    // 生产环境会用低分辨率采样来决定涂绘顺序，这里用 800×600 模拟。
    const fillCanvas = document.createElement('canvas')
    fillCanvas.width = 800
    fillCanvas.height = 600
    const fillCtx = fillCanvas.getContext('2d', { willReadFrequently: true })
    let fillMs = 0
    let spans = 0
    if (fillCtx) {
      fillCtx.fillStyle = '#000'
      fillCtx.beginPath()
      fillCtx.arc(400, 300, 260, 0, Math.PI * 2)
      fillCtx.fill()
      const fillStarted = performance.now()
      const data = fillCtx.getImageData(0, 0, 800, 600).data
      for (let y = 0; y < 600; y += 2) {
        let inRun = false
        for (let x = 0; x < 800; x += 1) {
          const opaque = data[(y * 800 + x) * 4 + 3] > 127
          if (opaque && !inRun) {
            spans += 1
            inRun = true
          } else if (!opaque) {
            inRun = false
          }
        }
      }
      fillMs = performance.now() - fillStarted
    }

    return {
      id: 'svg',
      label: 'SVG 路径采样',
      status: sampleMs < 800 ? 'ok' : 'warn',
      detail: `${elements.length} 条路径 · ${points.toLocaleString()} 个采样点 · ${Math.round(
        length
      ).toLocaleString()} px · 采样 ${sampleMs.toFixed(1)} ms（导入时一次性；填充扫描 ${fillMs.toFixed(
        1
      )} ms / ${spans} 段）`,
      ms: sampleMs
    }
  } finally {
    host.remove()
  }
}

async function encodeCheck(): Promise<CheckResult> {
  const VE = (globalThis as { VideoEncoder?: any; VideoFrame?: any }).VideoEncoder
  const VF = (globalThis as { VideoFrame?: any }).VideoFrame
  if (!VE || !VF) {
    return { id: 'encode', label: 'MP4 编码测试', status: 'fail', detail: 'WebCodecs 不可用，跳过' }
  }

  const started = performance.now()
  const frames = 60

  try {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: W, height: H },
      fastStart: 'in-memory'
    })

    let encodeError: unknown = null
    const encoder = new VE({
      output: (chunk: unknown, meta: unknown) => muxer.addVideoChunk(chunk as never, meta as never),
      error: (error: unknown) => {
        encodeError = error
      }
    })

    encoder.configure({
      codec: 'avc1.640028',
      width: W,
      height: H,
      bitrate: 8_000_000,
      framerate: FPS
    })

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('无法创建画布')

    for (let i = 0; i < frames; i += 1) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#111111'
      ctx.lineWidth = 10
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (let x = 0; x < W; x += 8) {
        const y = H / 2 + Math.sin((x + i * 18) / 90) * 160
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      const frame = new VF(canvas, {
        timestamp: Math.round((i * 1_000_000) / FPS),
        duration: Math.round(1_000_000 / FPS)
      })
      encoder.encode(frame, { keyFrame: i % 30 === 0 })
      frame.close()
    }

    await encoder.flush()
    encoder.close()
    if (encodeError) throw encodeError
    muxer.finalize()

    const buffer = (target as { buffer: ArrayBuffer }).buffer
    let savedLabel = ''
    try {
      const saved = await window.newscribe.saveSmokeClip(buffer)
      savedLabel = ` · 已存盘 ${saved.saved.split(/[\\/]/).pop()}`
    } catch {
      savedLabel = ''
    }

    const bytes = buffer.byteLength
    const ms = performance.now() - started
    const fps = frames / (ms / 1000)

    return {
      id: 'encode',
      label: 'MP4 编码测试',
      status: bytes > 1000 && fps > 8 ? 'ok' : 'warn',
      detail: `${frames} 帧 ${W}×${H} → ${(bytes / 1024 / 1024).toFixed(2)} MB · ${
        ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
      }（${fps.toFixed(0)} fps）${savedLabel}`,
      ms
    }
  } catch (error) {
    return {
      id: 'encode',
      label: 'MP4 编码测试',
      status: 'fail',
      detail: `编码失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function runDiagnostics(
  app: AppInfo,
  onCheck: (check: CheckResult) => void
): Promise<DiagnosticsReport> {
  const checks: CheckResult[] = []
  const push = (check: CheckResult): void => {
    checks.push(check)
    onCheck(check)
  }

  push(runtimeCheck(app))
  await nextFrame()

  push(await videoCheck())
  await nextFrame()

  push(await audioCheck())
  await nextFrame()

  push(canvasCheck())
  await nextFrame()

  push(svgCheck())
  await nextFrame()

  push(await encodeCheck())

  const failed = checks.filter((check) => check.status === 'fail')
  const warned = checks.filter((check) => check.status === 'warn')
  const verdict: DiagnosticsReport['verdict'] = failed.length
    ? 'blocked'
    : warned.length
      ? 'degraded'
      : 'ready'

  const summary = failed.length
    ? `${failed.map((check) => check.label).join('、')} 未通过，需要先处理。`
    : warned.length
      ? `${warned.map((check) => check.label).join('、')} 有降级，核心功能仍可用。`
      : '编码、渲染、SVG 解析全部通过，可以进入 P1（画布与编辑）。'

  return {
    createdAt: new Date().toISOString(),
    app,
    checks,
    summary,
    verdict
  }
}

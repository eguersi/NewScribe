import type { AudioSpec, Project } from '@shared/project'
import { buildTimeline } from '@shared/timeline'
import type { AssetRuntime } from './assets'
import { ensureDrawPlans } from './draw'
import { renderPreviewFrame } from './preview'

export type ExportPhase = 'prepare' | 'audio' | 'video' | 'mux' | 'done'

export interface ExportProgress {
  phase: ExportPhase
  ratio: number
  frame?: number
  frames?: number
}

export interface ExportOptions {
  project: Project
  assets: Record<string, AssetRuntime>
  width: number
  height: number
  fps: number
  signal: AbortSignal
  onProgress: (progress: ExportProgress) => void
  /** 临时导出诊断日志；用于定位卡在视频帧/flush 的问题 */
  onLog?: (message: string) => void
}

export function gainAt(time: number, duration: number, spec: AudioSpec): number {
  const fadeIn = Math.max(0, spec.fadeIn)
  const fadeOut = Math.max(0, spec.fadeOut)
  const inFactor = fadeIn > 0 ? Math.min(1, Math.max(0, time / fadeIn)) : 1
  const outFactor =
    fadeOut > 0 ? Math.min(1, Math.max(0, (duration - time) / fadeOut)) : 1
  return Math.max(0, Math.min(1, spec.volume)) * inFactor * outFactor
}

async function mixAudio(
  tracks: Array<{ buffer: AudioBuffer; spec: AudioSpec }>,
  duration: number
): Promise<AudioBuffer> {
  const sampleRate = 48_000
  const length = Math.max(1, Math.ceil(duration * sampleRate))
  const offline = new OfflineAudioContext(2, length, sampleRate)

  for (const { buffer, spec } of tracks) {
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.loop = spec.loop ?? true

    const gain = offline.createGain()
    const volume = Math.max(0, Math.min(1, spec.volume))
    const fadeIn = Math.max(0, spec.fadeIn)
    const fadeOut = Math.max(0, spec.fadeOut)

    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, 0)
      gain.gain.linearRampToValueAtTime(volume, Math.min(duration, fadeIn))
    } else {
      gain.gain.setValueAtTime(volume, 0)
    }
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(volume, Math.max(fadeIn, duration - fadeOut))
      gain.gain.linearRampToValueAtTime(0, duration)
    }

    source.connect(gain)
    gain.connect(offline.destination)
    source.start(0)
  }

  return offline.startRendering()
}

async function encodeAudio(
  buffer: AudioBuffer,
  muxer: { addAudioChunk: (chunk: never, meta: never) => void },
  onRatio: (ratio: number) => void
): Promise<void> {
  const AE = (globalThis as { AudioEncoder?: any }).AudioEncoder
  const AD = (globalThis as { AudioData?: any }).AudioData
  if (!AE || !AD) throw new Error('当前环境没有音频编码器')

  const sampleRate = 48_000
  const channels = 2
  const encoder = new AE({
    output: (chunk: unknown, meta: unknown) => muxer.addAudioChunk(chunk as never, meta as never),
    error: (error: unknown) => {
      throw error
    }
  })
  encoder.configure({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels: channels,
    bitrate: 128_000
  })

  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left
  const frameSize = 4800

  for (let offset = 0; offset < buffer.length; offset += frameSize) {
    const frames = Math.min(frameSize, buffer.length - offset)
    const data = new Float32Array(frames * channels)
    data.set(left.subarray(offset, offset + frames), 0)
    data.set(right.subarray(offset, offset + frames), frames)
    const audioData = new AD({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data
    })
    encoder.encode(audioData)
    audioData.close()
    if (encoder.encodeQueueSize > 8) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    if (offset % (frameSize * 10) === 0) {
      onRatio(Math.min(1, offset / buffer.length))
    }
  }

  await encoder.flush()
  encoder.close()
  onRatio(1)
}

export async function exportProject(options: ExportOptions): Promise<ArrayBuffer> {
  const { project, assets, signal, onProgress } = options
  const startedAt = performance.now()
  const log = (message: string): void => {
    try {
      options.onLog?.(message)
    } catch {
      // 诊断日志不能影响导出
    }
  }
  const stamp = (message: string): string =>
    `${new Date().toISOString()} +${Math.round(performance.now() - startedAt)}ms ${message}`
  log(
    stamp(
      `start elements=${project.elements.length} assets=${project.assets.length} canvas=${project.canvas.width}x${project.canvas.height}`
    )
  )
  const width = Math.max(2, Math.round(Number(options.width) || 1920))
  const height = Math.max(2, Math.round(Number(options.height) || 1080))
  const fps = Math.max(1, Math.round(Number(options.fps) || 30))
  const timeline = buildTimeline(project)
  if (timeline.duration <= 0.05) throw new Error('时间轴是空的，先添加元素')
  if (!project.elements.length) throw new Error('没有可导出的元素')

  if (signal.aborted) throw new DOMException('已取消', 'AbortError')
  onProgress({ phase: 'prepare', ratio: 0 })
  log(stamp(`prepare draw plans start`))
  await ensureDrawPlans(project, assets)
  log(stamp(`prepare draw plans done`))
  if (signal.aborted) throw new DOMException('已取消', 'AbortError')

  const VE = (globalThis as { VideoEncoder?: any }).VideoEncoder
  const VF = (globalThis as { VideoFrame?: any }).VideoFrame
  if (!VE || !VF) throw new Error('当前环境不支持 WebCodecs，无法导出')

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const audioSpecs = [project.audio, project.audio2].filter(
    (spec): spec is AudioSpec => Boolean(spec)
  )
  const audioTracks = audioSpecs
    .map((spec) => ({ spec, buffer: assets[spec.assetId]?.buffer }))
    .filter((track): track is { spec: AudioSpec; buffer: AudioBuffer } => Boolean(track.buffer))
  const hasAudio = audioTracks.length > 0

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(hasAudio
      ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48_000 } }
      : {}),
    fastStart: 'in-memory'
  })

  if (hasAudio) {
    onProgress({ phase: 'audio', ratio: 0 })
    log(stamp(`audio mix start tracks=${audioTracks.length}`))
    const mixed = await mixAudio(audioTracks, timeline.duration)
    log(stamp(`audio mix done samples=${mixed.length}`))
    await encodeAudio(mixed, muxer as never, (ratio) =>
      onProgress({ phase: 'audio', ratio: 0.05 + ratio * 0.1 })
    )
    log(stamp(`audio encode done`))
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('无法创建导出画布')

  let encodeError: unknown = null
  const encoder = new VE({
    output: (chunk: unknown, meta: unknown) => muxer.addVideoChunk(chunk as never, meta as never),
    error: (error: unknown) => {
      encodeError = error
    }
  })
  const bitrate = Math.max(
    4_000_000,
    Math.min(80_000_000, Math.round(width * height * fps * 0.15))
  )
  const candidates =
    width * height >= 2560 * 1440
      ? ['avc1.640034', 'avc1.640033', 'avc1.64002a']
      : width * height > 1920 * 1080 || fps > 30
        ? ['avc1.64002a', 'avc1.640033', 'avc1.640028']
        : ['avc1.640028', 'avc1.64002a', 'avc1.64001f']
  let codec = candidates[0]
  for (const candidate of candidates) {
    try {
      const support = await VE.isConfigSupported({
        codec: candidate,
        width,
        height,
        bitrate,
        framerate: fps
      })
      if (support.supported) {
        codec = candidate
        break
      }
    } catch {
      // 尝试下一个编码级别
    }
  }
  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps
  })

  const frames = Math.max(1, Math.round(timeline.duration * fps))
  log(
    stamp(
      `video start duration=${timeline.duration.toFixed(3)}s frames=${frames} fps=${fps} size=${width}x${height} codec=${codec}`
    )
  )

  for (let index = 0; index < frames; index += 1) {
    if (signal.aborted) {
      encoder.close()
      log(stamp(`video aborted at frame ${index}/${frames}`))
      throw new DOMException('已取消', 'AbortError')
    }
    if (encodeError) {
      log(stamp(`encoder error before frame ${index}: ${String(encodeError)}`))
      throw encodeError
    }

    const time = index / fps
    if (index === frames - 1) log(stamp(`last frame render start ${index}/${frames}`))
    renderPreviewFrame({
      ctx,
      width,
      height,
      dpr: 1,
      project,
      assets,
      timeline,
      time
    })

    const frame = new VF(canvas, {
      timestamp: Math.round((index * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps)
    })
    encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 })
    frame.close()

    if (index === 0 || index === frames - 1 || index % 120 === 0) {
      log(stamp(`frame ${index}/${frames} queue=${encoder.encodeQueueSize}`))
    }

    // 编码器在部分机器上不会在 encode() 后及时消费队列；定期 flush，
    // 避免把数千帧全部堆到结尾，降低内存/GPU 压力。
    if (index > 0 && index % 600 === 0) {
      log(stamp(`periodic flush at frame ${index}/${frames} queue=${encoder.encodeQueueSize}`))
      await encoder.flush()
      log(stamp(`periodic flush done queue=${encoder.encodeQueueSize}`))
    }

    if (encoder.encodeQueueSize > 10) {
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    if (index % 4 === 0) {
      onProgress({
        phase: 'video',
        ratio: 0.15 + (index / frames) * 0.82,
        frame: index,
        frames
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  log(stamp(`frame loop done frames=${frames}`))
  if (encodeError) {
    log(stamp(`encoder error after loop: ${String(encodeError)}`))
    throw encodeError
  }

  log(stamp(`encoder.flush() start queue=${encoder.encodeQueueSize}`))
  const flushStartedAt = performance.now()
  const flushHeartbeat = setInterval(() => {
    log(
      stamp(
        `flush waiting ${Math.round(performance.now() - flushStartedAt)}ms queue=${encoder.encodeQueueSize}`
      )
    )
  }, 1000)
  try {
    await encoder.flush()
  } finally {
    clearInterval(flushHeartbeat)
  }
  log(stamp(`encoder.flush() done`))
  encoder.close()
  if (encodeError) throw encodeError

  onProgress({ phase: 'mux', ratio: 0.98 })
  log(stamp(`mux start`))
  muxer.finalize()
  log(stamp(`mux done bytes=${(target as { buffer: ArrayBuffer }).buffer.byteLength}`))
  onProgress({ phase: 'done', ratio: 1 })
  return (target as { buffer: ArrayBuffer }).buffer
}

export function describeProgress(progress: ExportProgress): string {
  if (progress.phase === 'prepare') return '准备绘制数据…'
  if (progress.phase === 'audio') return '混合背景音乐…'
  if (progress.phase === 'video') {
    return `渲染视频帧 ${progress.frame ?? 0} / ${progress.frames ?? 0}`
  }
  if (progress.phase === 'mux') return '封装 MP4…'
  return '完成'
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '@shared/project'
import { buildTimeline, sampleTimeline } from '@shared/timeline'
import type { AssetRuntime } from './assets'
import { getAudioContext } from './assets'
import { ensureDrawPlans } from './draw'
import { drawPerf, resetDrawPerf, setDrawPerfEnabled } from './draw'
import { gainAt } from './export'
import { formatTime, renderPreviewFrame } from './preview'
import { Icon } from './Icon'
import { translate, useLanguage } from './i18n'

interface PreviewOverlayProps {
  project: Project
  assets: Record<string, AssetRuntime>
  startTime: number
  autoPlay: boolean
  onClose: () => void
}

export function PreviewOverlay(props: PreviewOverlayProps) {
  const { project, assets, startTime, autoPlay, onClose } = props
  const language = useLanguage()
  const timeline = useMemo(() => buildTimeline(project), [project])

  const [time, setTime] = useState(() => Math.min(Math.max(0, startTime), timeline.duration))
  const [playing, setPlaying] = useState(false)
  const [preparing, setPreparing] = useState(true)
  const [prepareProgress, setPrepareProgress] = useState({ done: 0, total: 0 })
  const [seekVersion, setSeekVersion] = useState(0)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const timeRef = useRef(time)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const perfRef = useRef({ frames: 0, total: 0 })
  const perfMode = new URLSearchParams(window.location.search).get('perf') === '1'
  useEffect(() => {
    setDrawPerfEnabled(perfMode)
  }, [perfMode])

  useEffect(() => {
    let alive = true
    setPreparing(true)
    setPrepareProgress({ done: 0, total: 0 })
    void (async () => {
      // 先让「准备中」这一帧画出来，再做可能较重的解析
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await ensureDrawPlans(
        project,
        assets,
        (done, total) => {
          if (alive) setPrepareProgress({ done, total })
        },
        8000
      )
      if (!alive) return
      setPreparing(false)
      setPlaying(autoPlay)
    })()
    return () => {
      alive = false
    }
  }, [project, assets, autoPlay])

  const seek = (next: number): void => {
    const clamped = Math.min(timeline.duration, Math.max(0, next))
    timeRef.current = clamped
    setTime(clamped)
  }

  useEffect(() => {
    const container = stageRef.current
    if (!container) return
    const update = (): void => {
      const rect = container.getBoundingClientRect()
      const aspect = project.canvas.width / project.canvas.height
      const maxWidth = Math.max(100, rect.width - 48)
      const maxHeight = Math.max(100, rect.height - 48)
      let width = maxWidth
      let height = width / aspect
      if (height > maxHeight) {
        height = maxHeight
        width = height * aspect
      }
      setSize({ width, height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [project.canvas.width, project.canvas.height])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const delta = Math.min(0.12, (now - last) / 1000)
      last = now
      let next = timeRef.current + delta
      if (next >= timeline.duration) {
        next = timeline.duration
        setPlaying(false)
        seek(next)
        return
      }
      seek(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, timeline.duration])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const startedAt = performance.now()
    renderPreviewFrame({
      ctx,
      width: size.width,
      height: size.height,
      dpr,
      project,
      assets,
      timeline,
      time
    })
    if (perfMode) {
      const elapsed = performance.now() - startedAt
      const perf = perfRef.current
      perf.frames += 1
      perf.total += elapsed
      if (perf.frames >= 60) {
        const frames = drawPerf.frames || 1
        console.log(
          `[perf] frames=${perf.frames} avgFrame=${(perf.total / perf.frames).toFixed(2)}ms ` +
            `avgDraw=${(drawPerf.drawMs / frames).toFixed(2)}ms ` +
            `avgStroke=${(drawPerf.strokeMs / frames).toFixed(2)}ms ` +
            `avgFill=${(drawPerf.fillMs / frames).toFixed(2)}ms`
        )
        perf.frames = 0
        perf.total = 0
        resetDrawPerf()
      }
    }
  }, [time, size, project, assets, timeline, preparing])

  useEffect(() => {
    const specs = [project.audio, project.audio2].filter(
      (spec): spec is NonNullable<typeof spec> => Boolean(spec)
    )
    const playable = specs
      .map((spec) => ({ spec, buffer: assets[spec.assetId]?.buffer }))
      .filter((entry): entry is { spec: (typeof specs)[number]; buffer: AudioBuffer } =>
        Boolean(entry.buffer)
      )
    if (!playing || playable.length === 0) return

    const ctx = getAudioContext()
    void ctx.resume()
    const players = playable.map(({ spec, buffer }) => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = spec.loop ?? true
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      const offset = buffer.duration > 0 ? timeRef.current % buffer.duration : 0
      source.start(0, offset)
      return { spec, source, gain }
    })

    const update = (): void => {
      for (const player of players) {
        player.gain.gain.value = gainAt(timeRef.current, timeline.duration, player.spec)
      }
    }
    update()
    const timer = window.setInterval(update, 60)

    return () => {
      window.clearInterval(timer)
      for (const player of players) {
        try {
          player.source.stop()
        } catch {
          // 已经停了
        }
        player.source.disconnect()
        player.gain.disconnect()
      }
    }
  }, [
    playing,
    seekVersion,
    project.audio,
    project.audio2,
    assets,
    timeline.duration
  ])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.code === 'Space') {
        event.preventDefault()
        if (!playing && timeRef.current >= timeline.duration - 0.001) {
          seek(0)
          setSeekVersion((value) => value + 1)
        }
        setPlaying((value) => !value)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setPlaying(false)
        seek(timeRef.current - 1)
        setSeekVersion((value) => value + 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setPlaying(false)
        seek(timeRef.current + 1)
        setSeekVersion((value) => value + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, timeline.duration, onClose])

  const toggle = (): void => {
    if (!playing && timeRef.current >= timeline.duration - 0.001) {
      seek(0)
      setSeekVersion((value) => value + 1)
    }
    setPlaying((value) => !value)
  }

  const restart = (): void => {
    seek(0)
    setSeekVersion((value) => value + 1)
    setPlaying(true)
  }

  const sample = sampleTimeline(project, timeline, time)
  const total = project.elements.length
  const activeIndex = sample.activeElementId
    ? project.elements.findIndex((element) => element.id === sample.activeElementId)
    : -1
  const current =
    sample.phase === 'end'
      ? total
      : activeIndex >= 0
        ? activeIndex + 1
        : 0
  const phaseLabel =
    sample.phase === 'appear'
      ? '出现'
      : sample.phase === 'hold'
        ? '暂停'
        : sample.phase === 'transition'
          ? '切换'
          : sample.phase === 'end'
            ? '结尾展示'
            : '准备'

  return (
    <div className="preview-overlay">
      <div className="preview-top">
        <div className="preview-title">
          <strong><Icon name="eye" />{translate('预览')}</strong>
          <span>{project.elements.length} {translate('个元素')} · {formatTime(timeline.duration)}</span>
        </div>
        <button className="tool-btn" onClick={onClose}><Icon name="close" />{translate('关闭（Esc）')}</button>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          style={{ width: size.width, height: size.height }}
        />
        {preparing && <div className="preview-preparing">
          <strong>{translate('正在建立描绘缓存…')}</strong>
          <span>
            {translate('首次预览多元素工程时可能需要一些时间，之后会快很多')}
            {prepareProgress.total > 0
              ? language === 'en'
                ? ` (${prepareProgress.done} / ${prepareProgress.total})`
                : `（${prepareProgress.done} / ${prepareProgress.total}）`
              : ''}
          </span>
          <div className="preview-preparing-bar">
            <i
              style={{
                width: `${
                  prepareProgress.total > 0
                    ? Math.round((prepareProgress.done / prepareProgress.total) * 100)
                    : 8
                }%`
              }}
            />
          </div>
        </div>}
      </div>

      <div className="preview-controls">
        <button className="tool-btn" onClick={restart}><Icon name="preview-start" />从头</button>
        <button className="tool-btn primary preview-play" onClick={toggle}>
          <Icon name={playing ? 'pause' : 'play-circle'} />
          {playing ? '暂停' : time >= timeline.duration ? '重播' : '播放'}
        </button>
        <input
          className="preview-range"
          type="range"
          min={0}
          max={Math.max(0.01, timeline.duration)}
          step={0.01}
          value={time}
          onChange={(event) => {
            setPlaying(false)
            seek(Number(event.target.value))
            setSeekVersion((value) => value + 1)
          }}
        />
        <span className="preview-time">
          {formatTime(time)} / {formatTime(timeline.duration)}
        </span>
      </div>

      <div className="preview-progress">
        <span className="preview-progress-count">{current} / {total}</span>
        <span className="preview-progress-phase">{translate(phaseLabel)}</span>
      </div>
    </div>
  )
}

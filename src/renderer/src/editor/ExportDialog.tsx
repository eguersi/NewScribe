import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '@shared/project'
import { buildTimeline } from '@shared/timeline'
import type { AssetRuntime } from './assets'
import { describeProgress, exportProject, type ExportProgress } from './export'
import { Icon } from './Icon'

const QUALITIES = [
  { id: '720p', label: '720p', short: 720 },
  { id: '1080p', label: '1080p', short: 1080 },
  { id: '2k', label: '2K', short: 1440 },
  { id: '4k', label: '4K', short: 2160 },
  { id: 'custom', label: '自定义', short: 0 }
] as const

type Quality = (typeof QUALITIES)[number]['id']

function even(value: number): number {
  return Math.max(2, Math.round((Number(value) || 2) / 2) * 2)
}

function dimensionsFor(
  quality: Quality,
  aspect: number,
  customWidth: number,
  customHeight: number
): { width: number; height: number } {
  if (quality === 'custom') {
    return {
      width: even(Number(customWidth) || 1920),
      height: even(Number(customHeight) || 1080)
    }
  }
  const short = QUALITIES.find((item) => item.id === quality)?.short ?? 1080
  if (aspect >= 1) return { width: even(short * aspect), height: even(short) }
  return { width: even(short), height: even(short / aspect) }
}

const FPS_OPTIONS = [24, 25, 30, 50, 60]

export function ExportDialog({
  project,
  assets,
  defaultName,
  defaults,
  onClose,
  onExported
}: {
  project: Project
  assets: Record<string, AssetRuntime>
  defaultName: string
  defaults: {
    quality: Quality
    fps: number
    customWidth: number
    customHeight: number
    exportDirectory: string
  }
  onClose: () => void
  onExported: (path: string) => void
}) {
  const initialName =
    defaultName.replace(/\.(nscribe|nspkg)$/i, '').replace(/\.mp4$/i, '').trim() || '未命名'
  const initialQuality: Quality = QUALITIES.some((item) => item.id === defaults.quality)
    ? defaults.quality
    : '1080p'
  const initialFps = [24, 25, 30, 50, 60].includes(Number(defaults.fps))
    ? Number(defaults.fps)
    : 30
  const aspect = project.canvas.width / project.canvas.height
  const initialDimensions = dimensionsFor(
    initialQuality,
    aspect,
    defaults.customWidth,
    defaults.customHeight
  )
  const [fileName, setFileName] = useState(initialName)
  const [preset, setPreset] = useState<Quality>(initialQuality)
  const [width, setWidth] = useState(initialDimensions.width)
  const [height, setHeight] = useState(initialDimensions.height)
  const [fps, setFps] = useState(initialFps)
  const [targetPath, setTargetPath] = useState('')
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [metaTitle, setMetaTitle] = useState(initialName)
  const [metaArtist, setMetaArtist] = useState('')
  const [metaComment, setMetaComment] = useState('')
  const [metaDirty, setMetaDirty] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExportProgress>({ phase: 'prepare', ratio: 0 })
  const [error, setError] = useState<string | null>(null)
  const [donePath, setDonePath] = useState<string | null>(null)
  const [logPath, setLogPath] = useState<string | null>(null)
  const [keepLog, setKeepLog] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const timeline = useMemo(() => buildTimeline(project), [project])
  const audioDuration = Math.max(
    0,
    ...[project.audio, project.audio2]
      .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
      .map((spec) => assets[spec.assetId]?.buffer?.duration ?? 0)
  )
  const audioLonger = audioDuration > timeline.duration + 0.1

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (targetPath) return
      const directory = defaults.exportDirectory || (await window.newscribe.getVideosDir())
      if (!cancelled && directory) {
        setTargetPath(window.newscribe.path.join(directory, `${fileName}.mp4`))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onClose])

  const choosePreset = (id: Quality): void => {
    setPreset(id)
    const dimensions = dimensionsFor(id, aspect, width, height)
    setWidth(dimensions.width)
    setHeight(dimensions.height)
  }

  const choosePath = async (): Promise<void> => {
    const path = await window.newscribe.saveDialog({
      title: '选择导出位置',
      defaultPath: targetPath || `${fileName.replace(/\.mp4$/i, '') || '未命名'}.mp4`,
      filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
    })
    if (!path) return
    const target = path.toLowerCase().endsWith('.mp4') ? path : `${path}.mp4`
    setTargetPath(target)
    setFileName(window.newscribe.path.basename(target).replace(/\.mp4$/i, ''))
    setMetaTitle(window.newscribe.path.basename(target).replace(/\.mp4$/i, ''))
  }

  const changeFileName = (value: string): void => {
    const base = value.replace(/\.mp4$/i, '')
    setFileName(base)
    setMetaTitle(base)
    if (targetPath) {
      const directory = window.newscribe.path.dirname(targetPath)
      setTargetPath(window.newscribe.path.join(directory, `${base || '未命名'}.mp4`))
    }
  }

  const start = async (): Promise<void> => {
    let target = targetPath.trim()
    if (!target) {
      const path = await window.newscribe.saveDialog({
        title: '导出 MP4',
        defaultPath: `${fileName.replace(/\.mp4$/i, '') || '未命名'}.mp4`,
        filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
      })
      if (!path) return
      target = path
    }
    if (!target.toLowerCase().endsWith('.mp4')) target = `${target}.mp4`
    setTargetPath(target)

    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setError(null)
    setDonePath(null)
    setProgress({ phase: 'prepare', ratio: 0 })

    const debugPath = `${target}.export-log.txt`
    setLogPath(debugPath)
    setKeepLog(false)
    let logBuffer = `${new Date().toISOString()} export dialog start target=${target}\n`
    let logTimer: ReturnType<typeof setTimeout> | null = null
    let logWriting = false
    let logDirty = false
    const flushLog = (): void => {
      if (logWriting) {
        logDirty = true
        return
      }
      logDirty = false
      logWriting = true
      void window.newscribe.fs
        .writeText(debugPath, logBuffer)
        .catch(() => undefined)
        .finally(() => {
          logWriting = false
          if (logDirty) flushLog()
        })
    }
    const appendLog = (message: string): void => {
      logBuffer += `${new Date().toISOString()} ${message}\n`
      logDirty = true
      if (logTimer === null) {
        logTimer = setTimeout(() => {
          logTimer = null
          flushLog()
        }, 250)
      }
    }
    appendLog(
      `export start ${width}x${height} ${fps}fps elements=${project.elements.length}`
    )

    try {
      const buffer = await exportProject({
        project,
        assets,
        width,
        height,
        fps,
        signal: controller.signal,
        onProgress: setProgress,
        onLog: appendLog
      })
      await window.newscribe.fs.writeBinary(target, buffer)
      appendLog(`video file written ${target} bytes=${buffer.byteLength}`)
      const metadata = {
        title: metaTitle.trim() || undefined,
        artist: metaArtist.trim() || undefined,
        comment: metaComment.trim() || undefined
      }
      if (metaDirty && (metadata.title || metadata.artist || metadata.comment)) {
        const result = await window.newscribe.setVideoMetadata(target, metadata)
        if (!result.ok) {
          setError(`视频信息写入失败：${result.error ?? '需要安装 ffmpeg'}`)
          appendLog(`metadata failed ${result.error ?? ''}`)
        } else {
          appendLog(`metadata written`)
        }
      } else {
        appendLog('metadata skipped (unchanged)')
      }
      setDonePath(target)
      onExported(target)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setProgress({ phase: 'prepare', ratio: 0 })
        appendLog('export aborted')
      } else {
        const message = caught instanceof Error ? caught.message : String(caught)
        setError(message)
        appendLog(`export failed ${message}`)
      }
    } finally {
      if (logTimer !== null) clearTimeout(logTimer)
      flushLog()
      controllerRef.current = null
      setRunning(false)
    }
  }

  const cancel = (): void => {
    controllerRef.current?.abort()
  }

  const percent = Math.round(Math.min(1, Math.max(0, progress.ratio)) * 100)

  return (
    <div className="modal-backdrop">
      <div className="modal export-modal">
        <div className="modal-head">
          <h2><Icon name="export" />导出 MP4</h2>
          <span className="modal-badge">
            {width}×{height} · {Number(fps) || 30} fps
          </span>
        </div>

        {!running && !donePath && (
          <>
            <div className="export-options">
              <label className="field">
                <span className="field-label">分辨率</span>
                <span className="field-input">
                  <select value={preset} onChange={(event) => choosePreset(event.target.value as Quality)}>
                    {QUALITIES.map((item) => {
                      const dimensions = dimensionsFor(item.id, aspect, width, height)
                      return (
                        <option key={item.id} value={item.id}>
                          {item.label} {item.id === 'custom' ? '' : `${dimensions.width}×${dimensions.height}`}
                        </option>
                      )
                    })}
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">帧率</span>
                <span className="field-input">
                  <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                    {FPS_OPTIONS.map((value) => (
                      <option key={value} value={value}>{value} fps</option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
            {preset === 'custom' && (
              <div className="export-options">
                <label className="field">
                  <span className="field-label">宽</span>
                  <span className="field-input">
                    <input
                      type="number"
                      min={320}
                      max={4096}
                      step={2}
                      value={width}
                      onChange={(event) => setWidth(Math.max(320, Number(event.target.value)))}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">高</span>
                  <span className="field-input">
                    <input
                      type="number"
                      min={240}
                      max={4096}
                      step={2}
                      value={height}
                      onChange={(event) => setHeight(Math.max(240, Number(event.target.value)))}
                    />
                  </span>
                </label>
              </div>
            )}
            <label className="field">
              <span className="field-label">文件名</span>
              <span className="field-input">
                <input
                  value={fileName}
                  onChange={(event) => changeFileName(event.target.value)}
                  placeholder="未命名"
                />
                <span className="field-suffix">.mp4</span>
              </span>
            </label>
            <div className="field export-path">
              <span className="field-label">导出位置</span>
              <span className="field-input">
                <input
                  value={targetPath}
                  onChange={(event) => setTargetPath(event.target.value)}
                  placeholder="留空则导出时选择"
                />
                <button className="mini-btn" onClick={() => void choosePath()}>选择…</button>
              </span>
            </div>
            {audioLonger && (
              <p className="hint small">
                音频比画面长 {Math.ceil(audioDuration - timeline.duration)} 秒，超出部分会被截断。
              </p>
            )}
          </>
        )}

        {(running || progress.ratio > 0) && !donePath && (
          <div className="export-progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="progress-meta">
              <span>{describeProgress(progress)}</span>
              <span>{percent}%</span>
            </div>
          </div>
        )}

        {donePath && (
          <div className="export-done">
            <strong>导出完成</strong>
            <code>{donePath}</code>
          </div>
        )}

        {donePath && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={keepLog}
              onChange={(event) => setKeepLog(event.target.checked)}
            />
            <span>保留导出日志</span>
          </label>
        )}

        {error && <div className="export-error">{error}</div>}

        {error && logPath && (
          <button
            className="tool-btn"
            onClick={() => void window.newscribe.showItemInFolder(logPath)}
          >
            查看导出日志
          </button>
        )}

        <div className="modal-actions">
          {donePath ? (
            <>
              <button className="tool-btn" onClick={() => void window.newscribe.showItemInFolder(donePath)}>
                打开所在文件夹
              </button>
              <button className="tool-btn" onClick={() => void window.newscribe.openFile(donePath)}>
                打开文件
              </button>
              <button
                className="tool-btn primary"
                onClick={() => {
                  if (logPath && !keepLog) void window.newscribe.fs.remove(logPath)
                  onClose()
                }}
              >
                完成
              </button>
            </>
          ) : running ? (
            <button className="tool-btn" onClick={cancel}>取消导出</button>
          ) : (
            <>
              <button className="tool-btn" onClick={() => setMetadataOpen(true)}>
                视频信息…
              </button>
              <button className="tool-btn" onClick={onClose}>取消</button>
              <button className="tool-btn primary" onClick={() => void start()}>开始导出</button>
            </>
          )}
        </div>
      </div>
      {metadataOpen && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <div className="modal-head">
              <h2>视频信息</h2>
            </div>
            <label className="field">
              <span className="field-label">标题</span>
              <span className="field-input">
                <input
                  value={metaTitle}
                  onChange={(event) => {
                    setMetaDirty(true)
                    setMetaTitle(event.target.value)
                  }}
                />
              </span>
            </label>
            <label className="field">
              <span className="field-label">作者</span>
              <span className="field-input">
                <input
                  value={metaArtist}
                  onChange={(event) => {
                    setMetaDirty(true)
                    setMetaArtist(event.target.value)
                  }}
                />
              </span>
            </label>
            <label className="field">
              <span className="field-label">备注</span>
              <span className="field-input">
                <input
                  value={metaComment}
                  onChange={(event) => {
                    setMetaDirty(true)
                    setMetaComment(event.target.value)
                  }}
                />
              </span>
            </label>
            <div className="modal-actions">
              <button className="tool-btn" onClick={() => setMetadataOpen(false)}>取消</button>
              <button
                className="tool-btn primary"
                onClick={() => {
                  void (async () => {
                    if (!donePath) {
                      setMetadataOpen(false)
                      return
                    }
                    const result = await window.newscribe.setVideoMetadata(donePath, {
                      title: metaTitle.trim() || undefined,
                      artist: metaArtist.trim() || undefined,
                      comment: metaComment.trim() || undefined
                    })
                    if (!result.ok) {
                      setError(`视频信息写入失败：${result.error ?? '需要安装 ffmpeg'}`)
                      return
                    }
                    setMetadataOpen(false)
                  })()
                }}
              >
                保存信息
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

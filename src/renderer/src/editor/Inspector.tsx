import { useEffect, useRef, useState } from 'react'
import type { AnimationKind, ChartSpec, SceneElement, TextSpec, TextureKind } from '@shared/project'
import { defaultChart, defaultIpa, defaultMath, defaultMindMap, defaultMolecule, defaultQr, defaultTable, type IpaSpec, type MathSpec, type MindMapSpec, type MoleculeSpec, type QrSpec, type ShapeSpec, type TableSpec } from '@shared/project'
import { Icon, type IconName } from './Icon'
import { useEditorStore } from './store'
import { xsampaToIpa } from './xsampa'
import { assetFromPath } from './assets'
import { maskMode } from './mask'
import { FONT_FAMILIES, isFontAvailable, isSafeFont } from './text'
import { HandPivotDialog } from './HandPivotDialog'
import { FontPicker } from './FontPicker'
import {
  addHand,
  BUILTIN_HANDS,
  bytesToDataUrl,
  getHandConfig,
  loadHands,
  updateHand,
  type HandConfig
} from './hands'

function NumberField(props: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  icon?: IconName
}) {
  const { label, value, onChange, min, max, step = 1, suffix, icon } = props
  const format = (next: number): string =>
    String(Number.isFinite(next) ? Math.round(next * 100) / 100 : 0)
  const [draft, setDraft] = useState(() => format(value))
  const focused = useRef(false)
  const commitChange = useRef(onChange)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(format(value))
  }, [value])

  const commitDraft = (): void => {
    focused.current = false
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const raw = draft.trim()
    if (raw === '') {
      setDraft(format(value))
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      setDraft(format(value))
      return
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed))
    setDraft(format(next))
    // Commit through the handler captured at focus time. Selection may already
    // have moved to another element by the time the blur event runs.
    commitChange.current(next)
  }

  return (
    <label className="field">
      <span className={`field-label${icon ? ' label-with-icon small-icon' : ''}`}>
        {icon ? <Icon name={icon} /> : null}{label}
      </span>
      <span className="field-input">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            focused.current = true
            cancelled.current = false
            commitChange.current = onChange
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            else if (event.key === 'Escape') {
              cancelled.current = true
              setDraft(format(value))
              event.currentTarget.blur()
            }
          }}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
    </label>
  )
}

function MultiNumberField(props: {
  label: string
  values: number[]
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const { label, values, onChange, min, max, step = 1, suffix } = props
  const first = values[0]
  const same = values.length > 0 && values.every((value) => Math.abs(value - first) < 1e-6)
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={same ? Math.round(first * 100) / 100 : ''}
          placeholder="多个值"
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            if (event.target.value === '') return
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
    </label>
  )
}

function ColorField({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commitChange = useRef(onChange)
  const normalized = normalizeHex(value) ?? '#000000'
  return (
    <span className="field-input color-input">
      <input
        type="color"
        value={normalized}
        onFocus={() => {
          commitChange.current = onChange
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          commitChange.current(event.target.value)
        }}
      />
      <input
        className="hex-input"
        value={draft}
        onFocus={() => {
          commitChange.current = onChange
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = normalizeHex(draft)
          if (next) commitChange.current(next)
          else setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </span>
  )
}

const APPEAR_LABELS: Record<AnimationKind, string> = {
  fade: '淡化',
  move: '移入',
  draw: '矢量描绘',
  chart: '图表展示',
  bitmap: '位图描绘',
  unfold: '展开',
  zoom: '放大',
  spin: '旋转',
  typewriter: '打字机'
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split('')
      .map((character) => character + character)
      .join('')
      .toLowerCase()}`
  }
  return null
}

function chartToCsv(chart: ChartSpec): string {
  return [
    ['标签', ...chart.series.map((series) => series.name)].join(','),
    ...chart.labels.map((label, index) =>
      [label, ...chart.series.map((series) => series.values[index] ?? 0)].join(',')
    )
  ].join('\n')
}

function parseChartCsv(text: string, base: ChartSpec): ChartSpec {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return base
  const header = lines[0].split(',').map((cell) => cell.trim())
  const names = header.slice(1).map((name, index) => name || `系列${index + 1}`)
  const labels: string[] = []
  const columns: number[][] = names.map(() => [])
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((cell) => cell.trim())
    labels.push(cells[0] ?? '')
    names.forEach((_, index) => columns[index].push(Number(cells[index + 1]) || 0))
  }
  const colors = ['#f5a524', '#4da3ff', '#38d39f', '#ff6b6b', '#a78bfa', '#f472b6']
  return {
    ...base,
    labels,
    series: names.map((name, index) => ({
      name,
      color: base.series[index]?.color ?? colors[index % colors.length],
      values: columns[index]
    }))
  }
}

type InspectorTab = 'canvas' | 'audio' | 'element' | 'animation' | 'camera'

function elementTabInfo(element: SceneElement | null, multi: boolean): { icon: IconName; label: string } {
  if (multi) return { icon: 'atom', label: '多选' }
  if (!element) return { icon: 'atom', label: '元素' }
  const map: Partial<Record<SceneElement['kind'], { icon: IconName; label: string }>> = {
    image: { icon: 'image', label: '图片' },
    svg: { icon: 'image', label: 'SVG' },
    text: { icon: 'text', label: '文字' },
    chart: { icon: 'chart', label: '图表' },
    table: { icon: 'table', label: '表格' },
    qr: { icon: 'qrcode', label: '二维码' },
    mindmap: { icon: 'mind_map', label: '思维导图' },
    shape: { icon: 'shape', label: '图形' },
    math: { icon: 'epsilon', label: '公式' },
    molecule: { icon: 'benzene', label: '分子结构' },
    ipa: { icon: 'ipa', label: 'IPA' },
    mask: { icon: 'mask', label: '蒙版' }
  }
  return map[element.kind] ?? { icon: 'atom', label: '元素' }
}

export function Inspector({
  onPreviewFrom,
  onImportAudio
}: {
  onPreviewFrom: (id: string) => void
  onImportAudio: () => void
}) {
  const project = useEditorStore((state) => state.project)
  const assets = useEditorStore((state) => state.assets)
  const selectedId = useEditorStore((state) => state.selectedId)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const updateElement = useEditorStore((state) => state.updateElement)
  const updateElements = useEditorStore((state) => state.updateElements)
  const deleteSelected = useEditorStore((state) => state.deleteSelected)
  const removeElement = useEditorStore((state) => state.removeElement)
  const setCanvas = useEditorStore((state) => state.setCanvas)
  const setBackgroundImage = useEditorStore((state) => state.setBackgroundImage)
  const updateBackgroundImage = useEditorStore((state) => state.updateBackgroundImage)
  const clearBackgroundImage = useEditorStore((state) => state.clearBackgroundImage)
  const setEnding = useEditorStore((state) => state.setEnding)
  const updateEnding = useEditorStore((state) => state.updateEnding)
  const pinCamera = useEditorStore((state) => state.pinCamera)
  const pinCameraMany = useEditorStore((state) => state.pinCameraMany)
  const playAnimation = useEditorStore((state) => state.playAnimation)
  const stopAnimation = useEditorStore((state) => state.stopAnimation)
  const setSvgFont = useEditorStore((state) => state.setSvgFont)
  const applySvgFontToAll = useEditorStore((state) => state.applySvgFontToAll)
  const applyTextFontToAll = useEditorStore((state) => state.applyTextFontToAll)
  const animationPreview = useEditorStore((state) => state.animationPreview)
  const reorderElement = useEditorStore((state) => state.reorderElement)
  const updateAudio = useEditorStore((state) => state.updateAudio)
  const removeAudio = useEditorStore((state) => state.removeAudio)
  const updateAudio2 = useEditorStore((state) => state.updateAudio2)
  const removeAudio2 = useEditorStore((state) => state.removeAudio2)
  const showOutputFrame = useEditorStore((state) => state.showOutputFrame)
  const setShowOutputFrame = useEditorStore((state) => state.setShowOutputFrame)

  const [canvasOpen, setCanvasOpen] = useState(() => {
    try {
      return localStorage.getItem('newscribe.canvasOpen') !== '0'
    } catch {
      return true
    }
  })
  const [activeTab, setActiveTab] = useState<InspectorTab>('canvas')
  const [hex, setHex] = useState(project.canvas.background)
  const [fontDraft, setFontDraft] = useState('')
  const [svgFontDraft, setSvgFontDraft] = useState('')
  const [textColorDraft, setTextColorDraft] = useState('#1f2937')
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const textColorCommit = useRef<(patch: Partial<TextSpec>) => void>(() => {})
  const textFocusRequest = useEditorStore((state) => state.textFocusRequest)
  const [hands, setHands] = useState(loadHands)
  const [pivotHand, setPivotHand] = useState<HandConfig | null>(null)
  const inspectorRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setHex(project.canvas.background)
  }, [project.canvas.background])

  useEffect(() => {
    const root = inspectorRef.current
    if (!root) return
    let saved: Record<string, boolean> = {}
    try {
      saved = JSON.parse(localStorage.getItem('newscribe.panels') ?? '{}') as Record<string, boolean>
    } catch {
      saved = {}
    }
    const panels = Array.from(root.querySelectorAll<HTMLElement>('.panel'))
    for (const panel of panels) {
      const title = panel.querySelector<HTMLElement>(':scope > .panel-title')
      if (!title) continue
      const key = title.textContent?.trim() ?? ''
      if (key in saved) panel.classList.toggle('collapsed', !saved[key])
      else if (key.includes('画布') || key.includes('音频')) panel.classList.add('collapsed')
    }
    const onClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement
      const title = target.closest('.panel-title') as HTMLElement | null
      if (!title || !root.contains(title)) return
      const panel = title.parentElement as HTMLElement
      panel.classList.toggle('collapsed')
      try {
        const data = JSON.parse(
          localStorage.getItem('newscribe.panels') ?? '{}'
        ) as Record<string, boolean>
        data[title.textContent?.trim() ?? ''] = !panel.classList.contains('collapsed')
        localStorage.setItem('newscribe.panels', JSON.stringify(data))
      } catch {
        // 忽略
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])

  const primary = project.elements.find(
    (element) => element.id === (selectedIds[selectedIds.length - 1] ?? selectedId)
  ) ?? null
  const multi = selectedIds.length > 1
  const selected = multi ? null : primary
  const elementTab = elementTabInfo(primary, multi)
  const tabs: Array<{ id: InspectorTab; icon: IconName; label: string }> = [
    { id: 'canvas', icon: 'file', label: '画布' },
    { id: 'audio', icon: 'music-note', label: '音频' },
    { id: 'element', icon: elementTab.icon, label: elementTab.label },
    { id: 'animation', icon: 'video', label: '动画' },
    { id: 'camera', icon: 'camera-tab', label: '机位' }
  ]
  const audio = project.audio
  const audioAsset = audio ? assets[audio.assetId] : undefined
  const audio2 = project.audio2
  const audio2Asset = audio2 ? assets[audio2.assetId] : undefined
  const background = project.canvas.backgroundImage
  const backgroundAsset = background ? assets[background.assetId] : undefined
  const selectedAsset = selected ? assets[selected.assetId] : undefined
  const animatedImage =
    selected?.kind === 'image' &&
    (/^image\/(gif|webp)$/i.test(selectedAsset?.asset.mime ?? '') ||
      /\.(gif|webp)$/i.test(selectedAsset?.asset.name ?? ''))
  const canPlayAnimation = Boolean(
    selectedAsset?.animation && selectedAsset.animation.frames.length > 1
  )
  const animatedSvg = selected?.kind === 'svg' && Boolean(selectedAsset?.asset.svgAnimated)
  const svgHasText = selected?.kind === 'svg' && Boolean(selectedAsset?.asset.svgHasText)
  const availableFonts = FONT_FAMILIES.filter(isFontAvailable)
  const maskTargetMode = selected ? maskMode(selected) : 'previous'
  const multiElements = project.elements.filter((element) => selectedIds.includes(element.id))
  const multiDisappearEnabled =
    multiElements.length > 0 &&
    multiElements.every((element) => element.disappearEnabled ?? (element.disappear ?? 0) > 0)

  const replaceAudio = async (track: 1 | 2): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '替换背景音频',
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }
      ]
    })
    if (!paths[0]) return
    try {
      const runtime = await assetFromPath(paths[0])
      useEditorStore.getState().registerAsset(runtime)
      if (track === 1) updateAudio({ assetId: runtime.asset.id })
      else updateAudio2({ assetId: runtime.asset.id })
      window.dispatchEvent(
        new CustomEvent('newscribe:toast', { detail: '已替换音频' })
      )
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('newscribe:toast', {
          detail: `替换音频失败：${error instanceof Error ? error.message : String(error)}`
        })
      )
    }
  }

  const chooseBackgroundImage = async (): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '选择背景图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
    })
    if (!paths[0]) return
    try {
      const runtime = await assetFromPath(paths[0])
      setBackgroundImage(runtime)
    } catch {
      // 导入失败保持原背景
    }
  }
  const selectedHand =
    selected && selected.hand !== 'none' && !BUILTIN_HANDS.some((hand) => hand.id === selected.hand)
      ? getHandConfig(selected.hand)
      : undefined
  const selectedBuiltin = selected
    ? BUILTIN_HANDS.find((hand) => hand.id === selected.hand)
    : undefined

  const applyHandToAll = (): void => {
    if (!selected) return
    const targets = project.elements
      .filter((element) => element.appear.kind === 'draw' || element.appear.kind === 'bitmap')
      .map((element) => element.id)
    if (targets.length === 0) return
    const patch: Partial<SceneElement> = {
      hand: selected.hand ?? 'none',
      handSizeMode: selected.handSizeMode ?? 'view'
    }
    if (selected.handHeight !== undefined) patch.handHeight = selected.handHeight
    updateElements(targets, patch)
  }

  const importHand = async (): Promise<void> => {    const paths = await window.newscribe.openDialog({
      title: '导入手势图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (!paths[0]) return
    const path = paths[0]
    const extension = path.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
    const bytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
    const name = path.split(/[\\/]/).pop() ?? '自定义手势'
    const hand = addHand(name, bytesToDataUrl(bytes, mime))
    setHands(loadHands())
    if (selected) update({ hand: hand.id })
  }

  useEffect(() => {
    setFontDraft(selected?.text?.fontFamily ?? '')
    setSvgFontDraft(selected?.svgFontFamily ?? '')
    setTextColorDraft(selected?.text?.color ?? '#1f2937')
  }, [selected?.id, selected?.text?.fontFamily, selected?.text?.color, selected?.svgFontFamily])

  useEffect(() => {
    if (!selected?.text) return
    textAreaRef.current?.focus()
    textAreaRef.current?.select()
  }, [textFocusRequest, selected?.id])

  const update = (patch: Partial<SceneElement>): void => {
    if (selected) updateElement(selected.id, patch)
  }

  const updateText = (patch: Partial<TextSpec>): void => {
    if (selected?.text) update({ text: { ...selected.text, ...patch } })
  }

  const setWidth = (width: number): void => {
    if (!selected) return
    const next = Math.max(8, width)
    update({ width: next, x: selected.x - (next - selected.width) / 2 })
  }

  const setHeight = (height: number): void => {
    if (!selected) return
    const next = Math.max(8, height)
    update({ height: next, y: selected.y - (next - selected.height) / 2 })
  }

  const toggleCanvas = (): void => {
    const next = !canvasOpen
    setCanvasOpen(next)
    try {
      localStorage.setItem('newscribe.canvasOpen', next ? '1' : '0')
    } catch {
      // 忽略
    }
  }

  const commitHex = (): void => {
    const normalized = normalizeHex(hex)
    if (normalized) {
      setCanvas({ background: normalized })
      setHex(normalized)
    } else {
      setHex(project.canvas.background)
    }
  }

  const index = selected ? project.elements.findIndex((element) => element.id === selected.id) : -1
  const appearOptions: AnimationKind[] =
    selected?.kind === 'text'
      ? ['fade', 'move', 'zoom', 'spin', 'typewriter', 'bitmap', 'unfold']
      : selected?.kind === 'image'
        ? ['fade', 'move', 'zoom', 'spin', 'bitmap', 'unfold']
        : selected?.kind === 'mask'
          ? ['fade', 'move', 'zoom', 'unfold']
          : selected?.kind === 'chart' || selected?.kind === 'mindmap'
            ? ['fade', 'move', 'zoom', 'spin', 'chart', 'bitmap', 'unfold']
            : ['fade', 'move', 'zoom', 'spin', 'draw', 'bitmap', 'unfold']

  return (
    <aside className="inspector" ref={inspectorRef}>
      <div className="inspector-tabs" role="tablist">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              className={`inspector-tab ${active ? 'active' : ''}`}
              title={tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon name={tab.icon} />
              {active && <span>{tab.label}</span>}
            </button>
          )
        })}
      </div>
      {activeTab === 'canvas' && (
      <section className="panel">
        <button className="panel-head" onClick={toggleCanvas}>
          <h3 className="panel-title">画布</h3>
          <span className="panel-toggle">{canvasOpen ? '收起' : '展开'}</span>
        </button>
        {canvasOpen && (
          <>
            <div className="preset-row">
              <button className="chip" onClick={() => { setCanvas({ width: 1920, height: 1080 }); useEditorStore.getState().fitView() }}>
                横屏 16:9
              </button>
              <button className="chip" onClick={() => { setCanvas({ width: 1080, height: 1920 }); useEditorStore.getState().fitView() }}>
                竖屏 9:16
              </button>
              <button className="chip" onClick={() => { setCanvas({ width: 1080, height: 1080 }); useEditorStore.getState().fitView() }}>
                方形 1:1
              </button>
            </div>
            <div className="field-row">
              <NumberField
                label="宽"
                value={project.canvas.width}
                min={64}
                step={2}
                onChange={(width) => setCanvas({ width: Math.round(width) })}
              />
              <NumberField
                label="高"
                value={project.canvas.height}
                min={64}
                step={2}
                onChange={(height) => setCanvas({ height: Math.round(height) })}
              />
            </div>
            <label className="field">
              <span className="field-label">背景色</span>
              <span className="field-input color-input">
                <input
                  type="color"
                  value={project.canvas.background}
                  onChange={(event) => setCanvas({ background: event.target.value })}
                />
                <input
                  className="hex-input"
                  value={hex}
                  onChange={(event) => setHex(event.target.value)}
                  onBlur={commitHex}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </span>
            </label>
            {background ? (
              <div className="background-image-panel">
                <div className="field-row">
                  <span className="hint small">
                    背景图：<span data-no-translate>{backgroundAsset?.asset.name ?? '素材丢失'}</span>
                  </span>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">显示方式</span>
                    <span className="field-input">
                      <select
                        value={background.fit}
                        onChange={(event) =>
                          updateBackgroundImage({
                            fit: event.target.value === 'tile' ? 'tile' : 'stretch'
                          })
                        }
                      >
                        <option value="stretch">拉伸铺满</option>
                        <option value="tile">平铺</option>
                      </select>
                    </span>
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={background.fixed}
                    onChange={(event) => updateBackgroundImage({ fixed: event.target.checked })}
                  />
                  <span>背景固定</span>
                </label>
                <div className="field-row">
                  <button className="mini-btn" onClick={() => void chooseBackgroundImage()}>
                    更换图片
                  </button>
                  <button className="mini-btn" onClick={clearBackgroundImage}>
                    移除背景图
                  </button>
                </div>
              </div>
            ) : (
              <button className="wide-btn" onClick={() => void chooseBackgroundImage()}>
                选择背景图片
              </button>
            )}
            <label className="field">
              <span className="field-label">纸张纹理</span>
              <span className="field-input">
                <select
                  value={project.canvas.texture ?? 'none'}
                  onChange={(event) =>
                    setCanvas({ texture: event.target.value as TextureKind })
                  }
                >
                  <option value="none">无</option>
                  <option value="paper">纸张纤维</option>
                  <option value="grain">细颗粒</option>
                  <option value="canvas">帆布</option>
                  <option value="linen">亚麻布</option>
                  <option value="embossed">凹凸压纹</option>
                  <option value="leather">皮革</option>
                </select>
              </span>
            </label>
            {(project.canvas.texture ?? 'none') !== 'none' && (
              <>
                <label className="field">
                  <span className="field-label">
                    纹理强度 {Math.round((project.canvas.textureOpacity ?? 0.9) * 100)}%
                  </span>
                  <input
                    className="range-input"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((project.canvas.textureOpacity ?? 0.9) * 100)}
                    onChange={(event) =>
                      setCanvas({ textureOpacity: Number(event.target.value) / 100 })
                    }
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={project.canvas.textureFixed ?? false}
                    onChange={(event) => setCanvas({ textureFixed: event.target.checked })}
                  />
                  <span>纹理固定于画面</span>
                </label>
              </>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={showOutputFrame}
                onChange={(event) => setShowOutputFrame(event.target.checked)}
              />
              <span>显示蓝色输出框</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={project.ending?.enabled ?? false}
                onChange={(event) => setEnding(event.target.checked)}
              />
              <span>结尾展示全部元素</span>
            </label>
            {project.ending?.enabled && (
              <div className="field-row">
                <NumberField
                  label="拉远时长"
                  value={project.ending.duration}
                  min={0.1}
                  step={0.1}
                  suffix="秒"
                  onChange={(duration) => updateEnding({ duration })}
                />
                <NumberField
                  label="停留"
                  value={project.ending.hold}
                  min={0}
                  step={0.1}
                  suffix="秒"
                  onChange={(hold) => updateEnding({ hold })}
                />
              </div>
            )}
          </>
        )}
      </section>
      )}

      {activeTab === 'audio' && (
      <section className="panel">
        <h3 className="panel-title">音频</h3>
        {audio && audioAsset ? (
          <>
            <div className="audio-name-row">
              <div className="audio-name">
                音轨 1 · <span data-no-translate title={audioAsset.asset.name}>{audioAsset.asset.name}</span>
              </div>
              <button
                className="mini-btn audio-replace"
                title="替换音频"
                onClick={() => void replaceAudio(1)}
              >
                <Icon name="folder-open" />
              </button>
            </div>
            <NumberField
              label="音量"
              icon="volume"
              value={audio.volume * 100}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateAudio({ volume: Math.min(1, Math.max(0, value / 100)) })}
            />
            <div className="field-row">
              <NumberField
                label="淡入"
                value={audio.fadeIn}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(fadeIn) => updateAudio({ fadeIn })}
              />
              <NumberField
                label="淡出"
                value={audio.fadeOut}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(fadeOut) => updateAudio({ fadeOut })}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={audio.loop ?? true}
                onChange={(event) => updateAudio({ loop: event.target.checked })}
              />
              <span>循环播放</span>
            </label>
            <button className="danger-btn" onClick={removeAudio}>移除音轨 1</button>
          </>
        ) : (
          <>
            <button className="wide-btn" onClick={onImportAudio}><Icon name="music-notes" />导入背景音乐</button>
            <p className="hint small">支持 mp3 / wav / m4a / ogg，也可以直接把音频拖进窗口。</p>
          </>
        )}

        {audio2 && audio2Asset && (
          <div className="audio-track-second">
            <div className="audio-name-row">
              <div className="audio-name">
                音轨 2 · <span data-no-translate title={audio2Asset.asset.name}>{audio2Asset.asset.name}</span>
              </div>
              <button
                className="mini-btn audio-replace"
                title="替换音频"
                onClick={() => void replaceAudio(2)}
              >
                <Icon name="folder-open" />
              </button>
            </div>
            <NumberField
              label="音量"
              icon="volume"
              value={audio2.volume * 100}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateAudio2({ volume: Math.min(1, Math.max(0, value / 100)) })}
            />
            <div className="field-row">
              <NumberField
                label="淡入"
                value={audio2.fadeIn}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(fadeIn) => updateAudio2({ fadeIn })}
              />
              <NumberField
                label="淡出"
                value={audio2.fadeOut}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(fadeOut) => updateAudio2({ fadeOut })}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={audio2.loop ?? false}
                onChange={(event) => updateAudio2({ loop: event.target.checked })}
              />
              <span>循环播放</span>
            </label>
            <button className="danger-btn" onClick={removeAudio2}>移除音轨 2</button>
          </div>
        )}

        {audio && !audio2 && (
          <button className="wide-btn" onClick={onImportAudio}>添加音轨2</button>
        )}
      </section>
      )}

      {activeTab === 'element' && multi && primary && (
        <section className="panel">
          <h3 className="panel-title">已选中 {selectedIds.length} 个元素</h3>
          <div className="field-row">
            <MultiNumberField
              label="X"
              values={multiElements.map((element) => element.x)}
              step={1}
              onChange={(x) => updateElements(selectedIds, { x })}
            />
            <MultiNumberField
              label="Y"
              values={multiElements.map((element) => element.y)}
              step={1}
              onChange={(y) => updateElements(selectedIds, { y })}
            />
          </div>
          <MultiNumberField
            label="旋转"
            values={multiElements.map((element) => element.rotation)}
            step={1}
            suffix="°"
            onChange={(rotation) => updateElements(selectedIds, { rotation })}
          />
          <label className="field">
            <span className="field-label">
              透明度 {Math.round((primary.opacity ?? 1) * 100)}%
            </span>
            <input
              className="range-input"
              type="range"
              min={0}
              max={100}
              value={Math.round((primary.opacity ?? 1) * 100)}
              onChange={(event) =>
                updateElements(selectedIds, { opacity: Number(event.target.value) / 100 })
              }
            />
          </label>
          <button className="danger-btn" onClick={deleteSelected}>
            <Icon name="trash" />删除选中的 {selectedIds.length} 个元素
          </button>
          <p className="hint small">
            输入 X / Y 会把所有选中元素对齐到同一个左上角位置；旋转会把它们设成同一个角度。多选时也可以在画布上拖动，或拖选区四角整体缩放。
          </p>
        </section>
      )}

      {activeTab === 'animation' && multi && primary && (
        <>
          <section className="panel">
            <h3 className="panel-title">出现与切换</h3>
            <div className="field-row">
              <NumberField
                label="出现"
                icon="preview"
                value={primary.appear.duration}
                min={0.1}
                step={0.1}
                suffix="秒"
                onChange={(duration) =>
                  updateElements(selectedIds, {
                    appear: { ...primary.appear, duration }
                  })
                }
              />
              <NumberField
                label="暂停"
                icon="pause"
                value={primary.hold}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(hold) => updateElements(selectedIds, { hold })}
              />
            </div>
            <div className="field-row">
              <NumberField
                label="切换"
                icon="swap-horizontal"
                value={primary.transition.duration}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(duration) =>
                  updateElements(selectedIds, {
                    transition: { ...primary.transition, duration }
                  })
                }
              />
            </div>
            <p className="hint small">多选时统一修改所有选中元素的动画时长。</p>
          </section>

          <section className="panel">
            <h3 className="panel-title">消失动画</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={multiDisappearEnabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    updateElements(selectedIds, {
                      disappearEnabled: true,
                      disappear: (primary.disappear ?? 0) > 0 ? primary.disappear : 0.6
                    })
                  } else {
                    updateElements(selectedIds, { disappearEnabled: false })
                  }
                }}
              />
              <span>启用消失动画</span>
            </label>
            {multiDisappearEnabled && (
              <>
                <div className="field-row">
                  <NumberField
                    label="时长"
                    icon="close"
                    value={primary.disappear ?? 0}
                    min={0.1}
                    step={0.1}
                    suffix="秒"
                    onChange={(disappear) =>
                      updateElements(selectedIds, { disappear, disappearEnabled: true })
                    }
                  />
                  <label className="field">
                    <span className="field-label">开始时机</span>
                    <span className="field-input">
                      <select
                        value={primary.disappearAfter ?? 'hold'}
                        onChange={(event) =>
                          updateElements(selectedIds, {
                            disappearAfter: event.target.value as 'hold' | 'transition'
                          })
                        }
                      >
                        <option value="hold">暂停结束后</option>
                        <option value="transition">切换结束后</option>
                      </select>
                    </span>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">方式</span>
                    <span className="field-input">
                      <select
                        value={primary.disappearKind ?? 'fade'}
                        onChange={(event) =>
                          updateElements(selectedIds, {
                            disappearKind: event.target.value as 'fade' | 'zoom' | 'spin' | 'move'
                          })
                        }
                      >
                        <option value="fade">淡化</option>
                        <option value="zoom">缩小</option>
                        <option value="spin">旋转消失</option>
                        <option value="move">移动消失</option>
                      </select>
                    </span>
                  </label>
                  {(primary.disappearKind ?? 'fade') !== 'fade' && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={primary.disappearFadeOut ?? false}
                        onChange={(event) =>
                          updateElements(selectedIds, {
                            disappearFadeOut: event.target.checked
                          })
                        }
                      />
                      <span>同时淡出</span>
                    </label>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {activeTab === 'camera' && multi && primary && (
        <section className="panel">
          <h3 className="panel-title">机位</h3>
          <button className="wide-btn" onClick={pinCameraMany}>
            <Icon name="camera-frame" />固定为当前视角
          </button>
          <p className="hint small">把当前画布视角固定到所有选中元素上。</p>
        </section>
      )}

      {selected ? (
        <>
          {activeTab === 'element' && (
          <>
          <section className="panel">
            <h3 className="panel-title">选中元素</h3>
            <div className="field-row">
              <NumberField label="X" value={selected.x} onChange={(x) => update({ x })} />
              <NumberField label="Y" value={selected.y} onChange={(y) => update({ y })} />
            </div>
            <div className="field-row">
              <NumberField label="宽" value={selected.width} min={8} onChange={setWidth} />
              <NumberField label="高" value={selected.height} min={8} onChange={setHeight} />
            </div>
            <div className="field-row">
              <button
                className={`mini-btn ${selected.flipX ? 'active' : ''}`}
                onClick={() => update({ flipX: !selected.flipX })}
                title="水平翻转"
              >
                <Icon name="mirror" />水平翻转
              </button>
            </div>
            <div className="field-row">
              <NumberField
                label="旋转"
                value={selected.rotation}
                suffix="°"
                onChange={(rotation) => update({ rotation })}
              />
              <div className="field">
                <span className="field-label">层级</span>
                <span className="field-input layer-buttons">
                  <button
                    className="mini-btn"
                    disabled={index <= 0}
                    onClick={() => reorderElement(index, index - 1)}
                    title="下移一层"
                  >
                    ↓
                  </button>
                  <button
                    className="mini-btn"
                    disabled={index < 0 || index >= project.elements.length - 1}
                    onClick={() => reorderElement(index, index + 1)}
                    title="上移一层"
                  >
                    ↑
                  </button>
                </span>
              </div>
            </div>
            <label className="field">
              <span className="field-label">
                透明度 {Math.round((selected.opacity ?? 1) * 100)}%
              </span>
              <input
                className="range-input"
                type="range"
                min={0}
                max={100}
                value={Math.round((selected.opacity ?? 1) * 100)}
                onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
              />
            </label>
            <button className="danger-btn" onClick={() => removeElement(selected.id)}>
              删除元素
            </button>
          </section>

          {selected.kind === 'svg' && svgHasText && (
            <section className="panel">
              <h3 className="panel-title">字体</h3>
              <label className="field">
                <span className="field-label">SVG 文字字体</span>
                <span className="field-input">
                  <FontPicker
                    value={svgFontDraft}
                    availableFonts={availableFonts}
                    placeholder="使用 SVG 默认字体"
                    onChange={setSvgFontDraft}
                    onCommit={(name) => {
                      setSvgFontDraft(name)
                      setSvgFont(selected.id, name)
                    }}
                  />
                </span>
              </label>
              <button
                className="mini-btn"
                onClick={() => {
                  setSvgFontDraft('')
                  setSvgFont(selected.id, '')
                }}
              >
                使用 SVG 默认字体
              </button>
              <button
                className="mini-btn"
                onClick={() => applySvgFontToAll(svgFontDraft)}
              >
                应用到全部
              </button>
              {svgFontDraft.trim() && !isSafeFont(svgFontDraft) && (
                <p className="hint small text-warning">
                  推荐使用可商用或开源字体，以降低 SVG 字体版权风险。
                </p>
              )}
              {svgFontDraft.trim() && !isFontAvailable(svgFontDraft) && (
                <p className="hint small">当前系统未检测到该字体，将使用后备字体显示。</p>
              )}
              <p className="hint small">
                只替换 SVG 内部 text/tspan 的字体，不修改图形路径。
              </p>
            </section>
          )}

          {selected.kind === 'svg' && animatedSvg && (
            <section className="panel">
              <h3 className="panel-title">播放</h3>
              <p className="hint">该SVG文件存在声明式动画，当前版本暂不支持播放。</p>
            </section>
          )}

          {selected.kind === 'mask' && (
            <section className="panel">
              <h3 className="panel-title">蒙版</h3>
              <label className="field">
                <span className="field-label">形状</span>
                <span className="field-input">
                  <select
                    value={selected.mask?.shape ?? 'rect'}
                    onChange={(event) =>
                      update({
                        mask: {
                          ...(selected.mask ?? { shape: 'rect' }),
                          shape: event.target.value as 'rect' | 'ellipse'
                        }
                      })
                    }
                  >
                    <option value="rect">矩形</option>
                    <option value="ellipse">椭圆形</option>
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">作用于</span>
                <span className="field-input">
                  <select
                    value={maskTargetMode}
                    onChange={(event) => {
                      const mode = event.target.value as 'previous' | 'all' | 'specific'
                      const current = selected.mask ?? { shape: 'rect' as const }
                      update({
                        mask: {
                          ...current,
                          targetMode: mode,
                          targetId: mode === 'specific' ? current.targetId : undefined
                        }
                      })
                    }}
                  >
                    <option value="previous">之前全部元素</option>
                    <option value="all">全部元素</option>
                    <option value="specific">特定元素</option>
                  </select>
                </span>
              </label>
              {maskTargetMode === 'specific' && (
                <label className="field">
                  <span className="field-label">作用于元素</span>
                  <span className="field-input">
                    <select
                      value={selected.mask?.targetId ?? ''}
                      onChange={(event) =>
                        update({
                          mask: {
                            ...(selected.mask ?? { shape: 'rect', targetMode: 'specific' }),
                            targetMode: 'specific',
                            targetId: event.target.value || undefined
                          }
                        })
                      }
                    >
                      <option value="">请选择元素</option>
                      {project.elements
                        .filter((element) => element.id !== selected.id && element.kind !== 'mask')
                        .map((element, index) => {
                          const label =
                            element.kind === 'text'
                              ? element.text?.content.trim().slice(0, 16) || `文字 ${index + 1}`
                              : element.kind === 'image' || element.kind === 'svg'
                                ? assets[element.assetId]?.asset.name ?? `素材 ${index + 1}`
                                : `${element.kind} ${index + 1}`
                          return (
                            <option key={element.id} value={element.id}>
                              {label}
                            </option>
                          )
                        })}
                    </select>
                  </span>
                </label>
              )}
              <p className="hint small">
                默认只挖掉蒙版之前的元素，蒙版之后新增的内容会正常显示。编辑时显示虚线框，预览和导出中不显示边框。
              </p>
            </section>
          )}

          {selected.kind === 'image' && animatedImage && (
            <section className="panel">
              <h3 className="panel-title">播放</h3>
              {!canPlayAnimation && (
                <p className="hint small">
                  这个 GIF / WebP 是单帧图片，没有可播放的动画。
                </p>
              )}
              <label className="field">
                <span className="field-label">播放行为</span>
                <span className="field-input">
                  <select
                    disabled={!canPlayAnimation}
                    value={selected.imagePlayback ?? 'once'}
                    onChange={(event) =>
                      update({ imagePlayback: event.target.value as 'once' | 'loop' | 'first' | 'last' })
                    }
                  >
                    <option value="once">播放一次动画</option>
                    <option value="loop">循环播放动画</option>
                    <option value="first">固定到首帧</option>
                    <option value="last">固定到尾帧</option>
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">开始时间</span>
                <span className="field-input">
                  <select
                    disabled={!canPlayAnimation}
                    value={selected.imagePlayStart ?? 'after-appear'}
                    onChange={(event) =>
                      update({ imagePlayStart: event.target.value as 'after-appear' | 'with-appear' })
                    }
                  >
                    <option value="after-appear">出现后开始</option>
                    <option value="with-appear">出现时开始</option>
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">结束时间</span>
                <span className="field-input">
                  <select
                    disabled={!canPlayAnimation}
                    value={selected.imagePlayEnd ?? 'transition-start'}
                    onChange={(event) =>
                      update({ imagePlayEnd: event.target.value as 'transition-start' | 'transition-end' | 'continue' })
                    }
                  >
                    <option value="transition-start">切换时结束</option>
                    <option value="transition-end">切换后结束</option>
                    <option value="continue">持续播放</option>
                  </select>
                </span>
              </label>
              <button
                className="wide-btn"
                disabled={!canPlayAnimation}
                onClick={() => {
                  if (animationPreview?.elementId === selected.id) stopAnimation()
                  else playAnimation(selected.id)
                }}
              >
                <Icon name={animationPreview?.elementId === selected.id ? 'pause' : 'video'} />
                {animationPreview?.elementId === selected.id ? '停止播放' : '播放'}
              </button>
              <p className="hint small">编辑时默认停在首帧，点击播放才会在此处预览动画。</p>
            </section>
          )}

          {selected.kind === 'ipa' && (() => {
            const ipa: IpaSpec = selected.ipa ?? defaultIpa()
            const templates: Array<[string, string]> = [
              ['hello', '"h@loU'],
              ['world', '"w3:ld'],
              ['think', '"TINk'],
              ['water', '"wO:t@']
            ]
            let converted = ''
            try {
              converted = xsampaToIpa(ipa.xsampa)
            } catch {
              converted = ''
            }
            return (
              <section className="panel">
                <h3 className="panel-title">IPA</h3>
                <label className="field">
                  <span className="field-label">X-SAMPA</span>
                  <span className="field-input">
                    <textarea
                      value={ipa.xsampa}
                      rows={3}
                      spellCheck={false}
                      onChange={(event) => update({ ipa: { ...ipa, xsampa: event.target.value } })}
                    />
                  </span>
                </label>
                <div className="ipa-preview">{converted || '—'}</div>
                <div className="shape-tool-row">
                  {templates.map(([label, value]) => (
                    <button key={label} className="mini-btn" onClick={() => update({ ipa: { ...ipa, xsampa: value } })}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <NumberField label="字号" value={ipa.fontSize} min={1} max={160} step={1} onChange={(value) => update({ ipa: { ...ipa, fontSize: Math.max(1, value) } })} />
                  <label className="field">
                    <span className="field-label">颜色</span>
                    <ColorField value={ipa.color} onChange={(color) => update({ ipa: { ...ipa, color } })} />
                  </label>
                </div>
                <p className="hint small">使用 X-SAMPA 输入，自动转换为 IPA，并使用 Noto Sans 显示音标。</p>
              </section>
            )
          })()}

          {selected.kind === 'molecule' && (() => {
            const molecule: MoleculeSpec = selected.molecule ?? defaultMolecule()
            const templates: Array<[string, string]> = [
              ['苯环', 'c1ccccc1'],
              ['乙醇', 'CCO'],
              ['咖啡因', 'Cn1c(=O)c2c(ncn2C)n(C)c1=O'],
              ['阿司匹林', 'CC(=O)Oc1ccccc1C(=O)O']
            ]
            return (
              <section className="panel">
                <h3 className="panel-title">分子结构</h3>
                <label className="field">
                  <span className="field-label">SMILES</span>
                  <span className="field-input">
                    <textarea
                      value={molecule.smiles}
                      rows={4}
                      spellCheck={false}
                      onChange={(event) => update({ molecule: { ...molecule, smiles: event.target.value } })}
                    />
                  </span>
                </label>
                <div className="shape-tool-row">
                  {templates.map(([label, smiles]) => (
                    <button key={label} className="mini-btn" onClick={() => update({ molecule: { ...molecule, smiles } })}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">颜色</span>
                    <ColorField value={molecule.color} onChange={(color) => update({ molecule: { ...molecule, color } })} />
                  </label>
                  <NumberField
                    label="键线粗细"
                    value={molecule.strokeWidth ?? 3}
                    min={1}
                    max={12}
                    step={0.5}
                    onChange={(value) => update({ molecule: { ...molecule, strokeWidth: value } })}
                  />
                </div>
                <p className="hint small">使用 RDKit 在本地生成结构图；支持 SMILES 和常见有机分子。</p>
              </section>
            )
          })()}

          {selected.kind === 'math' && (() => {
            const math: MathSpec = selected.math ?? defaultMath()
            const templates: Array<[string, string]> = [
              ['分数', '\\frac{a}{b}'],
              ['根号', '\\sqrt{x}'],
              ['上下标', 'x^{2} + y_{1}'],
              ['求和', '\\sum_{i=1}^{n} a_i'],
              ['积分', '\\int_{a}^{b} f(x)\\,dx'],
              ['化学式', '\\ce{2H2 + O2 -> 2H2O}']
            ]
            return (
              <section className="panel">
                <h3 className="panel-title">公式</h3>
                <label className="field">
                  <span className="field-label">LaTeX / mhchem</span>
                  <span className="field-input">
                    <textarea
                      value={math.latex}
                      rows={4}
                      spellCheck={false}
                      onChange={(event) => update({ math: { ...math, latex: event.target.value } })}
                    />
                  </span>
                </label>
                <div className="shape-tool-row">
                  {templates.map(([label, latex]) => (
                    <button key={label} className="mini-btn" onClick={() => update({ math: { ...math, latex } })}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">颜色</span>
                    <ColorField value={math.color} onChange={(color) => update({ math: { ...math, color } })} />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={math.displayMode}
                      onChange={(event) => update({ math: { ...math, displayMode: event.target.checked } })}
                    />
                    <span>独立公式</span>
                  </label>
                </div>
                <p className="hint small">化学公式使用 mhchem，例如 <code>{'\\ce{H2O}'}</code>；物理公式可直接使用 LaTeX。</p>
              </section>
            )
          })()}

          {selected.kind === 'shape' && (() => {
            const shape: ShapeSpec = selected.shape ?? {
              kind: 'freeform',
              points: [],
              closed: true,
              strokeEnabled: true,
              stroke: '#2b2f3a',
              strokeWidth: 5,
              strokeStyle: 'solid',
              fillEnabled: true,
              fill: '#f5c45a'
            }
            return (
              <section className="panel">
                <h3 className="panel-title">图形</h3>
                <button className="mini-btn" onClick={() => useEditorStore.getState().openShapeEditor(selected.id)}>
                  <Icon name="pencil" />编辑图形…
                </button>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">描边</span>
                    <ColorField value={shape.stroke} onChange={(stroke) => update({ shape: { ...shape, stroke } })} />
                  </label>
                  <label className="field">
                    <span className="field-label">填充</span>
                    <ColorField value={shape.fill} onChange={(fill) => update({ shape: { ...shape, fill } })} />
                  </label>
                </div>
                <div className="field-row">
                  <NumberField label="描边粗细" value={shape.strokeWidth} min={0} max={40} step={1} onChange={(value) => update({ shape: { ...shape, strokeWidth: value } })} />
                  <label className="field">
                    <span className="field-label">线型</span>
                    <span className="field-input">
                      <select value={shape.strokeStyle} onChange={(event) => update({ shape: { ...shape, strokeStyle: event.target.value as ShapeSpec['strokeStyle'] } })}>
                        <option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option>
                      </select>
                    </span>
                  </label>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={shape.strokeEnabled} onChange={(event) => update({ shape: { ...shape, strokeEnabled: event.target.checked } })} />
                  <span>显示描边</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={shape.fillEnabled} onChange={(event) => update({ shape: { ...shape, fillEnabled: event.target.checked } })} />
                  <span>显示填充</span>
                </label>
              </section>
            )
          })()}

          {selected.kind === 'mindmap' && (() => {
            const mindmap: MindMapSpec = selected.mindmap ?? defaultMindMap()
            const updateMindMap = (patch: Partial<MindMapSpec>): void =>
              update({ mindmap: { ...mindmap, ...patch } })
            return (
              <section className="panel">
                <h3 className="panel-title">思维导图</h3>
                <label className="field">
                  <span className="field-label">大纲</span>
                  <span className="field-input">
                    <textarea
                      value={mindmap.outline}
                      rows={8}
                      placeholder={'中心主题\n  分支一\n    子主题'}
                      onChange={(event) => updateMindMap({ outline: event.target.value })}
                    />
                  </span>
                </label>
                <p className="hint small">每缩进两个空格代表下一级节点。</p>
                <div className="field-row">
                  <NumberField
                    label="字号"
                    value={mindmap.fontSize}
                    min={1}
                    max={120}
                    step={1}
                    onChange={(value) => updateMindMap({ fontSize: Math.max(1, value) })}
                  />
                  <NumberField
                    label="内边距"
                    value={mindmap.nodePadding}
                    min={2}
                    max={40}
                    step={1}
                    onChange={(value) => updateMindMap({ nodePadding: value })}
                  />
                </div>
                <div className="field-row">
                  <NumberField
                    label="横向间距"
                    value={mindmap.gapX}
                    min={10}
                    max={160}
                    step={2}
                    onChange={(value) => updateMindMap({ gapX: value })}
                  />
                  <NumberField
                    label="纵向间距"
                    value={mindmap.gapY}
                    min={4}
                    max={100}
                    step={2}
                    onChange={(value) => updateMindMap({ gapY: value })}
                  />
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">节点填充</span>
                    <span className="field-input">
                      <ColorField value={mindmap.nodeFill} onChange={(nodeFill) => updateMindMap({ nodeFill })} />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">节点描边</span>
                    <span className="field-input">
                      <ColorField value={mindmap.nodeBorder} onChange={(nodeBorder) => updateMindMap({ nodeBorder })} />
                    </span>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">文字颜色</span>
                    <span className="field-input">
                      <ColorField value={mindmap.nodeText} onChange={(nodeText) => updateMindMap({ nodeText })} />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">连线颜色</span>
                    <span className="field-input">
                      <ColorField value={mindmap.connector} onChange={(connector) => updateMindMap({ connector })} />
                    </span>
                  </label>
                </div>
              </section>
            )
          })()}

          {selected.kind === 'table' && (() => {
            const table: TableSpec = selected.table ?? defaultTable()
            const columns = Math.max(1, ...table.rows.map((row) => row.length))
            const updateTable = (patch: Partial<TableSpec>): void =>
              update({ table: { ...table, ...patch } })
            const setCell = (row: number, col: number, value: string): void => {
              const rows = table.rows.map((line, rowIndex) =>
                rowIndex === row
                  ? Array.from({ length: columns }, (_, colIndex) => line[colIndex] ?? '').map(
                      (cell, colIndex) => (colIndex === col ? value : cell)
                    )
                  : line
              )
              updateTable({ rows })
            }
            return (
              <section className="panel">
                <h3 className="panel-title">表格</h3>
                <div className="field-row table-title-row">
                  <label className="field">
                    <span className="field-label">标题</span>
                    <span className="field-input">
                      <input value={table.title} onChange={(event) => updateTable({ title: event.target.value })} />
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={table.showTitle}
                      onChange={(event) => updateTable({ showTitle: event.target.checked })}
                    />
                    <span>显示标题</span>
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={table.headerRow}
                    onChange={(event) => updateTable({ headerRow: event.target.checked })}
                  />
                  <span>首行作为表头</span>
                </label>
                <div className="table-editor" style={{ gridTemplateColumns: `repeat(${columns}, minmax(56px, 1fr))` }}>
                  {table.rows.map((row, rowIndex) =>
                    Array.from({ length: columns }, (_, colIndex) => (
                      <input
                        key={`${rowIndex}-${colIndex}`}
                        className="table-cell-input"
                        value={row[colIndex] ?? ''}
                        placeholder={colIndex === 0 && rowIndex === 0 ? '表头' : ''}
                        onChange={(event) => setCell(rowIndex, colIndex, event.target.value)}
                      />
                    ))
                  )}
                </div>
                <div className="field-row table-editor-actions">
                  <button className="mini-btn" onClick={() => updateTable({ rows: [...table.rows, Array(columns).fill('')] })}>+ 行</button>
                  <button className="mini-btn" onClick={() => updateTable({ rows: table.rows.map((row) => [...row, '']) })}>+ 列</button>
                  <button className="mini-btn" disabled={table.rows.length <= 1} onClick={() => updateTable({ rows: table.rows.slice(0, -1) })}>- 行</button>
                  <button className="mini-btn" disabled={columns <= 1} onClick={() => updateTable({ rows: table.rows.map((row) => row.slice(0, -1)) })}>- 列</button>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">字体</span>
                    <span className="field-input">
                      <select value={table.fontFamily} onChange={(event) => updateTable({ fontFamily: event.target.value })}>
                        {FONT_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
                      </select>
                    </span>
                  </label>
                  <NumberField label="字号" value={table.fontSize} min={1} max={120} step={1} onChange={(value) => updateTable({ fontSize: Math.max(1, value) })} />
                </div>
                <div className="field-row">
                  <NumberField label="边框" value={table.borderWidth} min={0} max={12} step={0.5} onChange={(value) => updateTable({ borderWidth: value })} />
                  <NumberField label="内边距" value={table.cellPadding} min={0} max={40} step={1} onChange={(value) => updateTable({ cellPadding: value })} />
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">对齐</span>
                    <span className="field-input">
                      <select value={table.align} onChange={(event) => updateTable({ align: event.target.value as TableSpec['align'] })}>
                        <option value="left">左对齐</option>
                        <option value="center">居中</option>
                        <option value="right">右对齐</option>
                      </select>
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">边框色</span>
                    <span className="field-input">
                      <ColorField value={table.borderColor} onChange={(borderColor) => updateTable({ borderColor })} />
                    </span>
                  </label>
                </div>
              </section>
            )
          })()}

          {selected.kind === 'qr' && (() => {
            const qr: QrSpec = selected.qr ?? defaultQr()
            return (
              <section className="panel">
                <h3 className="panel-title">二维码</h3>
                <label className="field">
                  <span className="field-label">内容</span>
                  <span className="field-input">
                    <textarea
                      value={qr.content}
                      rows={3}
                      placeholder="网址或文字"
                      onChange={(event) => {
                        try {
                          update({ qr: { ...qr, content: event.target.value } })
                        } catch {
                          // 内容过长时保持当前值
                        }
                      }}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">容错级别</span>
                  <span className="field-input">
                    <select
                      value={qr.errorCorrection}
                      onChange={(event) =>
                        update({ qr: { ...qr, errorCorrection: event.target.value as QrSpec['errorCorrection'] } })
                      }
                    >
                      <option value="L">L · 7%</option>
                      <option value="M">M · 15%</option>
                      <option value="Q">Q · 25%</option>
                      <option value="H">H · 30%</option>
                    </select>
                  </span>
                </label>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">前景色</span>
                    <span className="field-input">
                      <ColorField value={qr.foreground} onChange={(foreground) => update({ qr: { ...qr, foreground } })} />
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">背景色</span>
                    <span className="field-input">
                      <ColorField value={qr.background} onChange={(background) => update({ qr: { ...qr, background } })} />
                    </span>
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={qr.transparentBackground ?? false}
                    onChange={(event) => update({ qr: { ...qr, transparentBackground: event.target.checked } })}
                  />
                  <span>透明背景</span>
                </label>
                <NumberField
                  label="留白边距"
                  value={qr.margin}
                  min={0}
                  max={16}
                  step={1}
                  onChange={(value) => update({ qr: { ...qr, margin: Math.max(0, Math.min(16, value)) } })}
                />
              </section>
            )
          })()}

          {selected.kind === 'chart' && (() => {
            const chart = selected.chart ?? defaultChart()
            return (
              <section className="panel">
                <h3 className="panel-title">图表</h3>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">类型</span>
                    <span className="field-input">
                      <select
                        value={chart.kind}
                        onChange={(event) =>
                          update({ chart: { ...chart, kind: event.target.value as ChartSpec['kind'] } })
                        }
                      >
                        <option value="line">折线图</option>
                        <option value="bar">条形图</option>
                        <option value="pie">饼图</option>
                      </select>
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">标题</span>
                    <span className="field-input">
                      <input
                        value={chart.title}
                        onChange={(event) => update({ chart: { ...chart, title: event.target.value } })}
                      />
                    </span>
                  </label>
                </div>
                <div className="chart-checks">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={chart.showLegend}
                      onChange={(event) =>
                        update({ chart: { ...chart, showLegend: event.target.checked } })
                      }
                    />
                    <span>图例</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={chart.showValues}
                      onChange={(event) =>
                        update({ chart: { ...chart, showValues: event.target.checked } })
                      }
                    />
                    <span>数值</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={chart.showAxis}
                      onChange={(event) =>
                        update({ chart: { ...chart, showAxis: event.target.checked } })
                      }
                    />
                    <span>坐标轴</span>
                  </label>
                </div>
                <div className="field">
                  <span className="field-label">数据</span>
                  <div className="chart-table">
                    <div className="chart-table-row chart-table-head">
                      <span className="chart-cell chart-cell-label">标签</span>
                      {chart.series.map((series, seriesIndex) => (
                        <span className="chart-cell" key={`head-${seriesIndex}`}>
                          <input
                            className="chart-name"
                            value={series.name}
                            onChange={(event) => {
                              const next = chart.series.map((item, index) =>
                                index === seriesIndex ? { ...item, name: event.target.value } : item
                              )
                              update({ chart: { ...chart, series: next } })
                            }}
                          />
                          <input
                            type="color"
                            value={series.color}
                            onChange={(event) => {
                              const next = chart.series.map((item, index) =>
                                index === seriesIndex ? { ...item, color: event.target.value } : item
                              )
                              update({ chart: { ...chart, series: next } })
                            }}
                          />
                        </span>
                      ))}
                      <button
                        className="mini-btn"
                        onClick={() =>
                          update({
                            chart: {
                              ...chart,
                              series: [
                                ...chart.series,
                                {
                                  name: `系列${chart.series.length + 1}`,
                                  color: ['#f5a524', '#4da3ff', '#38d39f', '#ff6b6b'][
                                    chart.series.length % 4
                                  ],
                                  values: chart.labels.map(() => 0)
                                }
                              ]
                            }
                          })
                        }
                      >
                        +系列
                      </button>
                    </div>
                    {chart.labels.map((label, rowIndex) => (
                      <div className="chart-table-row" key={`row-${rowIndex}`}>
                        <input
                          className="chart-cell chart-label-input"
                          value={label}
                          onChange={(event) => {
                            const labels = [...chart.labels]
                            labels[rowIndex] = event.target.value
                            update({ chart: { ...chart, labels } })
                          }}
                        />
                        {chart.series.map((series, seriesIndex) => (
                          <input
                            key={`value-${seriesIndex}`}
                            className="chart-cell chart-number"
                            type="number"
                            value={series.values[rowIndex] ?? 0}
                            onChange={(event) => {
                              const next = chart.series.map((item, index) =>
                                index === seriesIndex
                                  ? {
                                      ...item,
                                      values: item.values.map((value, valueIndex) =>
                                        valueIndex === rowIndex ? Number(event.target.value) : value
                                      )
                                    }
                                  : item
                              )
                              update({ chart: { ...chart, series: next } })
                            }}
                          />
                        ))}
                        <button
                          className="mini-btn"
                          onClick={() =>
                            update({
                              chart: {
                                ...chart,
                                labels: chart.labels.filter((_, index) => index !== rowIndex),
                                series: chart.series.map((item) => ({
                                  ...item,
                                  values: item.values.filter((_, index) => index !== rowIndex)
                                }))
                              }
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="mini-btn"
                      onClick={() =>
                        update({
                          chart: {
                            ...chart,
                            labels: [...chart.labels, `标签${chart.labels.length + 1}`],
                            series: chart.series.map((item) => ({
                              ...item,
                              values: [...item.values, 0]
                            }))
                          }
                        })
                      }
                    >
                      +行
                    </button>
                  </div>
                </div>
                <p className="hint small">
                  折线/条形图支持多系列；饼图只使用第一个系列的数据。
                </p>
              </section>
            )
          })()}

          {selected.kind === 'text' && selected.text && (
            <section className="panel">
              <h3 className="panel-title">文字</h3>
              <textarea
                ref={textAreaRef}
                className="text-area"
                rows={4}
                value={selected.text.content}
                onChange={(event) => updateText({ content: event.target.value })}
              />
              <label className="field">
                <span className="field-label">字体</span>
                <span className="field-input">
                  <FontPicker
                    value={fontDraft}
                    availableFonts={availableFonts}
                    placeholder="输入或选择字体"
                    onChange={setFontDraft}
                    onCommit={(name) => {
                      if (!name) {
                        setFontDraft(selected.text?.fontFamily ?? '')
                        return
                      }
                      if (!isFontAvailable(name)) {
                        window.alert(`系统里没有找到字体「${name}」，请换一个或先安装它。`)
                        setFontDraft(selected.text?.fontFamily ?? '')
                        return
                      }
                      setFontDraft(name)
                      updateText({ fontFamily: name })
                    }}
                  />
                </span>
              </label>
              <button
                className="mini-btn"
                disabled={!fontDraft.trim()}
                onClick={() => applyTextFontToAll(fontDraft)}
              >
                应用到全部文字
              </button>
              <div className="field-row">
                <NumberField
                  label="字号"
                  value={selected.text.fontSize}
                  min={1}
                  step={2}
                  onChange={(fontSize) => updateText({ fontSize: Math.max(1, fontSize) })}
                />
                <label className="field">
                  <span className="field-label">颜色</span>
                  <span className="field-input color-input">
                    <input
                      type="color"
                      value={selected.text.color}
                      onChange={(event) => updateText({ color: event.target.value })}
                    />
                    <input
                      className="hex-input"
                      value={textColorDraft}
                      onFocus={() => {
                        textColorCommit.current = updateText
                      }}
                      onChange={(event) => setTextColorDraft(event.target.value)}
                      onBlur={() => {
                        const normalized = normalizeHex(textColorDraft)
                        if (normalized) textColorCommit.current({ color: normalized })
                        else setTextColorDraft(selected.text?.color ?? '#1f2937')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                    />
                  </span>
                </label>
              </div>
              <div className="toggle-row">
                <button
                  className={`toggle ${selected.text.bold ? 'active' : ''}`}
                  onClick={() => updateText({ bold: !selected.text?.bold })}
                  title="加粗"
                >
                  B
                </button>
                <button
                  className={`toggle italic ${selected.text.italic ? 'active' : ''}`}
                  onClick={() => updateText({ italic: !selected.text?.italic })}
                  title="斜体"
                >
                  I
                </button>
                <button
                  className={`toggle underline ${selected.text.underline ? 'active' : ''}`}
                  onClick={() => updateText({ underline: !selected.text?.underline })}
                  title="下划线"
                >
                  U
                </button>
                <button
                  className={`toggle strike ${selected.text.strikethrough ? 'active' : ''}`}
                  onClick={() => updateText({ strikethrough: !selected.text?.strikethrough })}
                  title="删除线"
                >
                  S
                </button>
                <span className="toggle-gap" />
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    className={`toggle ${selected.text?.align === align ? 'active' : ''}`}
                    onClick={() => updateText({ align })}
                    title={align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}
                  >
                    {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
                  </button>
                ))}
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selected.text.vertical ?? false}
                  onChange={(event) => updateText({ vertical: event.target.checked })}
                />
                <span>竖排</span>
              </label>
            </section>
          )}
          </>
          )}

          {activeTab === 'animation' && (
          <>
          <section className="panel">
            <h3 className="panel-title">出现动画</h3>
            <label className="field">
              <span className="field-label">方式</span>
              <span className="field-input">
                <select
                  value={
                    selected.kind === 'image'
                      ? selected.appear.kind === 'draw'
                        ? 'bitmap'
                        : selected.appear.kind
                      : selected.kind === 'chart' || selected.kind === 'mindmap'
                        ? selected.appear.kind === 'draw'
                          ? 'chart'
                          : selected.appear.kind
                        : selected.appear.kind
                  }
                  onChange={(event) =>
                    update({
                      appear: { ...selected.appear, kind: event.target.value as AnimationKind }
                    })
                  }
                >
                  {appearOptions.map((kind) => (
                    <option key={kind} value={kind}>
                      {APPEAR_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {selected.appear.kind !== 'fade' && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={selected.appear.fadeIn ?? false}
                  onChange={(event) =>
                    update({ appear: { ...selected.appear, fadeIn: event.target.checked } })
                  }
                />
                <span>同时淡入</span>
              </label>
            )}
            {selected.appear.kind === 'bitmap' && (
              <NumberField
                label="描绘角度"
                value={selected.appear.bitmapAngle ?? 0}
                min={0}
                max={360}
                step={5}
                suffix="°"
                onChange={(value) =>
                  update({ appear: { ...selected.appear, bitmapAngle: value } })
                }
              />
            )}
            {(selected.appear.kind === 'draw' || selected.appear.kind === 'bitmap') && (
              <>
                <div className="field">
                  <span className="field-label label-with-icon"><Icon name="hand" />手势</span>
                  <span className="field-input">
                    <select
                      value={selected.hand ?? 'none'}
                      onChange={(event) => update({ hand: event.target.value })}
                    >
                      <option value="none">空白手势</option>
                      {BUILTIN_HANDS.map((hand) => (
                        <option key={hand.id} value={hand.id}>{hand.name}</option>
                      ))}
                      {hands.map((hand) => (
                        <option key={hand.id} value={hand.id}>{hand.name}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <label className="field">
                  <span className="field-label">手势大小</span>
                  <span className="field-input">
                    <select
                      value={selected.handSizeMode ?? 'view'}
                      disabled={(selected.hand ?? 'none') === 'none'}
                      onChange={(event) =>
                        update({ handSizeMode: event.target.value as 'view' | 'screen' })
                      }
                    >
                      <option value="view">随镜头缩放</option>
                      <option value="screen">固定屏幕大小</option>
                    </select>
                  </span>
                </label>
                {selected.appear.kind === 'draw' && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={selected.strokeOnly ?? false}
                      onChange={(event) => update({ strokeOnly: event.target.checked })}
                    />
                    <span>只描边</span>
                  </label>
                )}
                <button className="mini-btn" onClick={() => void importHand()}>
                  导入手势图片…
                </button>
                <button
                  className="mini-btn"
                  disabled={!project.elements.some((element) => element.appear.kind === 'draw' || element.appear.kind === 'bitmap')}
                  onClick={applyHandToAll}
                >
                  应用到全部
                </button>
                {selectedBuiltin && (
                  <NumberField
                    label="手势高度"
                    value={selected.handHeight ?? selectedBuiltin.height}
                    min={20}
                    step={5}
                    suffix="px"
                    onChange={(value) => update({ handHeight: Math.max(20, value) })}
                  />
                )}
                {selectedHand && (
                  <>
                    <div className="field-row">
                      <NumberField
                        label="笔尖 X"
                        value={selectedHand.pivotX}
                        min={0}
                        step={1}
                        onChange={(value) => {
                          updateHand(selectedHand.id, { pivotX: value })
                          setHands(loadHands())
                        }}
                      />
                      <NumberField
                        label="笔尖 Y"
                        value={selectedHand.pivotY}
                        min={0}
                        step={1}
                        onChange={(value) => {
                          updateHand(selectedHand.id, { pivotY: value })
                          setHands(loadHands())
                        }}
                      />
                    </div>
                    <NumberField
                      label="手势高度"
                      value={selectedHand.height}
                      min={20}
                      step={5}
                      suffix="px"
                      onChange={(value) => {
                        updateHand(selectedHand.id, { height: Math.max(20, value) })
                        setHands(loadHands())
                      }}
                    />
                    <p className="hint small">笔尖 X/Y 是手势图片左上角到笔尖的像素距离。</p>
                    <button className="mini-btn" onClick={() => setPivotHand(selectedHand)}>
                      可视化取点…
                    </button>
                    {pivotHand && (
                      <HandPivotDialog
                        hand={pivotHand}
                        onClose={() => setPivotHand(null)}
                        onSave={(pivotX, pivotY) => {
                          updateHand(pivotHand.id, { pivotX, pivotY })
                          setHands(loadHands())
                          setPivotHand(null)
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
            {selected.appear.kind === 'move' && (
              <label className="field">
                <span className="field-label">方向</span>
                <span className="field-input">
                  <select
                    value={selected.appear.direction ?? 'left'}
                    onChange={(event) =>
                      update({
                        appear: {
                          ...selected.appear,
                          direction: event.target.value as 'left' | 'right' | 'top' | 'bottom'
                        }
                      })
                    }
                  >
                    <option value="left">从左</option>
                    <option value="right">从右</option>
                    <option value="top">从上</option>
                    <option value="bottom">从下</option>
                  </select>
                </span>
              </label>
            )}
            <div className="field-row">
              <NumberField
                label="时长"
                icon="preview"
                value={selected.appear.duration}
                min={0.1}
                step={0.1}
                suffix="秒"
                onChange={(duration) => update({ appear: { ...selected.appear, duration } })}
              />
              <NumberField
                label="暂停"
                icon="pause"
                value={selected.hold}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(hold) => update({ hold })}
              />
            </div>
            <div className="field-row">
              <NumberField
                label="切换"
                icon="swap-horizontal"
                value={selected.transition.duration}
                min={0}
                step={0.1}
                suffix="秒"
                onChange={(duration) => update({ transition: { ...selected.transition, duration } })}
              />
            </div>
            <p className="hint small">「切换」是移动到下一个元素机位的时间。</p>
          </section>

          <section className="panel">
            <h3 className="panel-title">消失动画</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selected.disappearEnabled ?? (selected.disappear ?? 0) > 0}
                onChange={(event) => {
                  if (event.target.checked) {
                    update({
                      disappearEnabled: true,
                      disappear: (selected.disappear ?? 0) > 0 ? selected.disappear : 0.6
                    })
                  } else {
                    update({ disappearEnabled: false })
                  }
                }}
              />
              <span>启用消失动画</span>
            </label>
            {(selected.disappearEnabled ?? (selected.disappear ?? 0) > 0) && (
              <>
                <div className="field-row">
                  <NumberField
                    label="时长"
                    icon="close"
                    value={selected.disappear ?? 0}
                    min={0.1}
                    step={0.1}
                    suffix="秒"
                    onChange={(disappear) => update({ disappear, disappearEnabled: true })}
                  />
                  <label className="field">
                    <span className="field-label">开始时机</span>
                    <span className="field-input">
                      <select
                        value={selected.disappearAfter ?? 'hold'}
                        onChange={(event) =>
                          update({ disappearAfter: event.target.value as 'hold' | 'transition' })
                        }
                      >
                        <option value="hold">暂停结束后</option>
                        <option value="transition">切换结束后</option>
                      </select>
                    </span>
                  </label>
                </div>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">方式</span>
                    <span className="field-input">
                      <select
                        value={selected.disappearKind ?? 'fade'}
                        onChange={(event) =>
                          update({ disappearKind: event.target.value as 'fade' | 'zoom' | 'spin' | 'move' })
                        }
                      >
                        <option value="fade">淡化</option>
                        <option value="zoom">缩小</option>
                        {selected.kind !== 'mask' && <option value="spin">旋转消失</option>}
                        <option value="move">移动消失</option>
                      </select>
                    </span>
                  </label>
                  {(selected.disappearKind ?? 'fade') === 'move' && (
                    <label className="field">
                      <span className="field-label">方向</span>
                      <span className="field-input">
                        <select
                          value={selected.disappearDirection ?? 'top'}
                          onChange={(event) =>
                            update({ disappearDirection: event.target.value as 'left' | 'right' | 'top' | 'bottom' })
                          }
                        >
                          <option value="left">向左</option>
                          <option value="right">向右</option>
                          <option value="top">向上</option>
                          <option value="bottom">向下</option>
                        </select>
                      </span>
                    </label>
                  )}
                </div>
                {(selected.disappearKind ?? 'fade') !== 'fade' && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={selected.disappearFadeOut ?? false}
                      onChange={(event) => update({ disappearFadeOut: event.target.checked })}
                    />
                    <span>同时淡出</span>
                  </label>
                )}
              </>
            )}
          </section>
          </>
          )}

          {activeTab === 'camera' && (
          <section className="panel">
            <h3 className="panel-title">机位</h3>
            <p className="hint">
              当前缩放 {(selected.camera.zoom * 100).toFixed(0)}% · 中心 {Math.round(selected.camera.x)},
              {Math.round(selected.camera.y)}
            </p>
            <button className="wide-btn" onClick={() => pinCamera(selected.id)}>
              <Icon name="camera-frame" />固定为当前视角
            </button>
            <button className="wide-btn ghost" onClick={() => onPreviewFrom(selected.id)}>
              <Icon name="eye" />从该元素开始预览
            </button>
            <p className="hint small">调整好画布的缩放和位置后点这里，播放时镜头会停在这个视角。</p>
          </section>
          )}
        </>
      ) : !multi && activeTab === 'element' ? (
        <section className="panel">
          <h3 className="panel-title">空画布</h3>
          <p className="hint">
            把图片、SVG 或音频拖进窗口，或者点顶部的「导入素材」「文字」。<br />
            拖动画布空白处可以平移，滚轮缩放。
          </p>
        </section>
      ) : null}
      {!selected && activeTab !== 'canvas' && activeTab !== 'audio' && activeTab !== 'element' && (
        <section className="panel">
          <h3 className="panel-title">{tabs.find((tab) => tab.id === activeTab)?.label}</h3>
          <p className="hint">请先选择一个元素，再调整这个标签页的内容。</p>
        </section>
      )}
    </aside>
  )
}

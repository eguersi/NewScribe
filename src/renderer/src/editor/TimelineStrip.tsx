import { useEffect, useRef, useState } from 'react'
import { buildTimeline, type Timeline } from '@shared/timeline'
import { useEditorStore } from './store'
import { assetFromPath } from './assets'
import { Icon } from './Icon'
import { pasteExternal } from './paste'
import { formatTime } from './preview'

export function TimelineStrip({ onPreviewFrom }: { onPreviewFrom: (id: string) => void }) {
  const elements = useEditorStore((state) => state.project.elements)
  const assets = useEditorStore((state) => state.assets)
  const selectedId = useEditorStore((state) => state.selectedId)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const select = useEditorStore((state) => state.select)
  const reorderElement = useEditorStore((state) => state.reorderElement)
  const project = useEditorStore((state) => state.project)
  const timeline: Timeline = buildTimeline(project)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragDx, setDragDx] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const replaceElement = async (id: string): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '替换元素',
      filters: [{ name: '图片与 SVG', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'] }]
    })
    if (!paths[0]) return
    try {
      const runtime = await assetFromPath(paths[0])
      useEditorStore.getState().replaceElementAsset(id, runtime)
    } catch {
      // 保持原元素
    }
  }
  const dragStartX = useRef(0)
  const movedRef = useRef(false)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = selectedIds[selectedIds.length - 1] ?? selectedId
    if (!id) return
    const card = trackRef.current?.querySelector<HTMLElement>(`[data-element-id="${id}"]`)
    if (!card) return
    card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedId, selectedIds])

  useEffect(() => {
    if (dragIndex === null) return
    const onMove = (event: PointerEvent): void => {
      if (Math.abs(event.clientX - dragStartX.current) > 4) movedRef.current = true
      if (!movedRef.current) return
      setDragDx(event.clientX - dragStartX.current)
      const cards = Array.from(
        trackRef.current?.querySelectorAll('.clip') ?? []
      ) as HTMLElement[]
      // 用「指针左侧有多少张卡片」计算插入位置，并跳过正在拖的卡片本身；
      // 这样最后一张也能一路拖到最前面。
      let target = 0
      cards.forEach((card, index) => {
        if (index === dragIndex) return
        const rect = card.getBoundingClientRect()
        if (event.clientX > rect.left + rect.width / 2) target += 1
      })
      if (target !== dragIndex) {
        reorderElement(dragIndex, target)
        setDragIndex(target)
        dragStartX.current = event.clientX
        setDragDx(0)
      }
    }
    const onUp = (): void => {
      setDragIndex(null)
      setDragDx(0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragIndex, reorderElement])

  return (
    <div className="timeline">
      <div className="timeline-head">
        <span className="timeline-title">时间轴</span>
        <span className="timeline-count">{elements.length} 个元素</span>
        <span className="timeline-count">总时长 {formatTime(timeline.duration)}</span>
        <span className="timeline-hint">拖动卡片可调整顺序</span>
      </div>
      <div className="timeline-track" ref={trackRef}>
        {elements.length === 0 ? (
          <div className="timeline-empty">还没有元素。导入图片或 SVG 后会出现在这里。</div>
        ) : (
          elements.map((element, index) => {
            const runtime = assets[element.assetId]
            const isText = element.kind === 'text'
            const isChart = element.kind === 'chart'
            const isQr = element.kind === 'qr'
            const isTable = element.kind === 'table'
            const isMindMap = element.kind === 'mindmap'
            const isShape = element.kind === 'shape'
            const isMath = element.kind === 'math'
            const isMolecule = element.kind === 'molecule'
            const isIpa = element.kind === 'ipa'
            const isMask = element.kind === 'mask'
            const total = element.appear.duration + element.hold + element.transition.duration
            const width = Math.min(320, Math.max(150, 150 + total * 18))
            return (
              <div
                key={element.id}
                data-element-id={element.id}
                className={[
                  'clip',
                  selectedIds.includes(element.id) ? 'selected' : '',
                  dragIndex === index ? 'dragging' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  width,
                  transform: dragIndex === index ? `translateX(${dragDx}px)` : undefined,
                  zIndex: dragIndex === index ? 5 : undefined
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  select(element.id, event.ctrlKey || event.metaKey)
                  dragStartX.current = event.clientX
                  movedRef.current = false
                  setDragIndex(index)
                }}
                onClick={() => {
                  if (movedRef.current) return
                }}
                onDoubleClick={() => onPreviewFrom(element.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  select(element.id)
                  setMenu({
                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 360)),
                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 300)),
                    id: element.id
                  })
                }}
              >
                <div className="clip-thumb">
                  {isChart ? (
                    <span className="clip-text-mark">图</span>
                  ) : isQr ? (
                    <span className="clip-text-mark">QR</span>
                  ) : isTable ? (
                    <span className="clip-text-mark">表</span>
                  ) : isMindMap ? (
                    <span className="clip-text-mark">脑</span>
                  ) : isShape ? (
                    <span className="clip-text-mark">形</span>
                  ) : isMath ? (
                    <span className="clip-text-mark">∑</span>
                  ) : isMolecule ? (
                    <span className="clip-text-mark">分</span>
                  ) : isIpa ? (
                    <span className="clip-text-mark">音</span>
                  ) : isMask ? (
                    <span className="clip-text-mark">蒙</span>
                  ) : isText ? (
                    <span className="clip-text-mark">T</span>
                  ) : runtime ? (
                    <img src={runtime.blobUrl} alt="" draggable={false} />
                  ) : (
                    <span>缺失</span>
                  )}
                </div>
                <div className="clip-meta">
                  <span className="clip-index">{index + 1}</span>
                  <span className="clip-name" data-no-translate={runtime ? 'true' : undefined}>
                    {isChart
                      ? element.chart?.title.trim() || '图表'
                      : isQr
                        ? '二维码'
                        : isTable
                          ? element.table?.title.trim() || '表格'
                          : isMindMap
                            ? element.mindmap?.outline.split(/\r?\n/)[0]?.trim() || '思维导图'
                            : isShape
                              ? '图形'
                              : isMath
                                ? element.math?.latex.trim().slice(0, 18) || '公式'
                                : isMolecule
                                  ? element.molecule?.smiles.trim().slice(0, 18) || '分子结构'
                                  : isIpa
                                    ? element.ipa?.xsampa.trim().slice(0, 18) || 'IPA'
                                    : isMask
                                      ? '蒙版'
                                      : isText
                              ? element.text?.content.trim().slice(0, 14) || '文字元素'
                              : runtime?.asset.name ?? '素材丢失'}
                  </span>
                </div>
                <div className="clip-durations">
                  {element.appear.duration}s · {element.hold}s · {element.transition.duration}s
                </div>
                <div className="clip-bars">
                  <span className="bar appear" style={{ flexGrow: Math.max(0.01, element.appear.duration) }} />
                  <span className="bar hold" style={{ flexGrow: Math.max(0.01, element.hold) }} />
                  <span className="bar transition" style={{ flexGrow: Math.max(0.01, element.transition.duration) }} />
                </div>
              </div>
            )
          })
        )}
      </div>

      {menu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 300 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              onPreviewFrom(menu.id)
              setMenu(null)
            }}
          >
            <Icon name="eye" />从该元素预览
          </button>
          <button
            onClick={() => {
              void replaceElement(menu.id)
              setMenu(null)
            }}
          >
            <Icon name="image" />替换元素…
          </button>
          <div className="context-submenu">
            <button>
              <span className="context-icon-spacer" /><span>挪动到</span><span className="context-arrow">›</span>
            </button>
            <div className="context-submenu-panel">
              <button
                onClick={() => {
                  useEditorStore.getState().moveElementBy(menu.id, -1)
                  setMenu(null)
                }}
              >
                <Icon name="move2previdous" />上一个
              </button>
              <button
                onClick={() => {
                  useEditorStore.getState().moveElementBy(menu.id, 1)
                  setMenu(null)
                }}
              >
                <Icon name="move2next" />下一个
              </button>
              <button
                onClick={() => {
                  useEditorStore.getState().moveElementTo(menu.id, 'start')
                  setMenu(null)
                }}
              >
                <Icon name="move2start" />开头
              </button>
              <button
                onClick={() => {
                  useEditorStore.getState().moveElementTo(menu.id, 'end')
                  setMenu(null)
                }}
              >
                <Icon name="move2end" />结尾
              </button>
            </div>
          </div>
          <button
            onClick={() => {
              void pasteExternal()
              setMenu(null)
            }}
          >
            <Icon name="add-box" />粘贴
          </button>
          <div className="context-sep" />
          <button
            onClick={() => {
              useEditorStore.getState().select(menu.id)
              useEditorStore.getState().deleteSelected()
              setMenu(null)
            }}
          >
            <Icon name="trash" />删除
          </button>
        </div>
      )}
    </div>
  )
}

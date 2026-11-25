import { useState } from 'react'
import type { HandConfig } from './hands'
import { useLanguage } from './i18n'

export function HandPivotDialog({
  hand,
  onClose,
  onSave
}: {
  hand: HandConfig
  onClose: () => void
  onSave: (pivotX: number, pivotY: number) => void
}) {
  const [pivot, setPivot] = useState({ x: hand.pivotX, y: hand.pivotY })
  const [natural, setNatural] = useState({ width: 1, height: 1 })
  const language = useLanguage()
  const text = (zh: string, english: string): string => (language === 'en' ? english : zh)

  return (
    <div className="modal-backdrop">
      <div className="modal hand-pivot-modal">
        <h2>{text('选择笔尖中心', 'Choose pen tip')}</h2>
        <p className="hint small">
          {text(
            '在图片上点击实际握笔/落笔的位置。保存后作为该手势的中心点。',
            'Click the actual pen position on the image. It becomes the hand’s center point after saving.'
          )}
        </p>
        <div className="hand-pivot-wrap">
          <img
            className="hand-pivot-image"
            src={hand.dataUrl}
            alt={hand.name}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              })
            }
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setPivot({
                x: Math.round(((event.clientX - rect.left) / rect.width) * natural.width),
                y: Math.round(((event.clientY - rect.top) / rect.height) * natural.height)
              })
            }}
          />
          <span
            className="hand-pivot-marker"
            style={{
              left: `${(pivot.x / natural.width) * 100}%`,
              top: `${(pivot.y / natural.height) * 100}%`
            }}
          />
        </div>
        <p className="hint small">
          {text('当前笔尖：', 'Current tip: ')}X {pivot.x} / Y {pivot.y} {text('像素', 'px')}
        </p>
        <div className="modal-actions">
          <button className="tool-btn" onClick={onClose}>{text('取消', 'Cancel')}</button>
          <button className="tool-btn primary" onClick={() => onSave(pivot.x, pivot.y)}>{text('保存', 'Save')}</button>
        </div>
      </div>
    </div>
  )
}

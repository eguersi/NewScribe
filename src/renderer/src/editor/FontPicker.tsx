import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export function FontPicker({
  value,
  availableFonts,
  placeholder,
  onChange,
  onCommit
}: {
  value: string
  availableFonts: string[]
  placeholder?: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [typing, setTyping] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    // 输入框正在编辑时，父组件回传的 value 不应重新把地址簿切回完整列表，
    // 否则每输入一个字符都会闪烁一次。
    if (focusedRef.current) return
    setDraft(value)
    setTyping(false)
  }, [value])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const query = draft.trim().toLowerCase()
  const choices =
    typing && query
      ? availableFonts.filter((font) => font.toLowerCase().includes(query))
      : availableFonts

  const commit = (): void => {
    setTyping(false)
    setOpen(false)
    onCommit(draft.trim())
  }

  const pick = (font: string): void => {
    setDraft(font)
    setTyping(false)
    setOpen(false)
    onChange(font)
    onCommit(font)
  }

  return (
    <span className="font-picker" ref={rootRef}>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value)
          setTyping(true)
          setOpen(true)
          onChange(event.target.value)
        }}
        onFocus={() => {
          focusedRef.current = true
          setOpen(true)
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      <button
        type="button"
        className="font-picker-toggle"
        title="选择字体"
        onClick={() => setOpen((previous) => !previous)}
      >
        ▾
      </button>
      <button type="button" className="font-picker-confirm" title="应用字体" onClick={commit}>
        <Icon name="circle-check" />
      </button>
      {open && (
        <span className="font-picker-menu">
          {choices.length === 0 ? (
            <span className="font-picker-empty">没有匹配的字体</span>
          ) : (
            choices.map((font) => (
              <button
                type="button"
                key={font}
                className={font === value ? 'active' : ''}
                onClick={() => pick(font)}
              >
                {font}
              </button>
            ))
          )}
        </span>
      )}
    </span>
  )
}

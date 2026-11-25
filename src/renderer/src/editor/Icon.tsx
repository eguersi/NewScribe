const iconUrls = import.meta.glob('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export type IconName =
  | 'cloud'
  | 'star-filled'
  | 'preview-start'
  | 'stop'
  | 'refresh-1'
  | 'refresh-2'
  | 'plus'
  | 'music-note'
  | 'graduation-cap'
  | 'music-notes'
  | 'swap-horizontal'
  | 'camera-frame'
  | 'hand'
  | 'image'
  | 'globe'
  | 'trash'
  | 'copy'
  | 'sun'
  | 'text'
  | 'home'
  | 'folder-open'
  | 'volume'
  | 'undo'
  | 'search'
  | 'help-circle'
  | 'folder'
  | 'document'
  | 'new-document'
  | 'clock'
  | 'sparkles'
  | 'pause'
  | 'update'
  | 'moon'
  | 'eye'
  | 'export'
  | 'add-box'
  | 'flower'
  | 'chart'
  | 'video'
  | 'save'
  | 'redo'
  | 'key'
  | 'bolt'
  | 'preview'
  | 'cursor'
  | 'settings'
  | 'fit-window'
  | 'fullscreen'
  | 'power'
  | 'circle-check'
  | 'download'
  | 'play-circle'
  | 'download-box'
  | 'close'
  | 'appearance'
  | 'link'
  | 'minus'
  | 'terminal'
  | 'save_as'
  | 'duplicate'
  | 'move2start'
  | 'move2end'
  | 'move2next'
  | 'move2previdous'
  | 'file'
  | 'table'
  | 'histogram'
  | 'line_chart'
  | 'pie_chart'
  | 'mind_map'
  | 'shape'
  | 'infinity_symbol'
  | 'epsilon'
  | 'qrcode'
  | 'translate'
  | 'rectangle'
  | 'triangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'circle'
  | 'arrow_shape'
  | 'star'
  | 'heart'
  | 'arrow'
  | 'freeform'
  | 'palette'
  | 'paint_bucket'
  | 'pencil'
  | 'pencil_only'
  | 'pen'
  | 'mirror'
  | 'benzene'
  | 'ipa'
  | 'camera-return'
  | 'camera-tab'
  | 'atom'
  | 'warning_triangle'
  | 'mask'
  | 'line-segment'

export function Icon({
  name,
  size = 16,
  className = ''
}: {
  name: IconName
  size?: number
  className?: string
}) {
  const url = iconUrls[`../assets/icons/${name}.svg`]
  if (!url) return null
  return (
    <span
      className={`ui-icon ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`
      }}
    />
  )
}

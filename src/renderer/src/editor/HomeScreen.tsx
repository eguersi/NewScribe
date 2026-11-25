import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'

const projectIconUrl = new URL('../assets/newscribe-project.svg', import.meta.url).href

export interface RecentProject {
  path: string
  name: string
  size: number
  modified: number
  thumbnail?: string
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: number): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function ProjectThumb({ thumbnail }: { thumbnail?: string }) {
  const [src, setSrc] = useState(thumbnail || projectIconUrl)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(thumbnail || projectIconUrl)
    setFailed(false)
  }, [thumbnail])

  if (failed) return <span className="home-thumb-mark">N</span>
  return (
    <img
      className={!thumbnail || src === projectIconUrl ? 'project-icon' : undefined}
      src={src}
      alt=""
      onError={() => {
        if (src !== projectIconUrl) setSrc(projectIconUrl)
        else setFailed(true)
      }}
    />
  )
}

export function HomeScreen({
  recents,
  onOpenPath,
  onOpenDialog,
  onNew,
  onHelp,
  onScan,
  onExportVideo,
  onShowLocation,
  onExportAssets,
  onRemoveRecent,
  onDeleteFile,
  onClose
}: {
  recents: RecentProject[]
  onOpenPath: (path: string) => void
  onOpenDialog: () => void
  onNew: () => void
  onHelp: () => void
  onScan: () => Promise<RecentProject[]>
  onExportVideo: (path: string) => void
  onShowLocation: (path: string) => void
  onExportAssets: (path: string) => void
  onRemoveRecent: (path: string) => void
  onDeleteFile: (path: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; item: RecentProject } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return recents
    return recents.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) || item.path.toLowerCase().includes(keyword)
    )
  }, [recents, search])

  return (
    <div className="home-screen">
      <aside className="home-sidebar">
        <div className="home-brand">
          <span className="home-brand-mark">N</span>
          <span>NewScribe</span>
        </div>
        <button className="home-nav primary" onClick={onNew}><Icon name="new-document" />新建工程</button>
        <button className="home-nav" onClick={onOpenDialog}><Icon name="folder-open" />打开工程</button>
        <button className="home-nav" onClick={onHelp}><Icon name="help-circle" />查看帮助</button>
        <div className="home-nav-sep" />
        <button
          className="home-nav"
          disabled={scanning}
          onClick={() => {
            setScanning(true)
            void onScan().finally(() => setScanning(false))
          }}
        >
          <Icon name="search" />{scanning ? '正在搜索…' : '检索本机工程'}
        </button>
        <div className="home-sidebar-foot">
          <button className="home-nav ghost" onClick={onClose}><Icon name="document" />进入编辑器</button>
        </div>
      </aside>

      <main className="home-main">
        <div className="home-header">
          <div>
            <h1>开始创作</h1>
            <p className="hint small">最近打开的工程、快速搜索、从本机找工程。</p>
          </div>
          <input
            className="home-search"
            placeholder="搜索工程名称或路径…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <h2 className="home-section-title">最近工程</h2>
        {filtered.length === 0 ? (
          <div className="home-empty">
            {recents.length === 0
              ? '还没有最近工程。新建一个，或打开已有工程。'
              : '没有匹配的工程。'}
          </div>
        ) : (
          <div className="home-grid">
            {filtered.map((item) => (
              <button
                key={item.path}
                className="home-card"
                title={item.path}
                onClick={() => onOpenPath(item.path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenu({ x: event.clientX, y: event.clientY, item })
                }}
              >
                <div className="home-thumb">
                  <ProjectThumb thumbnail={item.thumbnail} />
                </div>
                <div className="home-card-body">
                  <strong data-no-translate>{item.name.replace(/\.(nscribe|nspkg)$/i, '')}</strong>
                  <span className="home-card-meta">
                    {formatSize(item.size)}
                    {item.modified ? ` · ${formatDate(item.modified)}` : ''}
                  </span>
                  <span className="home-card-path">{item.path}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
      {menu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 200 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button onClick={() => { onOpenPath(menu.item.path); setMenu(null) }}><Icon name="folder-open" />打开</button>
          <button onClick={() => { onExportVideo(menu.item.path); setMenu(null) }}><Icon name="export" />导出视频</button>
          <button onClick={() => { onShowLocation(menu.item.path); setMenu(null) }}><Icon name="folder" />打开所在位置</button>
          {!menu.item.path.toLowerCase().endsWith('.nspkg') && (
            <button onClick={() => { onExportAssets(menu.item.path); setMenu(null) }}><Icon name="image" />导出所有素材</button>
          )}
          <div className="context-sep" />
          <button onClick={() => { onRemoveRecent(menu.item.path); setMenu(null) }}><Icon name="close" />从导航页移除</button>
          <button onClick={() => { onDeleteFile(menu.item.path); setMenu(null) }}><Icon name="trash" />删除文件</button>
        </div>
      )}
    </div>
  )
}

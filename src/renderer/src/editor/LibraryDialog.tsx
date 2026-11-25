import { useEffect, useMemo, useState } from 'react'
import type { LibraryState, RemoteAsset } from '@shared/types'
import type { NetworkSources } from './settings'
import { Icon } from './Icon'

interface LibraryFile {
  path: string
  name: string
  size?: number
}

function remoteKey(asset: RemoteAsset): string {
  return asset.title
    .replace(/^File:/i, '')
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
}

function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'avif') return 'image/avif'
  return 'image/png'
}

export function LibraryDialog({
  onClose,
  onPick,
  onPickRemote,
  onPickAi,
  onOpenAiConfig,
  sources,
  onToggleSource
}: {
  onClose: () => void
  onPick: (path: string) => void
  onPickRemote: (asset: RemoteAsset) => void
  onPickAi: (svg: string, name?: string) => void
  onOpenAiConfig: () => void
  sources: NetworkSources
  onToggleSource: (key: keyof NetworkSources, value: boolean) => void
}) {
  const [state, setState] = useState<LibraryState>({
    libraries: [],
    recentEnabled: true,
    recent: []
  })
  const [active, setActive] = useState<string>('recent')
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [networkResults, setNetworkResults] = useState<RemoteAsset[]>([])
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkSearched, setNetworkSearched] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; asset: RemoteAsset } | null>(null)
  const [aiConfig, setAiConfig] = useState({
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    saveToLibrary: true,
    hasKey: false
  })
  const [aiKey, setAiKey] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFiles, setAiFiles] = useState<Array<{ path: string; name: string; size: number }>>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [aiSvg, setAiSvg] = useState('')
  const [aiSvgName, setAiSvgName] = useState('')

  useEffect(() => {
    if (active !== 'ai' && active !== 'ai-library') return
    void window.newscribe.getAiConfig().then(setAiConfig)
    void window.newscribe.listAiLibrary().then(setAiFiles)
  }, [active])

  const generateAi = async (): Promise<void> => {
    if (!aiConfig.hasKey) {
      onOpenAiConfig()
      return
    }
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const result = await window.newscribe.generateAiSvg(aiPrompt.trim())
      setAiSvg(result.svg)
      if (result.path) {
        setAiSvgName(window.newscribe.path.basename(result.path))
      } else {
        const base = aiPrompt.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'svg'
        setAiSvgName(`${base}.svg`)
      }
      void window.newscribe.listAiLibrary().then(setAiFiles)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiLoading(false)
    }
  }

  const saveAiConfig = async (): Promise<void> => {
    try {
      await window.newscribe.setAiConfig({
        baseURL: aiConfig.baseURL,
        model: aiConfig.model,
        key: aiKey || undefined,
        saveToLibrary: aiConfig.saveToLibrary
      })
      setAiConfig(await window.newscribe.getAiConfig())
      setAiKey('')
      setAiError('')
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
    }
  }

  const activeLibrary = state.libraries.find((item) => item.id === active)

  useEffect(() => {
    void window.newscribe.getLibraryState().then(setState)
  }, [])

  useEffect(() => {
    if (localStorage.getItem('newscribe.vsPrompted')) return
    void (async () => {
      const detected = await window.newscribe.detectVideoScribe()
      const items = [
        ...detected.caches.map((item) => ({ ...item, label: `VS · ${item.name}` })),
        ...detected.favourites.map((item) => ({ ...item, label: 'VS · Favourites' }))
      ]
      if (items.length === 0) return
      const accepted = window.confirm(
        '检测到当前电脑安装了 VideoScribe。\n\n是否把它的素材分类和 Favourites 加入 NewScribe 素材库？\n只会引用，不会复制、移动或修改原文件。'
      )
      localStorage.setItem('newscribe.vsPrompted', '1')
      if (!accepted) return
      let latest = await window.newscribe.getLibraryState()
      for (const item of items) {
        const result = await window.newscribe.addLibrary({ name: item.label, path: item.path })
        latest = result.state
      }
      setState(latest)
    })()
  }, [])

  useEffect(() => {
    if (active === 'recent') {
      setFiles(
        state.recent.map((entry) => ({ path: entry.path, name: entry.name }))
      )
      return
    }
    if (active === 'network' || !activeLibrary) {
      setFiles([])
      return
    }
    setLoading(true)
    void window.newscribe
      .listLibrary(activeLibrary.path)
      .then((list) => setFiles(list))
      .finally(() => setLoading(false))
  }, [active, activeLibrary, state.recent])

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const next: Record<string, string> = {}
      for (const file of files.slice(0, 120)) {
        try {
          const bytes = await window.newscribe.fs.readBinary(file.path)
          const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(file.name) }))
          urls.push(url)
          next[file.path] = url
        } catch {
          // 跳过无法读取的文件
        }
      }
      if (!cancelled) setThumbnails(next)
    })()
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [files])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return files
    return files.filter((file) => file.name.toLowerCase().includes(keyword))
  }, [files, search])

  const runNetworkSearch = async (): Promise<void> => {
    const enabled = (
      ['iconify', 'openverse', 'wikimedia', 'undraw', 'qiuwen'] as const
    ).filter((key) => sources[key])
    if (enabled.length === 0) {
      window.alert('请先在首选项 → 库和素材里启用至少一个网络来源。')
      return
    }
    setNetworkLoading(true)
    setNetworkSearched(true)
    setNetworkResults([])
    try {
      await Promise.allSettled(
        enabled.map(async (source) => {
          const items = await window.newscribe.searchWeb(source, search)
          if (items.length > 0) {
            setNetworkResults((previous) => {
              const seen = new Set(previous.map(remoteKey))
              const merged = [...previous]
              for (const item of items) {
                const key = remoteKey(item)
                if (seen.has(key)) continue
                seen.add(key)
                merged.push(item)
              }
              return merged
            })
          }
        })
      )
    } finally {
      setNetworkLoading(false)
    }
  }

  const saveRemote = async (asset: RemoteAsset): Promise<void> => {
    try {
      const bytes = await window.newscribe.downloadWeb(asset.downloadUrl)
      const extension = asset.format === 'svg' ? 'svg' : asset.format === 'png' ? 'png' : 'jpg'
      const base = asset.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
      const fileName = base.toLowerCase().endsWith(`.${extension}`)
        ? base
        : `${base}.${extension}`
      const path = await window.newscribe.saveDialog({
        title: '保存网络素材',
        defaultPath: fileName,
        filters: [{ name: '图片', extensions: [extension] }]
      })
      if (!path) return
      await window.newscribe.fs.writeBinary(path, bytes)
      await window.newscribe.addRecentAsset({ path, name: asset.title })
    } catch (error) {
      window.alert(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const reorderLibrary = async (targetId: string): Promise<void> => {
    if (!draggedId || draggedId === targetId) return
    const ids = state.libraries.map((item) => item.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    const next = {
      ...state,
      libraries: ids
        .map((id) => state.libraries.find((item) => item.id === id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    }
    setState(next)
    setDraggedId(null)
    await window.newscribe.reorderLibraries(ids)
  }

  const addLibrary = async (): Promise<void> => {    const folder = await window.newscribe.chooseLibraryFolder()
    if (!folder) return
    const name = folder.split(/[\\/]/).filter(Boolean).pop() ?? folder
    const result = await window.newscribe.addLibrary({ name, path: folder })
    setState(result.state)
    if (!result.ok) {
      window.alert('这个文件夹已经在素材库里了。')
      const existing = result.state.libraries.find(
        (item) => item.path.toLowerCase() === folder.toLowerCase()
      )
      if (existing) setActive(existing.id)
    } else {
      const added = result.state.libraries[result.state.libraries.length - 1]
      if (added) setActive(added.id)
    }
  }

  const removeCurrent = async (): Promise<void> => {
    if (active === 'recent') {
      if (!window.confirm('是否移除「最近添加」？可以在首选项 → 库和素材里重新启用。\n不会删除任何文件。')) {
        return
      }
      const next = await window.newscribe.setRecentEnabled(false)
      setState(next)
      setActive(next.libraries[0]?.id ?? 'network')
      return
    }
    if (!activeLibrary) return
    if (!window.confirm(`从素材库移除「${activeLibrary.name}」？\n只会移除软件里的链接，不会删除文件夹或里面的文件。`)) {
      return
    }
    const next = await window.newscribe.removeLibrary(activeLibrary.id)
    setState(next)
    setActive(next.recentEnabled ? 'recent' : next.libraries[0]?.id ?? 'network')
  }

  return (
    <div className="modal-backdrop">
      <div className="modal library-modal">
        <div className="modal-head">
          <h2>素材库</h2>
          <button className="tool-btn" onClick={onClose}><Icon name="close" />关闭</button>
        </div>

        <div className="library-tabs">
          {state.recentEnabled && (
            <button className={active === 'recent' ? 'active' : ''} onClick={() => setActive('recent')}>
              <Icon name="clock" />最近添加
            </button>
          )}
          {state.libraries.map((library) => (
            <button
              key={library.id}
              className={active === library.id ? 'active' : ''}
              draggable
              onDragStart={() => setDraggedId(library.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void reorderLibrary(library.id)
              }}
              onClick={() => setActive(library.id)}
            >
              <Icon name="folder" />{library.name}
            </button>
          ))}
          <button className={active === 'network' ? 'active' : ''} onClick={() => setActive('network')}>
            <Icon name="globe" />网络检索
          </button>
          <button className={active === 'ai' ? 'active' : ''} onClick={() => setActive('ai')}>
            <Icon name="sparkles" />AI 生成
          </button>
          <button className={active === 'ai-library' ? 'active' : ''} onClick={() => setActive('ai-library')}>
            <Icon name="star-filled" />AI 素材库
          </button>
          <button className="library-add" onClick={() => void addLibrary()}><Icon name="plus" />添加库</button>
        </div>

        <div className="library-toolbar">
          <span className="hint small">
            {active === 'recent'
              ? '最近加入画布的文件'
              : active === 'network'
                ? '搜索网络上的 SVG 和开放版权图片'
                : active === 'ai'
                  ? '用 AI 生成 SVG 素材'
                  : active === 'ai-library'
                    ? 'AI 生成的 SVG 素材'
                    : activeLibrary?.path}
          </span>
          {(active === 'recent' || activeLibrary) && (
            <button className="mini-btn" onClick={() => void removeCurrent()}>
              {active === 'recent' ? '移除最近添加' : '移除这个库'}
            </button>
          )}
          {active !== 'ai' && (
            <input
              className="home-search library-search"
              placeholder={
                active === 'network'
                  ? '搜索网络素材，回车'
                  : active === 'ai-library'
                    ? '搜索 AI 素材…'
                    : '搜索素材…'
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && active === 'network') void runNetworkSearch()
              }}
            />
          )}
          {active === 'network' && (
            <button className="mini-btn" disabled={networkLoading} onClick={() => void runNetworkSearch()}>
              {networkLoading ? '搜索中…' : '搜索'}
            </button>
          )}
        </div>
        {active === 'network' && (
          <div className="library-sources">
            来源：
            {[
              ['iconify', 'Iconify'],
              ['openverse', 'Openverse'],
              ['wikimedia', 'Wikimedia Commons'],
              ['undraw', 'UnDraw'],
              ['qiuwen', 'qiuwenbaike']
            ].map(([key, label]) => (
              <button
                key={key}
                className={sources[key as keyof NetworkSources] ? 'active' : ''}
                onClick={() =>
                  onToggleSource(
                    key as keyof NetworkSources,
                    !sources[key as keyof NetworkSources]
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {active === 'ai' ? (
          <div className="ai-panel">
            <button className="mini-btn ai-config-button" onClick={onOpenAiConfig}>
              去配置 API
            </button>
            <input
              className="home-search ai-prompt-full"
              placeholder="例如：一只戴眼镜的卡通猫，透明背景"
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void generateAi()
              }}
            />
            <div className="ai-actions">
              <button className="tool-btn primary" disabled={aiLoading} onClick={() => void generateAi()}>
                {aiLoading ? '生成中…' : '生成 SVG'}
              </button>
            </div>
            {aiError && <div className="export-error">{aiError}</div>}
            {aiSvg && (
              <div className="ai-result">
                <div className="ai-preview">
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(aiSvg)}`} alt="" />
                </div>
                <div className="field-row">
                  <button className="tool-btn primary" onClick={() => onPickAi(aiSvg, aiSvgName)}>加入画布</button>
                  <button
                    className="tool-btn"
                    onClick={() => {
                      void (async () => {
                        const path = await window.newscribe.saveDialog({
                          title: '保存 AI SVG',
                          defaultPath: aiSvgName || 'prompt.svg',
                          filters: [{ name: 'SVG', extensions: ['svg'] }]
                        })
                        if (path) await window.newscribe.fs.writeText(path, aiSvg)
                      })()
                    }}
                  >
                    下载 SVG
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : active === 'ai-library' ? (
          <div className="ai-panel">
            {(() => {
              const keyword = search.trim().toLowerCase()
              const list = keyword
                ? aiFiles.filter((file) => file.name.toLowerCase().includes(keyword))
                : aiFiles
              return list.length === 0 ? (
                <div className="home-empty">
                  {search.trim() ? '未搜索到文件。' : '还没有生成过 SVG。'}
                </div>
              ) : (
                <div className="library-grid">
                  {list.map((file) => (
                    <div className="library-card" key={file.path}>
                      <button className="library-open" onClick={() => onPick(file.path)}>
                        <div className="library-thumb remote">
                          <img src={`file:///${file.path.replace(/\\/g, '/')}`} alt="" />
                        </div>
                        <span className="library-name" data-no-translate>{file.name}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        ) : active === 'network' ? (
          networkLoading && networkResults.length === 0 ? (
            <div className="home-empty">正在搜索网络素材…</div>
          ) : networkResults.length === 0 ? (
            <div className="home-empty">
              {networkSearched ? '没有找到结果。' : '输入关键词，搜索已启用的网络来源。'}
            </div>
          ) : (
            <div className="library-grid">
              {networkResults.map((asset) => (
                <div
                  key={asset.id}
                  className="library-card"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenu({ x: event.clientX, y: event.clientY, asset })
                  }}
                >
                  <button className="library-open" title={asset.title} onClick={() => onPickRemote(asset)}>
                    <div className="library-thumb remote">
                      <img src={asset.previewUrl} alt="" loading="lazy" />
                    </div>
                    <span className="library-name">{asset.title}</span>
                    <span className="library-source">{asset.source}{asset.license ? ` · ${asset.license}` : ''}</span>
                  </button>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="home-empty">正在读取文件夹…</div>
        ) : filtered.length === 0 ? (
          <div className="home-empty">
            {search.trim()
              ? '未搜索到文件。'
              : active === 'recent'
                ? '还没有最近添加的素材。'
                : '这个文件夹里没有图片或 SVG。'}
          </div>
        ) : (
          <div className="library-grid">
            {filtered.map((file) => (
              <div key={file.path} className="library-card">
                <button className="library-open" title={file.path} onClick={() => onPick(file.path)}>
                  <div className="library-thumb">
                    {thumbnails[file.path] ? (
                      <img src={thumbnails[file.path]} alt="" />
                    ) : (
                      <span>…</span>
                    )}
                  </div>
                  <span className="library-name" data-no-translate>{file.name}</span>
                </button>
                {active === 'recent' && (
                  <button
                    className="library-remove"
                    title="从最近添加中移除"
                    onClick={() => {
                      void window.newscribe.removeRecentAsset(file.path).then(setState)
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {menu && (
          <div
            className="context-menu"
            style={{ position: 'fixed', left: menu.x, top: menu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                void window.newscribe.openExternal(menu.asset.pageUrl)
                setMenu(null)
              }}
            >
              <Icon name="globe" />打开网页
            </button>
            <button
              onClick={() => {
                void saveRemote(menu.asset)
                setMenu(null)
              }}
            >
              <Icon name="save" />保存到本地…
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

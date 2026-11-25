import { useEffect, useState } from 'react'
import type { AppSettings, AccentId } from './settings'
import { saveSettings } from './settings'
import type { LibraryState } from '@shared/types'
import { Icon } from './Icon'
import { FONT_FAMILIES, isFontAvailable, isSafeFont } from './text'
import { FontPicker } from './FontPicker'

export type PreferencesTab = 'general' | 'appearance' | 'defaults' | 'startup' | 'library' | 'ai' | 'export'
type Tab = PreferencesTab

const ACCENTS: Array<{ id: AccentId; label: string; color: string }> = [
  { id: 'amber', label: '琥珀', color: '#f5a524' },
  { id: 'blue', label: '海洋蓝', color: '#4c8dff' },
  { id: 'mint', label: '薄荷绿', color: '#35c28f' },
  { id: 'violet', label: '紫罗兰', color: '#a77bff' },
  { id: 'rose', label: '玫瑰红', color: '#f25f7a' }
]

const APPEAR_OPTIONS: Array<{ value: AppSettings['svgAppear']; label: string }> = [
  { value: 'draw', label: '矢量描绘' },
  { value: 'bitmap', label: '位图描绘' },
  { value: 'fade', label: '淡化' },
  { value: 'move', label: '移入' },
  { value: 'zoom', label: '放大' },
  { value: 'spin', label: '旋转' },
  { value: 'unfold', label: '展开' }
]

export function PreferencesDialog({
  initial,
  initialTab,
  onClose
}: {
  initial: AppSettings
  initialTab?: Tab
  onClose: (next: AppSettings) => void
}) {
  const [settings, setSettings] = useState<AppSettings>(initial)
  const [tab, setTab] = useState<Tab>(initialTab ?? 'general')
  const [scribeBound, setScribeBound] = useState(false)
  const [libraryState, setLibraryState] = useState<LibraryState | null>(null)
  const [aiConfig, setAiConfig] = useState({
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    saveToLibrary: true,
    hasKey: false
  })
  const [aiKey, setAiKey] = useState('')
  const availableFonts = FONT_FAMILIES.filter(isFontAvailable)

  useEffect(() => {
    void window.newscribe.getScribeAssociation().then(setScribeBound)
    void window.newscribe.getLibraryState().then(setLibraryState)
    void window.newscribe.getAiConfig().then(setAiConfig)
  }, [])

  const update = (patch: Partial<AppSettings>): void => {
    setSettings((previous) => ({ ...previous, ...patch }))
  }

  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent
    return () => {
      document.documentElement.dataset.accent = initial.accent
    }
  }, [settings.accent, initial.accent])

  const apply = (): void => {
    const normalized: AppSettings = {
      ...settings,
      autosaveSeconds: Math.min(3600, Math.max(15, Math.round(settings.autosaveSeconds)))
    }
    saveSettings(normalized)
    onClose(normalized)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal pref-modal">
        <div className="modal-head">
          <h2><Icon name="settings" />首选项</h2>
        </div>

        <div className="pref-tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><Icon name="home" />常规</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><Icon name="appearance" />外观</button>
          <button className={tab === 'defaults' ? 'active' : ''} onClick={() => setTab('defaults')}><Icon name="circle-check" />默认值</button>
          <button className={tab === 'startup' ? 'active' : ''} onClick={() => setTab('startup')}><Icon name="power" />启动</button>
          <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Icon name="folder" />库和素材</button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}><Icon name="sparkles" />AI</button>
          <button className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}><Icon name="export" />导出</button>
        </div>

        {tab === 'general' && (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field-label label-with-icon"><Icon name="translate" />语言 / Language</span>
                <span className="field-input">
                  <select
                    value={settings.language}
                    onChange={(event) =>
                      update({ language: event.target.value === 'en' ? 'en' : 'zh' })
                    }
                  >
                    <option value="zh">中文（中国大陆）</option>
                    <option value="en">English</option>
                  </select>
                </span>
              </label>
            </div>
            <div className="pref-row">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.autosaveEnabled}
                  onChange={(event) => update({ autosaveEnabled: event.target.checked })}
                />
                <span>定时自动保存</span>
              </label>
              <p className="hint small">
                只在工程已经保存过之后生效；没有保存路径的新工程不会自动写文件。
              </p>
            </div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">自动保存间隔</span>
                <span className="field-input">
                  <input
                    type="number"
                    min={15}
                    max={3600}
                    step={15}
                    value={settings.autosaveSeconds}
                    disabled={!settings.autosaveEnabled}
                    onChange={(event) => update({ autosaveSeconds: Number(event.target.value) })}
                  />
                  <span className="field-suffix">秒</span>
                </span>
              </label>
            </div>

          </>
        )}

        {tab === 'appearance' && (
          <>
            <div className="pref-row">
              <span className="field-label">主题</span>
            </div>
            <div className="theme-options">
              <button
                className={settings.theme === 'dark' ? 'active' : ''}
                onClick={() => update({ theme: 'dark' })}
              >
                <Icon name="moon" />深色
              </button>
              <button
                className={settings.theme === 'light' ? 'active' : ''}
                onClick={() => update({ theme: 'light' })}
              >
                <Icon name="sun" />浅色
              </button>
              <button
                className={settings.theme === 'system' ? 'active' : ''}
                onClick={() => update({ theme: 'system' })}
              >
                <Icon name="appearance" />跟随系统
              </button>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.compactToolbar}
                onChange={(event) => update({ compactToolbar: event.target.checked })}
              />
              <span>工具栏紧凑模式</span>
            </label>
            <p className="hint small">开启后编辑页工具栏只显示图标，鼠标悬浮可看说明。</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.showCanvasOutside}
                onChange={(event) => update({ showCanvasOutside: event.target.checked })}
              />
              <span>编辑器展示原画布大小之外的空间</span>
            </label>
            <p className="hint small">开启后画布外区域也使用当前背景色和纹理，方便编辑画布外元素。</p>
            <div className="pref-row">
              <span className="field-label">强调色</span>
            </div>
            <div className="accent-options">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  className={`accent-option${settings.accent === accent.id ? ' active' : ''}`}
                  style={{ '--swatch': accent.color } as React.CSSProperties}
                  onClick={() => update({ accent: accent.id })}
                  title={accent.label}
                >
                  <span className="accent-dot" />
                  <span>{accent.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'defaults' && (
          <>
            <p className="hint small">新建元素、导入素材时使用的默认值；已有元素不受影响。</p>
            <div className="field-row">
              <label className="field">
                <span className="field-label">SVG 默认出现</span>
                <span className="field-input">
                  <select
                    value={settings.svgAppear}
                    onChange={(event) =>
                      update({ svgAppear: event.target.value as AppSettings['svgAppear'] })
                    }
                  >
                    {APPEAR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">图片默认出现</span>
                <span className="field-input">
                  <select
                    value={settings.imageAppear}
                    onChange={(event) =>
                      update({ imageAppear: event.target.value as AppSettings['imageAppear'] })
                    }
                  >
                    {APPEAR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </span>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">出现时长</span>
                <span className="field-input">
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={settings.defaultAppearDuration}
                    onChange={(event) => update({ defaultAppearDuration: Number(event.target.value) })}
                  />
                  <span className="field-suffix">秒</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">暂停时长</span>
                <span className="field-input">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={settings.defaultHold}
                    onChange={(event) => update({ defaultHold: Number(event.target.value) })}
                  />
                  <span className="field-suffix">秒</span>
                </span>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">切换时长</span>
                <span className="field-input">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={settings.defaultTransition}
                    onChange={(event) => update({ defaultTransition: Number(event.target.value) })}
                  />
                  <span className="field-suffix">秒</span>
                </span>
              </label>
              <label className="field">
                <span className="field-label">默认背景色</span>
                <span className="field-input color-input">
                  <input
                    type="color"
                    value={settings.defaultBackground}
                    onChange={(event) => update({ defaultBackground: event.target.value })}
                  />
                  <input
                    className="hex-input"
                    value={settings.defaultBackground}
                    onChange={(event) => update({ defaultBackground: event.target.value })}
                  />
                </span>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">文字默认字体</span>
                <span className="field-input">
                  <FontPicker
                    value={settings.defaultTextFont}
                    availableFonts={availableFonts}
                    placeholder="例如 Microsoft YaHei"
                    onChange={(value) => update({ defaultTextFont: value })}
                    onCommit={(value) => update({ defaultTextFont: value })}
                  />
                </span>
              </label>
            </div>
            {!isSafeFont(settings.defaultTextFont) && (
              <p className="hint small text-warning">
                推荐使用可商用或开源字体（如思源、文泉驿、得意黑、更纱黑体、霞鹜系列），可降低字体版权风险。
              </p>
            )}
            {settings.defaultTextFont.trim() && !isFontAvailable(settings.defaultTextFont) && (
              <p className="hint small">
                当前系统未检测到该字体，文字会使用后备字体显示。
              </p>
            )}
          </>
        )}

        {tab === 'startup' && (
          <>
            <div className="pref-row">
              <label className="field">
                <span className="field-label">打开 NewScribe 时</span>
                <span className="field-input">
                  <select
                    value={settings.startup}
                    onChange={(event) =>
                      update({ startup: event.target.value as AppSettings['startup'] })
                    }
                  >
                    <option value="home">打开导航页</option>
                    <option value="new">新建空白文档</option>
                    <option value="last">打开上次的文档</option>
                    <option value="choose">每次让我选择文件</option>
                  </select>
                </span>
              </label>
            </div>
            <p className="hint small">
              「打开上次的文档」只在上次保存或打开过工程时生效；文件已被移动时会提示。
            </p>
            <div className="pref-row">
              <button
                className="tool-btn"
                onClick={() => {
                  void (async () => {
                    const ok = await window.newscribe.setScribeAssociation(!scribeBound)
                    if (ok) setScribeBound(!scribeBound)
                  })()
                }}
              >
                {scribeBound ? '解除 .scribe 绑定' : '绑定 .scribe 到 NewScribe'}
              </button>
            </div>
            <p className="hint small">
              仅 Windows：绑定后双击 .scribe 默认用 NewScribe 打开。安装了 VideoScribe 的用户可以随时在这里解除。
            </p>
          </>
        )}

        {tab === 'library' && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={libraryState?.recentEnabled ?? true}
                disabled={!libraryState}
                onChange={(event) => {
                  void window.newscribe
                    .setRecentEnabled(event.target.checked)
                    .then(setLibraryState)
                }}
              />
              <span>启用「最近添加」</span>
            </label>
            <p className="hint small">
              启用后，加入画布的图片和 SVG 会记录在「最近添加」里。
            </p>
            <div className="pref-row">
              <button
                className="mini-btn"
                onClick={() => {
                  void (async () => {
                    const detected = await window.newscribe.detectVideoScribe()
                    const items = [
                      ...detected.caches.map((item) => ({ ...item, label: `VS · ${item.name}` })),
                      ...detected.favourites.map((item) => ({
                        ...item,
                        label: 'VS · Favourites'
                      }))
                    ]
                    if (items.length === 0) {
                      window.alert('没有检测到 VideoScribe 素材库。')
                      return
                    }
                    let latest = libraryState
                    let added = 0
                    for (const item of items) {
                      const result = await window.newscribe.addLibrary({
                        name: item.label,
                        path: item.path
                      })
                      latest = result.state
                      if (result.ok) added += 1
                    }
                    setLibraryState(latest)
                    window.alert(`已加入 ${added} 个 VideoScribe 素材库。`)
                  })()
                }}
              >
                加入 VideoScribe 素材库
              </button>
            </div>
            <p className="hint small">
              会加入 VS 的 Caches 分类和 Favourites；只引用原文件夹，不复制、不移动。
            </p>
            <div className="pref-row">
              <span className="field-label">网络搜索来源</span>
            </div>
            {[
              ['iconify', 'Iconify', 'SVG 图标'],
              ['openverse', 'Openverse', '开放版权图片'],
              ['wikimedia', 'Wikimedia Commons', '开放版权图片 / 矢量'],
              ['undraw', 'UnDraw', 'SVG 插画'],
              ['qiuwen', 'qiuwenbaike', '国内 MediaWiki']
            ].map(([key, label, detail]) => (
              <label className="check-row" key={key}>
                <input
                  type="checkbox"
                  checked={settings.networkSources[key as keyof typeof settings.networkSources]}
                  onChange={(event) =>
                    update({
                      networkSources: {
                        ...settings.networkSources,
                        [key]: event.target.checked
                      }
                    })
                  }
                />
                <span>{label} <span className="hint small">{detail}</span></span>
              </label>
            ))}
          </>
        )}

        {tab === 'ai' && (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field-label label-with-icon"><Icon name="link" />Base URL</span>
                <span className="field-input">
                  <input
                    value={aiConfig.baseURL}
                    onChange={(event) => setAiConfig({ ...aiConfig, baseURL: event.target.value })}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field-label">模型</span>
                <span className="field-input">
                  <input
                    value={aiConfig.model}
                    onChange={(event) => setAiConfig({ ...aiConfig, model: event.target.value })}
                  />
                </span>
              </label>
            </div>
            <label className="field">
              <span className="field-label label-with-icon"><Icon name="key" />API Key</span>
              <span className="field-input">
                <input
                  type="password"
                  placeholder={aiConfig.hasKey ? '已保存，留空则不修改' : '输入 API Key'}
                  value={aiKey}
                  onChange={(event) => setAiKey(event.target.value)}
                />
              </span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={aiConfig.saveToLibrary}
                onChange={(event) => setAiConfig({ ...aiConfig, saveToLibrary: event.target.checked })}
              />
              <span>AI 生成的 SVG 默认加入 AI 素材库</span>
            </label>
            <div className="field-row">
              <button
                className="tool-btn"
                onClick={() => {
                  void (async () => {
                    await window.newscribe.setAiConfig({
                      baseURL: aiConfig.baseURL,
                      model: aiConfig.model,
                      key: aiKey || undefined,
                      saveToLibrary: aiConfig.saveToLibrary
                    })
                    setAiConfig(await window.newscribe.getAiConfig())
                    setAiKey('')
                  })()
                }}
              >
                保存 AI 配置
              </button>
              <button
                className="tool-btn"
                onClick={() => {
                  void window.newscribe.clearAiKey().then(() => setAiConfig({ ...aiConfig, hasKey: false }))
                }}
              >
                移除 API Key
              </button>
            </div>
            <p className="hint small">Key 会加密保存在软件数据目录里。</p>
          </>
        )}

        {tab === 'export' && (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field-label">默认清晰度</span>
                <span className="field-input">
                  <select
                    value={settings.exportQuality}
                    onChange={(event) =>
                      update({ exportQuality: event.target.value as AppSettings['exportQuality'] })
                    }
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="2k">2K</option>
                    <option value="4k">4K</option>
                    <option value="custom">自定义</option>
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">默认帧率</span>
                <span className="field-input">
                  <select
                    value={settings.exportFps}
                    onChange={(event) => update({ exportFps: Number(event.target.value) })}
                  >
                    {[24, 25, 30, 50, 60].map((value) => (
                      <option key={value} value={value}>{value} fps</option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
            {settings.exportQuality === 'custom' && (
              <div className="field-row">
                <label className="field">
                  <span className="field-label">自定义宽</span>
                  <span className="field-input">
                    <input
                      type="number"
                      min={320}
                      step={2}
                      value={settings.exportCustomWidth}
                      onChange={(event) => update({ exportCustomWidth: Number(event.target.value) })}
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">自定义高</span>
                  <span className="field-input">
                    <input
                      type="number"
                      min={240}
                      step={2}
                      value={settings.exportCustomHeight}
                      onChange={(event) => update({ exportCustomHeight: Number(event.target.value) })}
                    />
                  </span>
                </label>
              </div>
            )}
            <label className="field">
              <span className="field-label">默认导出位置</span>
              <span className="field-input export-path">
                <input
                  value={settings.exportDirectory}
                  placeholder="留空则使用系统视频文件夹"
                  onChange={(event) => update({ exportDirectory: event.target.value })}
                />
                <button
                  className="mini-btn"
                  onClick={() => {
                    void (async () => {
                      const directory = await window.newscribe.chooseDirectory('选择默认导出文件夹')
                      if (directory) update({ exportDirectory: directory })
                    })()
                  }}
                >
                  选择…
                </button>
              </span>
            </label>
            <p className="hint small">清晰度会按当前画幅比例换算宽高。</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.openFolderAfterExport}
                onChange={(event) => update({ openFolderAfterExport: event.target.checked })}
              />
              <span>导出完成后自动打开所在文件夹</span>
            </label>
          </>
        )}

        <div className="modal-actions">
          <button className="tool-btn" onClick={() => onClose(initial)}>取消</button>
          <button className="tool-btn primary" onClick={apply}>保存</button>
        </div>
      </div>
    </div>
  )
}

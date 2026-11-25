import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { createElementFromAsset, createShapeElement, createTextElement } from '@shared/project'
import type { ShapeKind } from '@shared/project'
import { buildTimeline } from '@shared/timeline'
import { assetFromFile, assetFromPath, createAssetRuntime, type AssetRuntime } from './assets'
import { CanvasStage } from './CanvasStage'
import { AboutDialog } from './AboutDialog'
import { HomeScreen, type RecentProject } from './HomeScreen'
import { LibraryDialog } from './LibraryDialog'
import { Icon } from './Icon'
import { applyLanguage } from './i18n'
import { createToneAudioRuntime, loadDemo } from './demo'
import { pasteExternal, startClipboardObserver } from './paste'

const logoUrl = new URL('../assets/logo.svg', import.meta.url).href
import { ensureDrawPlans, getDrawPlan } from './draw'
import { ExportDialog } from './ExportDialog'
import { exportProject } from './export'
import { Inspector } from './Inspector'
import { PreferencesDialog } from './PreferencesDialog'
import { ShapeEditorDialog } from './ShapeEditorDialog'
import { PreviewOverlay } from './PreviewOverlay'
import { TimelineStrip } from './TimelineStrip'
import { openProject, openProjectPath, relinkAsset, saveProject, type ProjectFormat } from './persistence'
import { SaveFormatDialog } from './SaveFormatDialog'
import { importScribeFile } from './scribe'
import { screenToWorld } from './render'
import { loadSettings, saveSettings, type AppSettings } from './settings'
import { useEditorStore } from './store'
import './editor.css'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']
const IMAGE_EXT = new Set(IMAGE_EXTENSIONS)
const AUDIO_EXT = new Set(AUDIO_EXTENSIONS)

function loadRecents(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem('newscribe.recent') ?? '[]') as RecentProject[]
  } catch {
    return []
  }
}

function saveRecents(list: RecentProject[]): void {
  try {
    localStorage.setItem('newscribe.recent', JSON.stringify(list.slice(0, 12)))
  } catch {
    // 忽略
  }
}

const extOf = (name: string): string => {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function isImportable(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.has(extOf(file.name))
}

async function placeAsset(
  runtime: AssetRuntime,
  options?: { strokeOnly?: boolean }
): Promise<void> {
  const state = useEditorStore.getState()
  state.registerAsset(runtime)
  if (runtime.asset.svgAnimated) {
    window.dispatchEvent(
      new CustomEvent('newscribe:toast', {
        detail: '检测到 SVG 声明式动画，当前版本暂不支持播放'
      })
    )
  }
  if (runtime.asset.originalPath) {
    void window.newscribe.addRecentAsset({
      path: runtime.asset.originalPath,
      name: runtime.asset.name
    })
  }

  const canvas = state.project.canvas
  const view = state.viewSize
  const scale = state.viewport.scale

  // 按「当前屏幕视野」决定大小：放大画布时，拖进来的图不会撑满画布
  const desiredWidth = view.width > 0 ? (view.width * 0.38) / scale : canvas.width * 0.45
  const desiredHeight = view.height > 0 ? (view.height * 0.42) / scale : canvas.height * 0.45
  const maxWidth = Math.min(desiredWidth, canvas.width * 0.9)
  const maxHeight = Math.min(desiredHeight, canvas.height * 0.9)
  const factor = Math.min(1, maxWidth / runtime.asset.width, maxHeight / runtime.asset.height)
  const width = Math.max(20, runtime.asset.width * factor)
  const height = Math.max(20, runtime.asset.height * factor)

  const center =
    view.width > 0
      ? screenToWorld(state.viewport, view.width / 2, view.height / 2)
      : { x: canvas.width / 2, y: canvas.height / 2 }

  const element = createElementFromAsset(runtime.asset, {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  })
  if (options?.strokeOnly) element.strokeOnly = true
  element.camera = {
    ...element.camera,
    zoom:
      view.width > 0
        ? Math.max(0.05, (canvas.width * scale) / view.width)
        : element.camera.zoom
  }
  useEditorStore.getState().addElement(element)
}

function Logo() {
  return <img className="app-logo" src={logoUrl} alt="NewScribe" draggable={false} />
}

export function Editor() {
  const project = useEditorStore((state) => state.project)
  const assets = useEditorStore((state) => state.assets)
  const selectedId = useEditorStore((state) => state.selectedId)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const shapeEditorId = useEditorStore((state) => state.shapeEditorId)
  const closeShapeEditor = useEditorStore((state) => state.closeShapeEditor)
  const filePath = useEditorStore((state) => state.filePath)
  const dirty = useEditorStore((state) => state.dirty)
  const missing = useEditorStore((state) => state.missing)
  const viewport = useEditorStore((state) => state.viewport)
  const past = useEditorStore((state) => state.past)
  const future = useEditorStore((state) => state.future)

  const [toast, setToast] = useState<string | null>(null)
  const [zoomTip, setZoomTip] = useState<{ left: number; top: number; text: string } | null>(null)
  const zoomTipTimer = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ start: number; autoPlay: boolean } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [newPromptOpen, setNewPromptOpen] = useState(false)
  const [leavePromptOpen, setLeavePromptOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [scribeWarningPath, setScribeWarningPath] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [savePrompt, setSavePrompt] = useState<{ saveAs: boolean; after?: () => void } | null>(null)
  const [recents, setRecents] = useState<RecentProject[]>(loadRecents)
  const [homeOpen, setHomeOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [toolbarMenu, setToolbarMenu] = useState<'chart' | 'other' | 'shape' | null>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsTab, setPrefsTab] = useState('general')
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [fullscreen, setFullscreen] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const fullscreenRef = useRef(false)
  const actionsRef = useRef<Record<string, () => void>>({})

  const notify = (message: string): void => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }

  const notifyRecovered = (recovered?: boolean): void => {
    if (recovered) notify('原工程文件损坏，已从 .bak 备份恢复')
  }

  useEffect(() => {
    const onToast = (event: Event): void => {
      const message = (event as CustomEvent<string>).detail
      if (message) notify(message)
    }
    window.addEventListener('newscribe:toast', onToast)
    return () => window.removeEventListener('newscribe:toast', onToast)
  }, [])

  useEffect(() => startClipboardObserver(), [])

  useEffect(() => {
    // Commit a pending inspector edit before another element can become the
    // selection target. Without this, a deferred blur could write the old
    // draft into the newly selected element.
    const commitPendingEdit = (event: PointerEvent): void => {
      const active = document.activeElement
      if (
        !(active instanceof HTMLInputElement) &&
        !(active instanceof HTMLTextAreaElement) &&
        !(active instanceof HTMLSelectElement)
      ) {
        return
      }
      const target = event.target
      if (target instanceof Node && (target === active || active.contains(target))) return
      active.blur()
    }
    window.addEventListener('pointerdown', commitPendingEdit, true)
    return () => window.removeEventListener('pointerdown', commitPendingEdit, true)
  }, [])

  useEffect(() => {
    const name = filePath ? window.newscribe.path.basename(filePath) : '未命名'
    document.title = `${name}${dirty ? ' •' : ''} — NewScribe`
    ;(window as unknown as { __newscribeDirty?: boolean }).__newscribeDirty = dirty
  }, [filePath, dirty])

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme')
    if (theme === 'light' || theme === 'dark') {
      setSettings((previous) => ({ ...previous, theme }))
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('home')) {
      setHomeOpen(true)
      return
    }
    if (['demo', 'diagnose', 'preview', 'exportTest', 'drawTest', 'importTest', 'screenshot', 'openFile'].some((key) => params.has(key))) {
      return
    }
    if (settings.startup === 'new') return
    if (settings.startup === 'home') {
      setHomeOpen(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        if (settings.startup === 'last') {
          const last = localStorage.getItem('newscribe.lastPath')
          if (!last) return
          const result = await openProjectPath(last)
          if (!cancelled && !result.ok && result.error) window.alert(result.error)
          if (!cancelled && result.ok) notifyRecovered(result.recoveredFromBackup)
        } else {
          const result = await openProject()
          if (!cancelled && !result.ok && result.error) window.alert(result.error)
          if (!cancelled && result.ok) notifyRecovered(result.recoveredFromBackup)
        }
      } catch {
        // 启动打开失败时保持空白工程
      }
    })()
    return () => {
      cancelled = true
    }
    // 只在首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toolbarMenu) return
    const close = (): void => setToolbarMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [toolbarMenu])

  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent
    applyLanguage(settings.language)
    void window.newscribe.setAppLanguage(settings.language)
  }, [settings.language, settings.accent])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = resolved
      void window.newscribe.setAppearance(resolved, settings.accent)
    }
    apply()
    if (settings.theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme, settings.accent])

  useEffect(() => {
    fullscreenRef.current = fullscreen
  }, [fullscreen])

  useEffect(() => {
    void window.newscribe.isFullscreen().then(setFullscreen)
    return window.newscribe.onFullscreenChange(setFullscreen)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const importPath = params.get('importTest')
    const drawPath = params.get('drawTest')
    if (!importPath && !drawPath) return
    void (async () => {
      const started = performance.now()
      try {
        const runtime = await assetFromPath((importPath ?? drawPath) as string)
        const decoded = performance.now()
        await placeAsset(runtime)
        const placed = performance.now()
        console.log(
          `[import-test] decode=${Math.round(decoded - started)}ms place=${Math.round(
            placed - decoded
          )}ms asset=${runtime.asset.width}x${runtime.asset.height} image=${runtime.image?.naturalWidth ?? 0}x${runtime.image?.naturalHeight ?? 0}`
        )

        if (drawPath) {
          const state = useEditorStore.getState()
          const element = state.project.elements[state.project.elements.length - 1]
          if (element) {
            state.updateElement(element.id, {
              appear: { kind: 'draw', duration: 3, easing: 'linear' }
            })
            const planStarted = performance.now()
            await ensureDrawPlans(useEditorStore.getState().project, useEditorStore.getState().assets)
            const planMs = performance.now() - planStarted
            const plan = getDrawPlan(element.id)
            console.log(
              `[draw-test] plan=${Math.round(planMs)}ms strokes=${plan?.strokes.length ?? 0} strokeLen=${Math.round(
                plan?.strokeLength ?? 0
              )} fillLen=${Math.round(plan?.fillLength ?? 0)} error=${plan?.error ?? ''}`
            )
            setPreview({ start: 1.5, autoPlay: false })
          }
        }
      } catch (error) {
        console.log(`[import-test] failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('exportTest') !== '1') return
    void (async () => {
      await loadDemo()
      const tone = await createToneAudioRuntime()
      useEditorStore.getState().registerAsset(tone)
      useEditorStore.getState().setAudio(tone.asset.id, { volume: 0.6, fadeIn: 0.5, fadeOut: 1.5 })
      const state = useEditorStore.getState()
      const started = performance.now()
      try {
        const buffer = await exportProject({
          project: state.project,
          assets: state.assets,
          width: 1920,
          height: 1080,
          fps: 30,
          signal: new AbortController().signal,
          onProgress: (progress) => {
            if (progress.phase === 'video' && progress.frame && progress.frame % 60 === 0) {
              console.log(`[export-test] frame ${progress.frame}/${progress.frames}`)
            }
          }
        })
        const elapsed = performance.now() - started
        await window.newscribe.saveExportTest(buffer)
        console.log(`[export-test] bytes=${buffer.byteLength} ms=${Math.round(elapsed)}`)
      } catch (error) {
        console.log(`[export-test] failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') !== '1') return
    void (async () => {
      await loadDemo()
      if (params.get('preview') === '1') {
        const time = Number(params.get('t'))
        setPreview({
          start: Number.isFinite(time) ? time : 2,
          autoPlay: params.get('autoplay') === '1'
        })
      }
    })()
  }, [])

  const openPreview = (fromId?: string): void => {
    const state = useEditorStore.getState()
    const timeline = buildTimeline(state.project)
    const start = fromId ? (timeline.timing[fromId]?.appearStart ?? 0) : 0
    setPreview({ start, autoPlay: true })
  }

  useEffect(() => {
    if (!settings.autosaveEnabled) return
    const timer = window.setInterval(() => {
      const state = useEditorStore.getState()
      if (!state.dirty || !state.filePath) return
      void saveProject(false).catch(() => {
        // 自动保存失败不打扰用户
      })
    }, settings.autosaveSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [settings.autosaveEnabled, settings.autosaveSeconds])

  const handleRelink = async (assetId: string): Promise<void> => {
    const asset = project.assets.find((item) => item.id === assetId)
    const paths = await window.newscribe.openDialog({
      title: '重新定位素材',
      filters: [
        asset?.kind === 'audio'
          ? { name: '音频文件', extensions: AUDIO_EXTENSIONS }
          : { name: '图片与 SVG', extensions: IMAGE_EXTENSIONS }
      ]
    })
    const path = paths[0]
    if (!path) return
    try {
      await relinkAsset(assetId, path)
      notify('素材已重新链接')
    } catch (error) {
      notify(`重新链接失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleImport = async (): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '导入素材',
      multiple: true,
      filters: [{ name: '图片与 SVG', extensions: IMAGE_EXTENSIONS }]
    })
    for (const path of paths) {
      try {
        await placeAsset(await assetFromPath(path))
      } catch (error) {
        notify(`导入失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const handleNew = (): void => {
    if (dirty) {
      setNewPromptOpen(true)
      return
    }
    useEditorStore.getState().resetProject()
  }

  const discardAndNew = (): void => {
    setNewPromptOpen(false)
    useEditorStore.getState().resetProject()
  }

  const saveAndNew = async (): Promise<void> => {
    await handleSave(false, () => {
      const state = useEditorStore.getState()
      if (state.dirty) return
      setNewPromptOpen(false)
      state.resetProject()
    })
  }

  const handleImportAudio = async (): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '选择背景音乐',
      filters: [{ name: '音频文件', extensions: AUDIO_EXTENSIONS }]
    })
    const path = paths[0]
    if (!path) return
    await applyAudioFromPath(path)
  }

  const applyAudioFromPath = async (path: string): Promise<void> => {
    try {
      const runtime = await assetFromPath(path)
      const state = useEditorStore.getState()
      state.registerAsset(runtime)
      if (!state.project.audio) state.setAudio(runtime.asset.id)
      else if (!state.project.audio2) state.setAudio2(runtime.asset.id)
      else notify('已经有两条音轨了，请先移除一条再添加')
      notify(`已添加音轨：${runtime.asset.name}`)
    } catch (error) {
      notify(`导入音乐失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleAddText = (): void => {
    const state = useEditorStore.getState()
    const canvas = state.project.canvas
    const view = state.viewSize
    const scale = state.viewport.scale
    const width = view.width > 0 ? (view.width * 0.42) / scale : canvas.width * 0.5
    const height = Math.max(80, width * 0.26)
    const center =
      view.width > 0
        ? screenToWorld(state.viewport, view.width / 2, view.height / 2)
        : { x: canvas.width / 2, y: canvas.height / 2 }
    const element = createTextElement({
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height
    })
    if (element.text) {
      element.text.fontSize = Math.max(2, Math.min(140, width * 0.1))
      element.text.fontFamily = settings.defaultTextFont || element.text.fontFamily
    }
    state.addElement(element)
  }

  const rememberProject = async (path: string): Promise<void> => {
    const info = await window.newscribe.stat(path)
    let thumbnail: string | undefined
    if (!path.toLowerCase().endsWith('.nspkg')) {
      try {
        const text = await window.newscribe.fs.readText(path)
        const parsed = JSON.parse(text) as { thumbnail?: string }
        thumbnail = parsed.thumbnail
      } catch {
        thumbnail = undefined
      }
    }
    const entry: RecentProject = {
      path,
      name: window.newscribe.path.basename(path),
      size: info?.size ?? 0,
      modified: info?.modified ?? Date.now(),
      thumbnail
    }
    setRecents((previous) => {
      const next = [entry, ...previous.filter((item) => item.path !== path)].slice(0, 12)
      saveRecents(next)
      return next
    })
  }

  const runScribeImport = async (path: string): Promise<void> => {
    setBusy('正在导入 VideoScribe 工程…')
    await new Promise((resolve) => setTimeout(resolve, 80))
    try {
      await importScribeFile(path)
      notify('已导入 VideoScribe 工程（morph 已改为描绘）')
    } catch (error) {
      notify(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleOpen = async (): Promise<void> => {
    const paths = await window.newscribe.openDialog({
      title: '打开工程或导入 VideoScribe',
      filters: [
        { name: 'NewScribe 工程', extensions: ['nscribe', 'nspkg'] },
        { name: 'NewScribe 本地工程', extensions: ['nscribe'] },
        { name: 'NewScribe 分享工程', extensions: ['nspkg'] },
        { name: 'VideoScribe 工程', extensions: ['scribe'] }
      ]
    })
    const path = paths[0]
    if (!path) return
    if (dirty && !window.confirm('当前工程有未保存的修改，确定打开其它工程吗？')) return

    if (path.toLowerCase().endsWith('.scribe')) {
      if (!localStorage.getItem('newscribe.scribeWarningSeen')) {
        setScribeWarningPath(path)
        return
      }
      await runScribeImport(path)
      return
    }

    setBusy('正在打开工程…')
    try {
      const result = await openProjectPath(path)
      if (!result.ok) {
        setOpenError(
          `文件格式不受支持或已经损坏。\n\n${result.error ?? '无法读取工程数据。'}`
        )
        return
      }
      if (result.missing.length > 0) {
        notify(`有 ${result.missing.length} 个素材找不到，已用占位框代替`)
      }
      notifyRecovered(result.recoveredFromBackup)
      void rememberProject(path)
    } finally {
      setBusy(null)
    }
  }

  const openExternalFile = async (path: string): Promise<void> => {
    if (path.toLowerCase().endsWith('.scribe')) {
      if (!localStorage.getItem('newscribe.scribeWarningSeen')) {
        setScribeWarningPath(path)
        return
      }
      await runScribeImport(path)
      return
    }
    setBusy('正在打开工程…')
    try {
      const result = await openProjectPath(path)
      if (!result.ok) {
        setOpenError(
          `文件格式不受支持或已经损坏。\n\n${result.error ?? '无法读取工程数据。'}`
        )
        return
      }
      setHomeOpen(false)
      notifyRecovered(result.recoveredFromBackup)
      void rememberProject(path)
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    const file = new URLSearchParams(window.location.search).get('openFile')
    if (file) void openExternalFile(file)
    return window.newscribe.onOpenFile((path) => {
      void openExternalFile(path)
    })
  }, [])

  useEffect(() => {
    void window.newscribe.setMenuVisible(!homeOpen)
  }, [homeOpen])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!useEditorStore.getState().dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const performSave = async (
    options: { format?: ProjectFormat; saveAs?: boolean },
    after?: () => void
  ): Promise<void> => {
    try {
      const path = await saveProject(options)
      if (path) {
        notify(`已保存：${window.newscribe.path.basename(path)}`)
        void rememberProject(path)
        after?.()
      }
    } catch (error) {
      notify(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleSave = async (force = false, after?: () => void): Promise<void> => {
    const state = useEditorStore.getState()
    if (!state.filePath || force) {
      setSavePrompt({ saveAs: force, after })
      return
    }
    await performSave({}, after)
  }

  const chooseSaveFormat = async (format: ProjectFormat): Promise<void> => {
    const prompt = savePrompt
    setSavePrompt(null)
    await performSave({ format, saveAs: true }, prompt?.after)
  }

  const handleDrop = async (event: ReactDragEvent): Promise<void> => {
    event.preventDefault()
    setDragging(false)
    if (preview) return
    const files = Array.from(event.dataTransfer.files)

    for (const file of files) {
      let targetPath: string | null = null
      try {
        targetPath = window.newscribe.getPathForFile(file) || null
      } catch {
        targetPath = null
      }

      if (targetPath && targetPath.toLowerCase().endsWith('.lnk')) {
        const resolved = await window.newscribe.resolveShortcut(targetPath)
        if (!resolved) {
          notify('无法解析这个快捷方式')
          continue
        }
        targetPath = resolved
      }

      const name = targetPath ? window.newscribe.path.basename(targetPath) : file.name
      const extension = extOf(name)

      if (AUDIO_EXT.has(extension)) {
        if (useEditorStore.getState().project.audio) {
          const replace = window.confirm('当前已经有一段背景音乐，要替换吗？')
          if (!replace) continue
        }
        if (targetPath) await applyAudioFromPath(targetPath)
        else {
          try {
            const runtime = await assetFromFile(file)
            const state = useEditorStore.getState()
            state.registerAsset(runtime)
            state.setAudio(runtime.asset.id)
            notify(`已设置背景音乐：${runtime.asset.name}`)
          } catch (error) {
            notify(`导入音乐失败：${error instanceof Error ? error.message : String(error)}`)
          }
        }
        continue
      }

      if (!IMAGE_EXT.has(extension) && !isImportable(file)) continue

      try {
        const runtime = targetPath ? await assetFromPath(targetPath) : await assetFromFile(file)
        await placeAsset(runtime)
      } catch (error) {
        notify(`导入失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  actionsRef.current = {
    new: handleNew,
    home: () => {
      if (useEditorStore.getState().dirty) setLeavePromptOpen(true)
      else setHomeOpen(true)
    },
    open: () => void handleOpen(),
    save: () => void handleSave(false),
    'save-as': () => void handleSave(true),
    'save-and-quit': () => {
      void handleSave(false, () => {
        const state = useEditorStore.getState()
        if (state.filePath && !state.dirty) void window.newscribe.confirmClose()
      })
    },
    'import-image': () => void handleImport(),
    'import-audio': () => void handleImportAudio(),
    export: () => setExportOpen(true),
    undo: () => useEditorStore.getState().undo(),
    redo: () => useEditorStore.getState().redo(),
    copy: () => useEditorStore.getState().copySelected(),
    paste: () => void pasteExternal(),
    delete: () => useEditorStore.getState().deleteSelected(),
    'select-all': () => useEditorStore.getState().selectAll(),
    help: () => void window.newscribe.openHelp(settings.language),
    'check-updates': () => void window.newscribe.openExternal('https://github.com/eguersi/NewScribe/releases'),
    about: () => setAboutOpen(true),
    preferences: () => {
      setPrefsTab('general')
      setPrefsOpen(true)
    },
    'toggle-fullscreen': () => void window.newscribe.toggleFullscreen()
  }

  useEffect(() => window.newscribe.onMenuAction((action) => actionsRef.current[action]?.()), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (document.querySelector('.preview-overlay') || document.querySelector('.modal-backdrop')) {
        return
      }
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const state = useEditorStore.getState()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        state.redo()
      } else if (mod && key === 's') {
        event.preventDefault()
        void handleSave(event.shiftKey)
      } else if (mod && key === 'o') {
        event.preventDefault()
        void handleOpen()
      } else if (mod && key === 'n') {
        event.preventDefault()
        handleNew()
      } else if (mod && key === 'e') {
        event.preventDefault()
        setExportOpen(true)
      } else if (mod && key === 'c') {
        event.preventDefault()
        state.copySelected()
      } else if (mod && key === 'v') {
        event.preventDefault()
        void pasteExternal()
      } else if (mod && key === 'a') {
        event.preventDefault()
        state.selectAll()
      } else if (mod && key === 'p') {
        event.preventDefault()
        openPreview()
      } else if (!mod && (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_')) {
        event.preventDefault()
        const view = state.viewSize
        if (view.width <= 0 || view.height <= 0) return
        const factor = event.key === '-' || event.key === '_' ? 1 / 1.2 : 1.2
        const current = state.viewport
        const centerX = (view.width / 2 - current.tx) / current.scale
        const centerY = (view.height / 2 - current.ty) / current.scale
        const scale = Math.min(20, Math.max(0.04, current.scale * factor))
        state.setViewport({
          scale,
          tx: view.width / 2 - centerX * scale,
          ty: view.height / 2 - centerY * scale
        })
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const step = 64
        const current = state.viewport
        if (event.key === 'ArrowLeft') state.setViewport({ ...current, tx: current.tx + step })
        else if (event.key === 'ArrowRight') state.setViewport({ ...current, tx: current.tx - step })
        else if (event.key === 'ArrowUp') state.setViewport({ ...current, ty: current.ty + step })
        else state.setViewport({ ...current, ty: current.ty - step })
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedIds.length > 0) {
          event.preventDefault()
          state.deleteSelected()
        }
      } else if (event.key === 'Escape') {
        if (fullscreenRef.current) void window.newscribe.toggleFullscreen()
        else state.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const selected = project.elements.find((element) => element.id === selectedId)
  const themeCurrentLabel =
    settings.theme === 'dark' ? '深色模式' : settings.theme === 'light' ? '浅色模式' : '自动模式'
  const nextTheme =
    settings.theme === 'dark'
      ? 'light'
      : settings.theme === 'light'
        ? 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'light'
          : 'dark'
  const themeNextLabel = nextTheme === 'light' ? '浅色模式' : '深色模式'
  const zoomWarningText =
    viewport.scale > 12
      ? '当前缩放过大，元素显示可能出现问题'
      : viewport.scale < 0.1
        ? '当前缩放过小，元素显示可能出现问题'
        : null

  const showZoomTip = (target: HTMLElement): void => {
    if (!zoomWarningText) return
    if (zoomTipTimer.current) window.clearTimeout(zoomTipTimer.current)
    const rect = target.getBoundingClientRect()
    setZoomTip({
      left:
        rect.left > 280
          ? rect.left - 276
          : Math.min(window.innerWidth - 268, rect.right + 8),
      top: rect.bottom + 8,
      text: zoomWarningText
    })
  }

  const hideZoomTip = (): void => {
    if (zoomTipTimer.current) window.clearTimeout(zoomTipTimer.current)
    zoomTipTimer.current = window.setTimeout(() => setZoomTip(null), 2400)
  }

  return (
    <div
      className="editor"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return
        void handleDrop(event)
      }}
    >
      <header className={`toolbar ${settings.compactToolbar ? 'compact' : ''}`}>
        <div className="toolbar-brand">
          <Logo />
          <div className="brand-text">
            <strong>NewScribe</strong>
            <span className="doc-name">
              {filePath ? window.newscribe.path.basename(filePath) : '未命名'}
              {dirty ? ' •' : ''}
            </span>
          </div>
        </div>

        <div className="toolbar-group">
          <button className="tool-btn file-btn" onClick={handleNew} title="新建工程"><Icon name="new-document" /><span className="toolbar-label">新建</span></button>
          <button className="tool-btn file-btn" onClick={() => void handleOpen()} title="打开工程"><Icon name="folder-open" /><span className="toolbar-label">打开</span></button>
          <button
            className="tool-btn file-btn"
            onClick={() => void handleSave(false)}
            disabled={project.elements.length === 0}
            title={project.elements.length === 0 ? '当前没有元素，请添加元素后再保存' : '保存工程'}
          >
            <Icon name="save" /><span className="toolbar-label">保存</span>
          </button>
        </div>

        <div className="toolbar-group">
          <button className="tool-btn primary" onClick={() => void handleImport()} title="导入素材"><Icon name="image" /><span className="toolbar-label full">导入素材</span><span className="toolbar-label short">导入</span></button>
          <button className="tool-btn" onClick={() => setLibraryOpen(true)} title="素材库"><Icon name="flower" /><span className="toolbar-label">库</span></button>
          <button className="tool-btn" onClick={handleAddText} title="添加文字"><Icon name="text" /><span className="toolbar-label">文字</span></button>
          <div className="toolbar-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
            <button
              className="tool-btn"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuPos({ left: rect.left, top: rect.bottom + 4 })
                setToolbarMenu(toolbarMenu === 'chart' ? null : 'chart')
              }}
              title="插入图表、表格或思维导图"
            >
              <Icon name="chart" /><span className="toolbar-label">图表</span><span className="menu-caret">▾</span>
            </button>
            {toolbarMenu === 'chart' && (
              <div className="toolbar-menu" style={menuPos ? { left: menuPos.left, top: menuPos.top } : undefined}>
                <button onClick={() => { useEditorStore.getState().addTable(); setToolbarMenu(null) }}>
                  <Icon name="table" /><span>表格</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addChart('bar'); setToolbarMenu(null) }}>
                  <Icon name="histogram" /><span>直方图</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addChart('line'); setToolbarMenu(null) }}>
                  <Icon name="line_chart" /><span>折线图</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addChart('pie'); setToolbarMenu(null) }}>
                  <Icon name="pie_chart" /><span>饼图</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addMindMap(); setToolbarMenu(null) }}>
                  <Icon name="mind_map" /><span>思维导图</span>
                </button>
              </div>
            )}
          </div>
          <div className="toolbar-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
            <button
              className="tool-btn"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuPos({ left: rect.left, top: rect.bottom + 4 })
                setToolbarMenu(toolbarMenu === 'shape' ? null : 'shape')
              }}
              title="插入图形"
            >
              <Icon name="shape" /><span className="toolbar-label">形状</span><span className="menu-caret">▾</span>
            </button>
            {toolbarMenu === 'shape' && (
              <div className="toolbar-menu shape-menu" style={menuPos ? { left: menuPos.left, top: menuPos.top } : undefined}>
                <div className="shape-menu-grid">
                  {([
                    ['rectangle', '矩形', 'rectangle'],
                    ['triangle', '三角形', 'triangle'],
                    ['parallelogram', '平行四边形', 'parallelogram'],
                    ['trapezoid', '梯形', 'trapezoid'],
                    ['circle', '圆形', 'circle'],
                    ['arrow_shape', '箭状', 'arrow_shape'],
                    ['star', '星形', 'star'],
                    ['heart', '爱心型', 'heart'],
                    ['arrow', '箭头', 'arrow'],
                    ['line', '直线', 'line-segment'],
                    ['freeform', '不规则', 'freeform']
                  ] as Array<[ShapeKind, string, string]>).map(([kind, label, icon]) => {
                    return (
                      <button
                        key={kind}
                        title={label}
                        onClick={() => {
                          setToolbarMenu(null)
                          if (kind === 'freeform') {
                            const state = useEditorStore.getState()
                            const scale = Math.max(0.02, state.viewport.scale)
                            const view = state.viewSize
                            const width =
                              view.width > 0
                                ? (view.width * 0.3) / scale
                                : Math.min(420, state.project.canvas.width * 0.32)
                            const height = width * 0.7
                            const center =
                              view.width > 0
                                ? screenToWorld(state.viewport, view.width / 2, view.height / 2)
                                : { x: state.project.canvas.width / 2, y: state.project.canvas.height / 2 }
                            state.addShape(
                              {
                                x: center.x - width / 2,
                                y: center.y - height / 2,
                                width,
                                height
                              },
                              'freeform'
                            )
                            const id = useEditorStore.getState().selectedId
                            if (id) useEditorStore.getState().openShapeEditor(id)
                          } else {
                            useEditorStore.getState().startShape(kind)
                          }
                        }}
                      >
                        <Icon name={icon as never} />
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="toolbar-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
            <button
              className="tool-btn"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuPos({ left: rect.left, top: rect.bottom + 4 })
                setToolbarMenu(toolbarMenu === 'other' ? null : 'other')
              }}
              title="其他元素"
            >
              <Icon name="infinity_symbol" /><span className="toolbar-label">其他</span><span className="menu-caret">▾</span>
            </button>
            {toolbarMenu === 'other' && (
              <div className="toolbar-menu" style={menuPos ? { left: menuPos.left, top: menuPos.top } : undefined}>
                <button onClick={() => { useEditorStore.getState().addMath(); setToolbarMenu(null) }}>
                  <Icon name="epsilon" /><span>公式</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addMolecule(); setToolbarMenu(null) }}>
                  <Icon name="benzene" /><span>分子结构</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addIpa(); setToolbarMenu(null) }}>
                  <Icon name="ipa" /><span>IPA</span>
                </button>
                <button onClick={() => { useEditorStore.getState().addQr(); setToolbarMenu(null) }}>
                  <Icon name="qrcode" /><span>二维码</span>
                </button>
                <button onClick={() => { useEditorStore.getState().startMask(); setToolbarMenu(null) }}>
                  <Icon name="mask" /><span>蒙版</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-group">
          <button className="tool-btn" disabled={past.length === 0} onClick={() => useEditorStore.getState().undo()} title="撤销">
            <Icon name="undo" /><span className="toolbar-label">撤销</span>
          </button>
          <button className="tool-btn" disabled={future.length === 0} onClick={() => useEditorStore.getState().redo()} title="重做">
            <Icon name="redo" /><span className="toolbar-label">重做</span>
          </button>
          <button
            className="tool-btn"
            disabled={selectedIds.length === 0}
            onClick={() => {
              const store = useEditorStore.getState()
              if (selectedIds.length > 1) store.pinCameraMany()
              else if (selectedIds.length === 1) store.pinCamera(selectedIds[0])
            }}
            title="固定为当前视角"
          >
            <Icon name="camera-frame" /><span className="toolbar-label full">固定视角</span><span className="toolbar-label short">固定</span>
          </button>
          <button
            className="tool-btn"
            disabled={selectedIds.length === 0}
            onClick={() => {
              const store = useEditorStore.getState()
              const id = selectedIds[selectedIds.length - 1]
              if (id) store.recallCamera(id)
            }}
            title="回到当前元素机位"
          >
            <Icon name="camera-return" /><span className="toolbar-label full">回机位</span><span className="toolbar-label short">机位</span>
          </button>
        </div>

        <div className="toolbar-spacer" />

        {zoomWarningText && (
          <span
            className="zoom-warning"
            tabIndex={0}
            aria-label={zoomWarningText}
            onMouseEnter={(event) => showZoomTip(event.currentTarget)}
            onMouseLeave={hideZoomTip}
            onFocus={(event) => showZoomTip(event.currentTarget)}
            onBlur={hideZoomTip}
          >
            <Icon name="warning_triangle" size={14} />
          </span>
        )}
        <span className="zoom-label">{(viewport.scale * 100).toFixed(0)}%</span>
        <button
          className="tool-btn theme-toggle"
          title={`当前为${themeCurrentLabel}，点击切换为${themeNextLabel}`}
          onClick={() => {
            const next = { ...settings, theme: nextTheme } as AppSettings
            setSettings(next)
            saveSettings(next)
          }}
        >
          <Icon name="appearance" />
        </button>
        <button className="tool-btn text-btn" onClick={() => useEditorStore.getState().fitView()} title="适应窗口">
          <Icon name="fit-window" /><span className="toolbar-label full">适应窗口</span><span className="toolbar-label short">适应</span>
        </button>
        <button className="tool-btn text-btn" onClick={() => void window.newscribe.toggleFullscreen()} title={fullscreen ? '退出全屏' : '全屏'}>
          <Icon name="fullscreen" /><span className="toolbar-label">{fullscreen ? '退出全屏' : '全屏'}</span>
        </button>
        <button
          className="tool-btn primary"
          disabled={project.elements.length === 0}
          title={
            project.elements.length === 0
              ? '当前没有元素，请添加元素后再预览'
              : selectedIds.length === 0
                ? '当前没有选中元素，将从开头预览'
                : '从选中元素开始预览'
          }
          onClick={() => openPreview(selectedIds[selectedIds.length - 1])}
        >
          <Icon name="eye" /><span className="toolbar-label full">从当前预览</span><span className="toolbar-label short">预览</span>
        </button>
        <button
          className="tool-btn"
          onClick={() => openPreview()}
          disabled={project.elements.length === 0}
          title={project.elements.length === 0 ? '当前没有元素，请添加元素后再预览' : '从开头预览'}
        >
          <Icon name="preview-start" /><span className="toolbar-label">从头预览</span>
        </button>
        <button
          className="tool-btn primary"
          onClick={() => setExportOpen(true)}
          disabled={project.elements.length === 0}
          title="导出视频"
        >
          <Icon name="export" /><span className="toolbar-label">导出</span>
        </button>
      </header>

      {missing.length > 0 && (
        <div className="banner warn">
          <strong>素材丢失</strong>
          {missing.map((assetId) => {
            const asset = project.assets.find((item) => item.id === assetId)
            return (
              <span className="missing-item" key={assetId}>
                {asset?.name ?? assetId}
                <button className="mini-btn" onClick={() => void handleRelink(assetId)}>
                  重新定位
                </button>
              </span>
            )
          })}
          <button className="mini-btn" onClick={() => useEditorStore.getState().setMissing([])}>
            忽略
          </button>
        </div>
      )}

      <div className="editor-main">
        <CanvasStage
          lightMode={settings.theme === 'light'}
          showCanvasOutside={settings.showCanvasOutside}
          onPreviewFrom={(id) => openPreview(id)}
          onPreviewStart={() => openPreview()}
        />
        <Inspector onPreviewFrom={(id) => openPreview(id)} onImportAudio={() => void handleImportAudio()} />
      </div>

      <TimelineStrip onPreviewFrom={(id) => openPreview(id)} />

      <footer className="statusbar">
        <span>画布 {project.canvas.width} × {project.canvas.height}</span>
        <span>元素 {project.elements.length}</span>
        <span>{selected ? `已选中：#${project.elements.indexOf(selected) + 1}` : '滚轮缩放 · 拖空白处平移 · 右键更多操作'}</span>
        <span className="statusbar-spacer" />
        <span className="status-dim">P4 · 音乐与导出</span>
      </footer>

      {dragging && <div className="drop-overlay">松开以导入素材</div>}
      {toast && <div className="toast">{toast}</div>}
      {zoomTip && (
        <div
          className="zoom-warning-tip"
          style={{
            left: Math.min(zoomTip.left, Math.max(8, window.innerWidth - 280)),
            top: zoomTip.top
          }}
        >
          {zoomTip.text}
        </div>
      )}
      {fullscreen && (
        <button className="fullscreen-exit" onClick={() => void window.newscribe.toggleFullscreen()}>
          退出全屏（Esc）
        </button>
      )}
      {preview && (
        <PreviewOverlay
          project={project}
          assets={assets}
          startTime={preview.start}
          autoPlay={preview.autoPlay}
          onClose={() => setPreview(null)}
        />
      )}
      {savePrompt && (
        <SaveFormatDialog
          saveAs={savePrompt.saveAs}
          onChoose={(format) => void chooseSaveFormat(format)}
          onExport={() => {
            setSavePrompt(null)
            setExportOpen(true)
          }}
          onCancel={() => setSavePrompt(null)}
        />
      )}
      {exportOpen && (
        <ExportDialog
          project={project}
          assets={assets}
          defaultName={filePath ? window.newscribe.path.basename(filePath) : '未命名'}
          defaults={{
            quality: settings.exportQuality,
            fps: settings.exportFps,
            customWidth: settings.exportCustomWidth,
            customHeight: settings.exportCustomHeight,
            exportDirectory: settings.exportDirectory
          }}
          onClose={() => setExportOpen(false)}
          onExported={(path) => {
            notify(`已导出：${window.newscribe.path.basename(path)}`)
            if (settings.openFolderAfterExport) void window.newscribe.showItemInFolder(path)
          }}
        />
      )}
      {libraryOpen && (
        <LibraryDialog
          sources={settings.networkSources}
          onToggleSource={(key, value) => {
            const next = {
              ...settings,
              networkSources: { ...settings.networkSources, [key]: value }
            }
            setSettings(next)
            saveSettings(next)
          }}
          onClose={() => setLibraryOpen(false)}
          onOpenAiConfig={() => {
            setLibraryOpen(false)
            setPrefsTab('ai')
            setPrefsOpen(true)
          }}
          onPickRemote={(asset) => {            setLibraryOpen(false)
            void (async () => {
              try {
                const extension =
                  asset.format === 'svg' ? 'svg' : asset.format === 'png' ? 'png' : 'jpg'
                const base = asset.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
                const name = base.toLowerCase().endsWith(`.${extension}`)
                  ? base
                  : `${base}.${extension}`
                const path = await window.newscribe.cacheWebAsset(asset.downloadUrl, name)
                const bytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
                const mime =
                  extension === 'svg'
                    ? 'image/svg+xml'
                    : extension === 'png'
                      ? 'image/png'
                      : 'image/jpeg'
                const runtime = await createAssetRuntime({ name, mime, bytes })
                await placeAsset(runtime)
                void window.newscribe.addRecentAsset({ path, name })
              } catch (error) {
                notify(`下载失败：${error instanceof Error ? error.message : String(error)}`)
              }
            })()
          }}
          onPickAi={(svg, name) => {
            setLibraryOpen(false)
            void (async () => {
              try {
                const bytes = new TextEncoder().encode(svg)
                const runtime = await createAssetRuntime({
                  name: name || 'prompt.svg',
                  mime: 'image/svg+xml',
                  bytes
                })
                await placeAsset(runtime)
              } catch (error) {
                notify(`插入失败：${error instanceof Error ? error.message : String(error)}`)
              }
            })()
          }}
          onPick={(path) => {
            setLibraryOpen(false)
            void (async () => {
              try {
                const runtime = await assetFromPath(path)
                const fromVideoScribe = /VideoScribeDesktop/i.test(path)
                await placeAsset(runtime, { strokeOnly: fromVideoScribe })
              } catch (error) {
                notify(`导入失败：${error instanceof Error ? error.message : String(error)}`)
              }
            })()
          }}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {shapeEditorId && (
        <ShapeEditorDialog elementId={shapeEditorId} onClose={() => closeShapeEditor()} />
      )}
      {newPromptOpen && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>未保存的修改</h2>
            <p className="modal-text">当前工程有未保存的修改，要先保存再新建吗？</p>
            <div className="modal-actions">
              <button className="tool-btn" onClick={() => setNewPromptOpen(false)}>取消</button>
              <button className="tool-btn" onClick={discardAndNew}>不保存直接新建</button>
              <button className="tool-btn primary" onClick={() => void saveAndNew()}>保存并新建</button>
            </div>
          </div>
        </div>
      )}
      {leavePromptOpen && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>未保存的修改</h2>
            <p className="modal-text">当前工程有未保存的修改，要先保存再返回导航页吗？</p>
            <div className="modal-actions">
              <button className="tool-btn" onClick={() => setLeavePromptOpen(false)}>取消</button>
              <button
                className="tool-btn"
                onClick={() => {
                  setLeavePromptOpen(false)
                  setHomeOpen(true)
                }}
              >
                不保存返回
              </button>
              <button
                className="tool-btn primary"
                onClick={() => {
                  void handleSave(false, () => {
                    if (!useEditorStore.getState().dirty) {
                      setLeavePromptOpen(false)
                      setHomeOpen(true)
                    }
                  })
                }}
              >
                保存并返回
              </button>
            </div>
          </div>
        </div>
      )}
      {scribeWarningPath && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>VideoScribe 导入（实验性）</h2>
            <p className="modal-text">
              VideoScribe 工程格式是逆向解析的，和 NewScribe 的结构差异很大。
              导入后可能出现图形拉伸、位置偏移、机位缩放不准、字体替换、
              自定义手势丢失等问题；复杂运镜和 morph 会被简化或改成描绘。
            </p>
            <p className="modal-text">
              导入结果只会保存为 .nscribe，不会修改原始 .scribe 文件。
              请先预览确认，再继续制作。
            </p>
            <div className="modal-actions">
              <button className="tool-btn" onClick={() => setScribeWarningPath(null)}>取消</button>
              <button
                className="tool-btn primary"
                onClick={() => {
                  localStorage.setItem('newscribe.scribeWarningSeen', '1')
                  const path = scribeWarningPath
                  setScribeWarningPath(null)
                  if (path) void runScribeImport(path)
                }}
              >
                仍要继续
              </button>
            </div>
          </div>
        </div>
      )}
      {prefsOpen && (
        <PreferencesDialog
          initialTab={prefsTab as 'general' | 'defaults' | 'startup' | 'library' | 'ai'}
          initial={settings}
          onClose={(next) => {
            setSettings(next)
            setPrefsOpen(false)
          }}
        />
      )}
      {busy && (
        <div className="modal-backdrop busy-backdrop">
          <div className="modal busy-modal">
            <h2>{busy}</h2>
            <p className="modal-text">文件较大时可能需要几秒钟，请不要关闭窗口。</p>
          </div>
        </div>
      )}
      {openError && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>无法打开工程</h2>
            <p className="modal-text" style={{ whiteSpace: 'pre-wrap' }}>{openError}</p>
            <div className="modal-actions">
              <button className="tool-btn primary" onClick={() => setOpenError(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {homeOpen && (
        <HomeScreen
          recents={recents}
          onOpenPath={(path) => {
            void (async () => {
              setBusy('正在打开工程…')
              try {
                const result = await openProjectPath(path)
                if (!result.ok) {
                  setHomeOpen(true)
                  setOpenError(
                    `文件格式不受支持或已经损坏。\n\n${result.error ?? '无法读取工程数据。'}`
                  )
                } else {
                  setHomeOpen(false)
                  notifyRecovered(result.recoveredFromBackup)
                  void rememberProject(path)
                }
              } finally {
                setBusy(null)
              }
            })()
          }}
          onOpenDialog={() => {
            setHomeOpen(false)
            void handleOpen()
          }}
          onNew={() => {
            setHomeOpen(false)
            handleNew()
          }}
          onHelp={() => void window.newscribe.openHelp(settings.language)}
          onScan={async () => {
            const found = await window.newscribe.scanProjects()
            const enriched = await Promise.all(
              found.map(async (item, index) => {
                if (index >= 40 || item.path.toLowerCase().endsWith('.nspkg')) return item
                try {
                  const text = await window.newscribe.fs.readText(item.path)
                  const parsed = JSON.parse(text) as { thumbnail?: string }
                  return { ...item, thumbnail: parsed.thumbnail }
                } catch {
                  return item
                }
              })
            )
            setRecents((previous) => {
              const map = new Map(previous.map((item) => [item.path, item]))
              for (const item of enriched) map.set(item.path, item)
              const next = [...map.values()]
                .sort((a, b) => b.modified - a.modified)
                .slice(0, 12)
              saveRecents(next)
              return next
            })
            return enriched
          }}
          onExportVideo={(path) => {
            void (async () => {
              const result = await openProjectPath(path)
              if (!result.ok) {
                setOpenError(
                  `文件格式不受支持或已经损坏。\n\n${result.error ?? '无法读取工程数据。'}`
                )
                return
              }
              setHomeOpen(false)
              setExportOpen(true)
            })()
          }}
          onShowLocation={(path) => void window.newscribe.showItemInFolder(path)}
          onExportAssets={(path) => {
            void (async () => {
              const result = await window.newscribe.exportProjectAssets(path)
              if (!result) return
              notify(`已导出 ${result.count} 个素材到：${result.target}`)
            })()
          }}
          onRemoveRecent={(path) => {
            setRecents((previous) => {
              const next = previous.filter((item) => item.path !== path)
              saveRecents(next)
              return next
            })
          }}
          onDeleteFile={(path) => {
            if (!window.confirm(`把工程文件移到回收站？\n\n${path}`)) return
            void (async () => {
              const ok = await window.newscribe.trashFile(path)
              if (!ok) return
              setRecents((previous) => {
                const next = previous.filter((item) => item.path !== path)
                saveRecents(next)
                return next
              })
            })()
          }}
          onClose={() => setHomeOpen(false)}
        />
      )}
    </div>
  )
}

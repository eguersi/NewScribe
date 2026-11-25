import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, nativeTheme, net, safeStorage, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type {
  DiagnosticsReport,
  OpenDialogRequest,
  RemoteAsset,
  SaveDialogRequest
} from '../shared/types'

interface LibraryEntry {
  id: string
  name: string
  path: string
}

interface LibraryState {
  libraries: LibraryEntry[]
  recentEnabled: boolean
  recent: Array<{ path: string; name: string; addedAt: number }>
}

const DEFAULT_LIBRARY_STATE: LibraryState = {
  libraries: [],
  recentEnabled: true,
  recent: []
}

function libraryStatePath(): string {
  return join(app.getPath('userData'), 'library-state.json')
}

async function readLibraryState(): Promise<LibraryState> {
  try {
    const text = await readFile(libraryStatePath(), 'utf8')
    const parsed = JSON.parse(text) as Partial<LibraryState>
    return {
      libraries: Array.isArray(parsed.libraries) ? parsed.libraries : [],
      recentEnabled: parsed.recentEnabled !== false,
      recent: Array.isArray(parsed.recent) ? parsed.recent : []
    }
  } catch {
    return { ...DEFAULT_LIBRARY_STATE }
  }
}

async function writeLibraryState(state: LibraryState): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(libraryStatePath(), JSON.stringify(state, null, 2), 'utf8')
}

const isDiagnose = process.argv.includes('--diagnose')
const isExportTest = process.argv.includes('--export-test')
const isPerfTest = process.argv.includes('--perf-test')
const isScreenshot = process.argv.includes('--screenshot')
const isPreviewShot = process.argv.includes('--screenshot-preview')
const isP3Shot = process.argv.includes('--screenshot-p3')
const isP3Bitmap = process.argv.includes('--screenshot-p3b')
const isFullscreenShot = process.argv.includes('--screenshot-fullscreen')
const isLightShot = process.argv.includes('--screenshot-light')
const importTestArg = process.argv.find((arg) => arg.startsWith('--import-test='))
const importTestPath = importTestArg ? importTestArg.slice('--import-test='.length) : null
const drawTestArg = process.argv.find((arg) => arg.startsWith('--draw-test='))
const drawTestPath = drawTestArg ? drawTestArg.slice('--draw-test='.length) : null
const isSvgTest = Boolean(importTestPath || drawTestPath)
const isAnyShot = isScreenshot || isPreviewShot || isP3Shot || isP3Bitmap

const shotTimeArg = process.argv.find((arg) => arg.startsWith('--shot-t='))
const shotNameArg = process.argv.find((arg) => arg.startsWith('--shot-name='))
const shotTime = shotTimeArg
  ? shotTimeArg.slice('--shot-t='.length)
  : isP3Bitmap
    ? '6.8'
    : isP3Shot
      ? '2.6'
      : '4.4'
const shotName = shotNameArg ? shotNameArg.slice('--shot-name='.length) : null
const fileArg =
  process.argv.find((arg) => /\.(nscribe|nspkg|scribe)$/i.test(arg) && !arg.startsWith('--')) ?? null

// Windows / Linux 通过命令行参数传文件，macOS 通过 open-file 事件传文件。
// 两边都先挂在这里，等窗口创建时消费一次。
let pendingOpenFile: string | null = fileArg

function ensureNspkgAssociation(): void {
  if (process.platform !== 'win32') return
  try {
    const progId = 'NewScribe.PackageProject'
    const command = app.isPackaged
      ? `"${process.execPath}" "%1"`
      : `"${process.execPath}" "${app.getAppPath()}" "%1"`
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'icon-nspkg-file.ico')
      : join(app.getAppPath(), 'build', 'icon-nspkg-file.ico')
    const reg = (args: string[]): void => {
      execFileSync('reg.exe', args, { windowsHide: true })
    }
    reg(['add', `HKCU\\Software\\Classes\\${progId}`, '/ve', '/d', 'NewScribe Share Project', '/f'])
    reg([
      'add',
      `HKCU\\Software\\Classes\\${progId}\\DefaultIcon`,
      '/ve',
      '/d',
      iconPath,
      '/f'
    ])
    reg([
      'add',
      `HKCU\\Software\\Classes\\${progId}\\shell\\open\\command`,
      '/ve',
      '/d',
      command,
      '/f'
    ])
    reg(['add', 'HKCU\\Software\\Classes\\.nspkg', '/ve', '/d', progId, '/f'])
  } catch {
    // 文件关联失败不影响应用启动
  }
}

let mainWindow: BrowserWindow | null = null
let welcomeWindow: BrowserWindow | null = null
let helpWindow: BrowserWindow | null = null
let welcomeFinished = false
let appLanguage: 'zh' | 'en' = 'zh'
let appTheme: 'dark' | 'light' = 'dark'
let appAccent = 'amber'
let diagnoseTimer: NodeJS.Timeout | null = null

function appIconPath(): string | undefined {
  const candidate = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}

const confirmedClose = new WeakSet<BrowserWindow>()

function stripHtml(value: string | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, '').trim()
}

async function searchRemote(source: string, query: string): Promise<RemoteAsset[]> {
  const keyword = query.trim()
  if (!keyword) return []
  if (source === 'iconify') {
    const response = await net.fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(keyword)}&limit=24`
    )
    if (!response.ok) return []
    const data = (await response.json()) as { icons?: string[] }
    return (data.icons ?? []).map((icon) => {
      const [prefix, name] = icon.split(':')
      const url = `https://api.iconify.design/${prefix}/${name}.svg`
      return {
        id: `iconify-${icon}`,
        source: 'Iconify',
        title: icon,
        previewUrl: url,
        downloadUrl: url,
        pageUrl: `https://icon-sets.iconify.design/${prefix}/?icon=${name}`,
        format: 'svg'
      }
    })
  }
  if (source === 'openverse') {
    const response = await net.fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(keyword)}&page_size=24`
    )
    if (!response.ok) return []
    const data = (await response.json()) as { results?: Array<Record<string, unknown>> }
    return (data.results ?? []).map((item, index) => ({
      id: `openverse-${String(item.id ?? index)}`,
      source: 'Openverse',
      title: String(item.title ?? 'Openverse image'),
      previewUrl: String(item.thumbnail ?? item.url ?? ''),
      downloadUrl: String(item.thumbnail ?? item.url ?? ''),
      pageUrl: String(item.foreign_landing_url ?? item.url ?? ''),
      author: String(item.creator ?? ''),
      license: String(item.license ?? ''),
      format: 'jpg'
    }))
  }
  if (source === 'wikimedia') {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: keyword,
      gsrlimit: '24',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '480'
    })
    const response = await net.fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (!response.ok) return []
    const data = (await response.json()) as {
      query?: { pages?: Record<string, Record<string, unknown>> }
    }
    const pages = Object.values(data.query?.pages ?? {})
    return pages.flatMap((page) => {
      const info = (page.imageinfo as Array<Record<string, unknown>> | undefined)?.[0]
      if (!info) return []
      const mime = String(info.mime ?? '')
      if (!mime.startsWith('image/')) return []
      const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>
      return [
        {
          id: `wikimedia-${String(page.pageid ?? page.title)}`,
          source: 'Wikimedia Commons',
          title: String(page.title ?? '').replace(/^File:/, ''),
          previewUrl: String(info.thumburl ?? info.url ?? ''),
          downloadUrl: String(info.url ?? ''),
          pageUrl: String(info.descriptionurl ?? ''),
          author: stripHtml(meta.Artist?.value),
          license: stripHtml(meta.LicenseShortName?.value),
          format: mime.includes('svg') ? 'svg' : 'jpg'
        }
      ]
    })
  }
  if (source === 'undraw') {
    const response = await net.fetch(
      `https://undraw.co/api/search?q=${encodeURIComponent(keyword)}`
    )
    if (!response.ok) return []
    const data = (await response.json()) as {
      results?: Array<{ _id?: string; title?: string; newSlug?: string; media?: string }>
    }
    return (data.results ?? []).map((item, index) => ({
      id: `undraw-${String(item._id ?? index)}`,
      source: 'UnDraw',
      title: String(item.title ?? 'UnDraw illustration'),
      previewUrl: String(item.media ?? ''),
      downloadUrl: String(item.media ?? ''),
      pageUrl: item.newSlug ? `https://undraw.co/illustrations/${item.newSlug}` : 'https://undraw.co/',
      format: 'svg'
    }))
  }
  if (source === 'qiuwen') {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: keyword,
      gsrlimit: '24',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '480'
    })
    const response = await net.fetch(`https://www.qiuwenbaike.cn/api.php?${params}`)
    if (!response.ok) return []
    const data = (await response.json()) as {
      query?: { pages?: Record<string, Record<string, unknown>> }
    }
    const pages = Object.values(data.query?.pages ?? {})
    return pages.flatMap((page) => {
      const info = (page.imageinfo as Array<Record<string, unknown>> | undefined)?.[0]
      if (!info) return []
      const mime = String(info.mime ?? '')
      if (!mime.startsWith('image/')) return []
      const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>
      return [
        {
          id: `qiuwen-${String(page.pageid ?? page.title)}`,
          source: 'qiuwenbaike',
          title: String(page.title ?? '').replace(/^File:/, ''),
          previewUrl: String(info.thumburl ?? info.url ?? ''),
          downloadUrl: String(info.url ?? ''),
          pageUrl: String(info.descriptionurl ?? ''),
          author: stripHtml(meta.Artist?.value),
          license: stripHtml(meta.LicenseShortName?.value),
          format: mime.includes('svg') ? 'svg' : 'jpg'
        }
      ]
    })
  }

  return []
}

interface AiConfig {
  baseURL: string
  model: string
  encryptedKey?: string
  saveToLibrary: boolean
}

const DEFAULT_AI_CONFIG: AiConfig = {
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  saveToLibrary: true
}

function aiConfigPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

async function readAiConfig(): Promise<AiConfig> {
  try {
    const parsed = JSON.parse(await readFile(aiConfigPath(), 'utf8')) as Partial<AiConfig>
    return { ...DEFAULT_AI_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

async function writeAiConfig(config: AiConfig): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(aiConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

function sanitizeSvg(source: string): string {
  const match = source.match(/<svg[\s\S]*?<\/svg>/i)
  if (!match) throw new Error('模型没有返回 SVG')
  return match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*"(?!(?:data:|#))[^"]*"/gi, '')
}

async function generateSvg(prompt: string): Promise<{ svg: string; path?: string }> {
  const config = await readAiConfig()
  if (!config.encryptedKey || !safeStorage.isEncryptionAvailable()) {
    throw new Error('还没有配置 API Key')
  }
  const key = safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64'))
  const response = await net.fetch(`${config.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are an SVG illustrator. Output only one complete <svg> element, no markdown, no explanation. Use viewBox="0 0 512 512", transparent background, pure vector shapes, no scripts, no event attributes, no external images, no foreignObject.'
        },
        { role: 'user', content: prompt }
      ]
    })
  })
  if (!response.ok) throw new Error(`AI 请求失败：HTTP ${response.status}`)
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const svg = sanitizeSvg(data.choices?.[0]?.message?.content ?? '')
  let path: string | undefined
  if (config.saveToLibrary) {
    const dir = join(app.getPath('userData'), 'AI-library')
    await mkdir(dir, { recursive: true })
    const base = prompt.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'ai-svg'
    path = join(dir, `${base}-${Date.now()}.svg`)
    await writeFile(path, svg, 'utf8')
  }
  return { svg, path }
}

function welcomeMarkerPath(): string {
  return join(app.getPath('userData'), 'welcome-seen')
}

function hasSeenWelcome(): boolean {
  return existsSync(welcomeMarkerPath())
}

function createWelcomeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 760,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    title: 'NewScribe',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setMenuBarVisibility(false)
  win.setAlwaysOnTop(true)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}?welcome=1`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { search: 'welcome=1' })
  }

  win.on('closed', () => {
    if (welcomeWindow === win) welcomeWindow = null
    if (!welcomeFinished && !mainWindow) app.quit()
  })
  return win
}

function openHelpWindow(language: 'zh' | 'en'): void {
  const lang = language === 'en' ? 'en' : 'zh'
  const root = app.isPackaged
    ? join(process.resourcesPath, 'help-web')
    : join(app.getAppPath(), 'docs', 'help-web')
  const target = join(root, lang, 'index.html')
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.setTitle(lang === 'en' ? 'NewScribe Help' : 'NewScribe 帮助')
    void helpWindow.loadFile(target)
    helpWindow.show()
    helpWindow.focus()
    return
  }

  const helpIcon = app.isPackaged
    ? join(process.resourcesPath, 'help-icon.png')
    : join(app.getAppPath(), 'build', 'help-icon.png')
  const helpIconImage = nativeImage.createFromPath(helpIcon)
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    parent: mainWindow ?? undefined,
    show: false,
    backgroundColor: '#f5f0e6',
    icon: helpIconImage,
    title: lang === 'en' ? 'NewScribe Help' : 'NewScribe 帮助',
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.setIcon(helpIconImage)
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })
  void win.loadFile(target)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (helpWindow === win) helpWindow = null
  })
  helpWindow = win
}

function createWindow(options?: { startHome?: boolean; showOnReady?: boolean }): BrowserWindow {
  // 打开工程的参数只消费一次：以后 activate / 欢迎页再建窗口就不该重复打开
  const openFile = pendingOpenFile
  pendingOpenFile = null

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0f13',
    title: 'NewScribe',
    icon: appIconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => {
    if (!isDiagnose && options?.showOnReady !== false) win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isFullscreenShot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win.setFullScreen(true), 600)
      setTimeout(() => {
        void (async () => {
          try {
            const image = await win.webContents.capturePage()
            const dir = join(app.getAppPath(), 'docs')
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, 'p5-fullscreen.png'), image.toPNG())
            console.log('[screenshot] fullscreen written')
          } catch (error) {
            console.error('[screenshot] fullscreen failed', error)
          }
          app.exit(0)
        })()
      }, 2800)
    })
  }

  if (isLightShot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          try {
            const image = await win.webContents.capturePage()
            const dir = join(app.getAppPath(), 'docs')
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, 'p1-light.png'), image.toPNG())
            console.log('[screenshot] light written')
          } catch (error) {
            console.error('[screenshot] light failed', error)
          }
          app.exit(0)
        })()
      }, 2600)
    })
  }

  if (isAnyShot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          try {
            const image = await win.webContents.capturePage()
            const dir = join(app.getAppPath(), 'docs')
            await mkdir(dir, { recursive: true })
            const name =
              shotName ??
              (isP3Shot
                ? 'p3-draw.png'
                : isP3Bitmap
                  ? 'p3-bitmap.png'
                  : isPreviewShot
                    ? 'p2-preview.png'
                    : 'p1-editor.png')
            await writeFile(join(dir, name), image.toPNG())
            console.log('[screenshot] written', name)
          } catch (error) {
            console.error('[screenshot] failed', error)
          }
          app.exit(0)
        })()
      }, 2600)
    })
  }

  if (isSvgTest) {
    const contents = win.webContents as unknown as {
      on(event: string, listener: (...args: any[]) => void): void
    }
    contents.on('console-message', (_event: any, ...rest: any[]) => {
      const details = rest[0]
      if (details && typeof details === 'object' && 'message' in details) {
        console.log('[renderer]', details.message)
      } else {
        console.log('[renderer]', ...rest)
      }
    })
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          try {
            const image = await win.webContents.capturePage()
            const dir = join(app.getAppPath(), 'docs')
            await mkdir(dir, { recursive: true })
            await writeFile(join(dir, drawTestPath ? 'draw-test.png' : 'import-test.png'), image.toPNG())
            console.log('[svg-test] screenshot written')
          } catch (error) {
            console.error('[svg-test] screenshot failed', error)
          }
          app.exit(0)
        })()
      }, drawTestPath ? 12_000 : 9_000)
    })
    setTimeout(
      () => {
        console.error('[svg-test] hard timeout')
        app.exit(3)
      },
      drawTestPath ? 30_000 : 20_000
    )
  }

  if (isExportTest) {
    const contents = win.webContents as unknown as {
      on(event: string, listener: (...args: any[]) => void): void
    }
    contents.on('console-message', (_event: any, ...rest: any[]) => {
      const details = rest[0]
      if (details && typeof details === 'object' && 'message' in details) {
        console.log('[renderer]', details.message)
      } else {
        console.log('[renderer]', ...rest)
      }
    })
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        console.error('[export-test] hard timeout')
        app.exit(3)
      }, 180_000)
    })
  }

  if (isPerfTest) {
    const contents = win.webContents as unknown as {
      on(event: string, listener: (...args: any[]) => void): void
    }
    contents.on('console-message', (_event: any, ...rest: any[]) => {
      const details = rest[0]
      if (details && typeof details === 'object' && 'message' in details) {
        console.log('[renderer]', details.message)
      } else {
        console.log('[renderer]', ...rest)
      }
    })
    setTimeout(() => {
      app.exit(0)
    }, 14_000)
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const previewQuery = `?demo=1&preview=1&t=${shotTime}`
  const testQuery = isExportTest
    ? '?exportTest=1'
    : isPerfTest
      ? '?demo=1&preview=1&autoplay=1&perf=1&t=0'
      : drawTestPath
        ? `?drawTest=${encodeURIComponent(drawTestPath)}`
        : importTestPath
          ? `?importTest=${encodeURIComponent(importTestPath)}`
          : null
  if (devUrl) {
    const query = testQuery ?? (
      isDiagnose
        ? '?diagnose=1'
        : isLightShot
          ? '?demo=1&theme=light'
          : isFullscreenShot
            ? '?demo=1'
            : isAnyShot && !isScreenshot
              ? previewQuery
              : isScreenshot
                ? '?demo=1'
                : ''
    )
    const extraQuery = [
      options?.startHome ? 'home=1' : '',
      openFile ? `openFile=${encodeURIComponent(openFile)}` : ''
    ]
      .filter(Boolean)
      .join('&')
    const finalQuery = extraQuery
      ? `${query}${query ? '&' : '?'}${extraQuery}`
      : query
    void win.loadURL(`${devUrl}${finalQuery}`)
  } else {
    const testSearch = testQuery ? testQuery.slice(1) : null
    const search = testSearch ?? (
      isDiagnose
        ? 'diagnose=1'
        : isLightShot
          ? 'demo=1&theme=light'
          : isFullscreenShot
            ? 'demo=1'
            : isAnyShot && !isScreenshot
              ? `demo=1&preview=1&t=${shotTime}`
              : isScreenshot
                ? 'demo=1'
                : undefined
    )
    const extraSearch = [
      options?.startHome ? 'home=1' : '',
      openFile ? `openFile=${encodeURIComponent(openFile)}` : ''
    ]
      .filter(Boolean)
      .join('&')
    const finalSearch = extraSearch
      ? `${search ? `${search}&` : ''}${extraSearch}`
      : search
    void win.loadFile(
      join(__dirname, '../renderer/index.html'),
      finalSearch ? { search: finalSearch } : undefined
    )
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('close', (event) => {
    if (confirmedClose.has(win)) return
    event.preventDefault()
    void (async () => {
      try {
        const dirty = await win.webContents.executeJavaScript(
          'window.__newscribeDirty === true'
        )
        if (!dirty) {
          confirmedClose.add(win)
          win.destroy()
          return
        }
        const result = await dialog.showMessageBox(win, {
          type: 'warning',
          title: mainText('未保存的修改', 'Unsaved changes'),
          message: mainText('当前工程有未保存的修改，要先保存吗？', 'This project has unsaved changes. Save before quitting?'),
          buttons: appLanguage === 'en' ? ['Cancel', 'Save and quit', 'Quit anyway'] : ['取消', '保存并退出', '仍然退出'],
          defaultId: 1,
          cancelId: 0
        })
        if (result.response === 1) {
          win.webContents.send('menu:action', 'save-and-quit')
        } else if (result.response === 2) {
          confirmedClose.add(win)
          win.destroy()
        }
      } catch {
        confirmedClose.add(win)
        win.destroy()
      }
    })()
  })

  win.on('enter-full-screen', () => {
    win.setMenuBarVisibility(true)
    win.webContents.send('window:fullscreen-changed', true)
  })
  win.on('leave-full-screen', () => {
    win.setMenuBarVisibility(true)
    win.webContents.send('window:fullscreen-changed', false)
  })

  if (isDiagnose) {
    const contents = win.webContents as unknown as {
      on(event: string, listener: (...args: any[]) => void): void
    }
    contents.on('console-message', (_event: any, ...rest: any[]) => {
      const details = rest[0]
      if (details && typeof details === 'object' && 'message' in details) {
        console.log('[renderer]', details.message)
      } else {
        console.log('[renderer]', ...rest)
      }
    })
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[window] did-fail-load', code, description, url)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[window] render-process-gone', details.reason)
    })
  }

  return win
}

function sendMenu(action: string): void {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow
  target?.webContents.send('menu:action', action)
}

const DIALOG_TITLES_EN: Record<string, string> = {
  选择素材库文件夹: 'Choose library folder',
  选择素材导出文件夹: 'Choose asset export folder',
  选择要搜索的文件夹: 'Choose folder to search',
  选择导出位置: 'Choose export location',
  选择默认导出文件夹: 'Choose default export folder',
  选择背景音乐: 'Choose background music',
  导出MP4: 'Export MP4',
  打开工程: 'Open project',
  保存工程: 'Save project',
  导入图片: 'Import image',
  选择文件夹: 'Choose folder'
}

function mainText(zh: string, en: string): string {
  return appLanguage === 'en' ? en : zh
}

function dialogTitle(title: string): string {
  return appLanguage === 'en' ? DIALOG_TITLES_EN[title] ?? title : title
}

function menuIcon(name: string): Electron.NativeImage | undefined {  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build')
  const themed = join(root, 'menu', appAccent, appTheme, `${name}.png`)
  const legacy = join(root, 'menu', `${name}.png`)
  const path = existsSync(themed) ? themed : legacy
  if (!existsSync(path)) return undefined
  const image = nativeImage.createFromPath(path)
  return image.isEmpty() ? undefined : image
}

function buildMenu(): void {
  const L = (zh: string, en: string): string => (appLanguage === 'en' ? en : zh)
  const isMac = process.platform === 'darwin'
  // macOS 的菜单栏按惯例显示 ⌘ 组合键，Windows 显示 Ctrl+
  const MOD = isMac ? '⌘' : 'Ctrl+'
  const SHIFT = isMac ? '⇧' : 'Shift+'
  const template: MenuItemConstructorOptions[] = [
    // macOS 第一个菜单由系统强制显示成应用名，必须是标准的 App 菜单；
    // 否则「文件」会被顶栏改名成 NewScribe，文件菜单看起来像消失了。
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: L('关于 NewScribe', 'About NewScribe'), click: () => sendMenu('about') },
              { type: 'separator' as const },
              {
                label: L('首选项…', 'Preferences…'),
                accelerator: 'Command+,',
                icon: menuIcon('settings'),
                click: () => sendMenu('preferences')
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: L('隐藏 NewScribe', 'Hide NewScribe') },
              { role: 'hideOthers' as const, label: L('隐藏其他', 'Hide Others') },
              { role: 'unhide' as const, label: L('全部显示', 'Show All') },
              { type: 'separator' as const },
              { role: 'quit' as const, label: L('退出 NewScribe', 'Quit NewScribe') }
            ]
          }
        ]
      : []),
    {
      label: L('文件', 'File'),
      submenu: [
        { label: L(`新建工程    ${MOD}N`, `New project    ${MOD}N`), icon: menuIcon('new-document'), click: () => sendMenu('new') },
        { label: L('返回导航页', 'Back to home'), icon: menuIcon('home'), click: () => sendMenu('home') },
        { label: L(`打开工程…    ${MOD}O`, `Open project…    ${MOD}O`), icon: menuIcon('folder-open'), click: () => sendMenu('open') },
        { label: L(`保存    ${MOD}S`, `Save    ${MOD}S`), icon: menuIcon('save'), click: () => sendMenu('save') },
        { label: L(`另存为…    ${MOD}${SHIFT}S`, `Save as…    ${MOD}${SHIFT}S`), icon: menuIcon('save_as'), click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: L('导入图片…', 'Import image…'), icon: menuIcon('image'), click: () => sendMenu('import-image') },
        { label: L('导入背景音乐…', 'Import background music…'), icon: menuIcon('music-notes'), click: () => sendMenu('import-audio') },
        { type: 'separator' },
        { label: L(`导出视频…    ${MOD}E`, `Export video…    ${MOD}E`), icon: menuIcon('export'), click: () => sendMenu('export') },
        // macOS 上「首选项」和「退出」在 App 菜单里，这里不再重复
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              { label: L('首选项…', 'Preferences…'), icon: menuIcon('settings'), click: () => sendMenu('preferences') },
              { type: 'separator' as const },
              { role: 'quit' as const, label: L('退出', 'Quit'), icon: menuIcon('power') }
            ])
      ]
    },
    {
      label: L('编辑', 'Edit'),
      submenu: [
        { label: L(`撤销    ${MOD}Z`, `Undo    ${MOD}Z`), icon: menuIcon('undo'), click: () => sendMenu('undo') },
        { label: L(`重做    ${MOD}${SHIFT}Z`, `Redo    ${MOD}${SHIFT}Z`), icon: menuIcon('redo'), click: () => sendMenu('redo') },
        { type: 'separator' },
        { label: L(`复制    ${MOD}C`, `Copy    ${MOD}C`), icon: menuIcon('copy'), click: () => sendMenu('copy') },
        { label: L(`粘贴    ${MOD}V`, `Paste    ${MOD}V`), icon: menuIcon('add-box'), click: () => sendMenu('paste') },
        { label: L('删除    Delete', 'Delete    Delete'), icon: menuIcon('trash'), click: () => sendMenu('delete') },
        { type: 'separator' },
        { label: L(`全选    ${MOD}A`, `Select all    ${MOD}A`), icon: menuIcon('circle-check'), click: () => sendMenu('select-all') }
      ]
    },
    {
      label: L('视图', 'View'),
      submenu: [
        {
          label: isMac
            ? L('全屏 / 退出全屏    ⌃⌘F', 'Fullscreen / Exit fullscreen    ⌃⌘F')
            : L('全屏 / 退出全屏    F11', 'Fullscreen / Exit fullscreen    F11'),
          icon: menuIcon('fullscreen'),
          accelerator: isMac ? 'Control+Command+F' : 'F11',
          click: () => sendMenu('toggle-fullscreen')
        },
        { type: 'separator' },
        { role: 'reload', label: L('重新加载', 'Reload'), icon: menuIcon('refresh-1') },
        { role: 'toggleDevTools', label: L('开发者工具', 'Developer tools'), icon: menuIcon('terminal') },
        { type: 'separator' },
        { role: 'resetZoom', label: L('实际大小', 'Actual size'), icon: menuIcon('fit-window') },
        { role: 'zoomIn', label: L('放大', 'Zoom in'), icon: menuIcon('plus') },
        { role: 'zoomOut', label: L('缩小', 'Zoom out'), icon: menuIcon('minus') }
      ]
    },
    {
      label: L('帮助', 'Help'),
      submenu: [
        { label: L('使用帮助', 'Help'), icon: menuIcon('help-circle'), click: () => sendMenu('help') },
        { label: L('检查更新', 'Check for updates'), icon: menuIcon('download'), click: () => sendMenu('check-updates') },
        { type: 'separator' },
        {
          label: L('关于 NewScribe', 'About NewScribe'),
          icon: menuIcon('appearance'),
          click: () => sendMenu('about')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('app:info', () => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale()
  }))

  ipcMain.handle('app:open-help', (_event, language: 'zh' | 'en') => {
    openHelpWindow(language === 'en' ? 'en' : 'zh')
  })

  ipcMain.handle('dialog:open', async (event, request: OpenDialogRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: dialogTitle(request.title ?? ''),
      filters: request.filters,
      properties: request.multiple ? ['openFile', 'multiSelections'] : ['openFile']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:save', async (event, request: SaveDialogRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      title: dialogTitle(request.title ?? ''),
      defaultPath: request.defaultPath,
      filters: request.filters
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    return result.canceled ? null : (result.filePath ?? null)
  })

  ipcMain.handle('diagnostics:clip', async (_event, data: ArrayBuffer) => {
    const dir = join(app.getAppPath(), '.diagnostics')
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'smoke.mp4')
    await writeFile(file, Buffer.from(data))
    return { saved: file }
  })

  ipcMain.handle('export:test', async (_event, data: ArrayBuffer) => {
    const dir = join(app.getAppPath(), '.diagnostics')
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'export-test.mp4')
    await writeFile(file, Buffer.from(data))
    console.log(`[export-test] saved ${file} (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`)
    if (isExportTest) setTimeout(() => app.exit(0), 400)
    return { saved: file }
  })

  ipcMain.handle('shell:show-item', async (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('clipboard:read-image', async () => {
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find((value) => value.startsWith('image/'))
      if (!type) continue
      try {
        const blob = (await item.getType(type)) as Blob
        const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()))
        if (!image.isEmpty()) return image.toDataURL()
      } catch {
        // 尝试下一个剪贴板条目
      }
    }
    return null
  })

  ipcMain.handle('clipboard:read-text', () => clipboard.readText())

  ipcMain.handle('clipboard:read-files', async () => {
    const found = new Set<string>()
    const items = await clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith('text/')) continue
        try {
          const blob = (await item.getType(type)) as Blob
          const text = await blob.text()
          for (const line of text.split(/\r?\n/)) {
            const value = line.trim()
            if (!value) continue
            if (value.startsWith('file://')) {
              try {
                const path = fileURLToPath(value)
                if (existsSync(path)) found.add(path)
              } catch {
                // 忽略非法 URI
              }
            } else if (/^[a-zA-Z]:[\\/]/.test(value) && existsSync(value)) {
              found.add(value)
            }
          }
        } catch {
          // 尝试下一个格式
        }
      }
    }
    return [...found]
  })

  ipcMain.handle('fs:stat', async (_event, path: string) => {
    try {
      const info = await stat(path)
      return { size: info.size, modified: info.mtimeMs }
    } catch {
      return null
    }
  })

  ipcMain.handle('library:choose', async () => {
    const result = await dialog.showOpenDialog({ title: dialogTitle('选择素材库文件夹'), properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('library:state', () => readLibraryState())

  ipcMain.handle(
    'library:add',
    async (_event, entry: { name: string; path: string }) => {
      const state = await readLibraryState()
      const normalized = entry.path.toLowerCase()
      if (state.libraries.some((item) => item.path.toLowerCase() === normalized)) {
        return { ok: false, reason: 'duplicate' as const, state }
      }
      state.libraries.push({ id: randomUUID(), name: entry.name, path: entry.path })
      await writeLibraryState(state)
      return { ok: true as const, state }
    }
  )

  ipcMain.handle('library:remove', async (_event, id: string) => {
    const state = await readLibraryState()
    state.libraries = state.libraries.filter((item) => item.id !== id)
    await writeLibraryState(state)
    return state
  })

  ipcMain.handle('library:reorder', async (_event, ids: string[]) => {
    const state = await readLibraryState()
    const order = new Map(ids.map((id, index) => [id, index]))
    state.libraries.sort(
      (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    )
    await writeLibraryState(state)
    return state
  })

  ipcMain.handle('library:recent-add', async (_event, entry: { path: string; name: string }) => {
    const state = await readLibraryState()
    if (!state.recentEnabled || !entry.path) return state
    state.recent = [
      { path: entry.path, name: entry.name, addedAt: Date.now() },
      ...state.recent.filter((item) => item.path !== entry.path)
    ].slice(0, 40)
    await writeLibraryState(state)
    return state
  })

  ipcMain.handle('library:recent-remove', async (_event, path: string) => {
    const state = await readLibraryState()
    state.recent = state.recent.filter((item) => item.path !== path)
    await writeLibraryState(state)
    return state
  })

  ipcMain.handle('library:recent-enabled', async (_event, enabled: boolean) => {
    const state = await readLibraryState()
    state.recentEnabled = enabled
    await writeLibraryState(state)
    return state
  })

  ipcMain.handle('library:detect-videoscribe', async () => {
    const base = join(app.getPath('appData'), 'VideoScribeDesktop', 'Local Store')
    const cachesDir = join(base, 'Library', 'Caches')
    const caches: Array<{ name: string; path: string }> = []
    if (existsSync(cachesDir)) {
      try {
        const entries = await readdir(cachesDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            caches.push({ name: entry.name, path: join(cachesDir, entry.name) })
          }
        }
      } catch {
        // 忽略
      }
    }
    const favourites: Array<{ name: string; path: string }> = []
    for (const name of ['Favourites', 'Favourite']) {
      const path = join(base, 'Documents', name)
      if (existsSync(path)) favourites.push({ name, path })
    }
    return { caches, favourites }
  })

  ipcMain.handle('library:list', async (_event, folder: string) => {
    const extensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'])
    try {
      const entries = await readdir(folder, { withFileTypes: true })
      const files = []
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name.toLowerCase().endsWith('.thumb.png')) continue
        const extension = entry.name.split('.').pop()?.toLowerCase() ?? ''
        if (!extensions.has(extension)) continue
        const full = join(folder, entry.name)
        const info = await stat(full)
        files.push({ path: full, name: entry.name, size: info.size })
      }
      return files.sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  })

  const scribeProgId = 'NewScribe.ScribeProject'
  const runReg = (args: string[]): string =>
    execFileSync('reg.exe', args, { encoding: 'utf8', windowsHide: true })

  ipcMain.handle('app:scribe-associated', () => {
    if (process.platform !== 'win32') return false
    try {
      return runReg(['query', 'HKCU\\Software\\Classes\\.scribe', '/ve']).includes(scribeProgId)
    } catch {
      return false
    }
  })

  ipcMain.handle('app:scribe-association', (_event, enable: boolean) => {
    if (process.platform !== 'win32') return false
    try {
      if (enable) {
        const command = app.isPackaged
          ? `"${process.execPath}" "%1"`
          : `"${process.execPath}" "${app.getAppPath()}" "%1"`
        runReg(['add', `HKCU\\Software\\Classes\\${scribeProgId}`, '/ve', '/d', 'VideoScribe Project', '/f'])
        const iconPath = app.isPackaged
          ? join(process.resourcesPath, 'icon-scribe-file.ico')
          : join(app.getAppPath(), 'build', 'icon-scribe-file.ico')
        runReg([
          'add',
          `HKCU\\Software\\Classes\\${scribeProgId}\\DefaultIcon`,
          '/ve',
          '/d',
          iconPath,
          '/f'
        ])
        runReg([
          'add',
          `HKCU\\Software\\Classes\\${scribeProgId}\\shell\\open\\command`,
          '/ve',
          '/d',
          command,
          '/f'
        ])
        runReg(['add', 'HKCU\\Software\\Classes\\.scribe', '/ve', '/d', scribeProgId, '/f'])
      } else {
        try {
          runReg(['delete', 'HKCU\\Software\\Classes\\.scribe', '/ve', '/f'])
        } catch {
          // 本来就没有
        }
        try {
          runReg(['delete', `HKCU\\Software\\Classes\\${scribeProgId}`, '/f'])
        } catch {
          // 本来就没有
        }
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('web:search', async (_event, source: string, query: string) => {
    try {
      return await searchRemote(source, query)
    } catch {
      return []
    }
  })

  ipcMain.handle('web:download', async (_event, url: string) => {
    if (!/^https:\/\//i.test(url)) throw new Error('只支持 https 地址')
    const response = await net.fetch(url)
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    return await response.arrayBuffer()
  })

  ipcMain.handle('web:cache', async (_event, url: string, name: string) => {
    if (!/^https:\/\//i.test(url)) throw new Error('只支持 https 地址')
    const response = await net.fetch(url)
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const dir = join(app.getPath('userData'), 'library-cache')
    await mkdir(dir, { recursive: true })
    const safe = (name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'asset')
    const path = join(dir, `${randomUUID()}-${safe}`)
    await writeFile(path, bytes)
    return path
  })

  ipcMain.handle('ai:config', async () => {
    const config = await readAiConfig()
    return {
      baseURL: config.baseURL,
      model: config.model,
      saveToLibrary: config.saveToLibrary,
      hasKey: Boolean(config.encryptedKey)
    }
  })

  ipcMain.handle(
    'ai:config-set',
    async (
      _event,
      input: { baseURL: string; model: string; key?: string; saveToLibrary: boolean }
    ) => {
      const config = await readAiConfig()
      config.baseURL = input.baseURL || DEFAULT_AI_CONFIG.baseURL
      config.model = input.model || DEFAULT_AI_CONFIG.model
      config.saveToLibrary = input.saveToLibrary
      if (input.key) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('系统不支持安全存储')
        config.encryptedKey = safeStorage.encryptString(input.key).toString('base64')
      }
      await writeAiConfig(config)
      return { ok: true }
    }
  )

  ipcMain.handle('ai:clear-key', async () => {
    const config = await readAiConfig()
    config.encryptedKey = undefined
    await writeAiConfig(config)
    return { ok: true }
  })

  ipcMain.handle('ai:generate', async (_event, prompt: string) => generateSvg(prompt))

  ipcMain.handle('ai:library', async () => {
    const dir = join(app.getPath('userData'), 'AI-library')
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const files = []
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.svg')) continue
        const full = join(dir, entry.name)
        const info = await stat(full)
        files.push({ path: full, name: entry.name, size: info.size, modified: info.mtimeMs })
      }
      return files.sort((a, b) => b.modified - a.modified)
    } catch {
      return []
    }
  })

  ipcMain.handle('web:open', async (_event, url: string) => {
    if (/^https:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle('project:export-assets', async (_event, projectPath: string) => {
    const target = await dialog.showOpenDialog({
      title: dialogTitle('选择素材导出文件夹'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (target.canceled || !target.filePaths[0]) return null
    const targetDir = target.filePaths[0]
    try {
      const project = JSON.parse(await readFile(projectPath, 'utf8')) as {
        assets?: Array<{ name?: string; file?: string }>
      }
      let count = 0
      for (const asset of project.assets ?? []) {
        if (!asset.file) continue
        const source = /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(asset.file)
          ? asset.file
          : join(dirname(projectPath), asset.file)
        if (!existsSync(source)) continue
        const name = (asset.name ?? `asset-${count}`).replace(/[\\/:*?"<>|]/g, '_')
        const destination = join(targetDir, name)
        if (existsSync(destination)) continue
        await copyFile(source, destination)
        count += 1
      }
      return { count, target: targetDir }
    } catch {
      return null
    }
  })

  ipcMain.handle('app:welcome-start', () => {
    if (!mainWindow) {
      mainWindow = createWindow({ startHome: true, showOnReady: false })
    }
  })

  ipcMain.handle('app:welcome-done', async () => {
    welcomeFinished = true
    try {
      await writeFile(welcomeMarkerPath(), new Date().toISOString(), 'utf8')
    } catch {
      // 标记写入失败不影响本次启动
    }
    if (!mainWindow) mainWindow = createWindow({ startHome: true })
    welcomeWindow?.destroy()
    welcomeWindow = null
    mainWindow?.show()
  })

  ipcMain.handle('app:set-language', (_event, language: 'zh' | 'en') => {
    appLanguage = language === 'en' ? 'en' : 'zh'
    if (helpWindow && !helpWindow.isDestroyed()) openHelpWindow(appLanguage)
    buildMenu()
  })

  ipcMain.handle('app:set-appearance', (_event, theme: 'dark' | 'light', accent: string) => {
    appTheme = theme === 'light' ? 'light' : 'dark'
    appAccent = ['amber', 'blue', 'mint', 'violet', 'rose'].includes(accent) ? accent : 'amber'
    nativeTheme.themeSource = appTheme
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(appTheme === 'light' ? '#f5f6f8' : '#0a0c10')
    }
    buildMenu()
  })

  ipcMain.handle('app:videos-dir', () => app.getPath('videos'))

  ipcMain.handle('dialog:choose-folder', async (_event, title: string) => {
    const result = await dialog.showOpenDialog({
      title: dialogTitle(title || '选择文件夹'),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('window:menu-visible', (event, visible: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setMenuBarVisibility(visible)
  })

  ipcMain.handle('shell:trash', async (_event, path: string) => {
    try {
      await shell.trashItem(path)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('shell:open-file', async (_event, path: string) => {
    const error = await shell.openPath(path)
    return error === ''
  })

  ipcMain.handle(
    'video:metadata',
    async (
      _event,
      path: string,
      metadata: { title?: string; artist?: string; comment?: string }
    ) => {
      const temp = `${path.replace(/\.mp4$/i, '')}.meta.mp4`
      const args = ['-y', '-i', path, '-c', 'copy', '-map_metadata', '0']
      if (metadata.title) args.push('-metadata', `title=${metadata.title}`)
      if (metadata.artist) args.push('-metadata', `artist=${metadata.artist}`)
      if (metadata.comment) args.push('-metadata', `comment=${metadata.comment}`)
      args.push(temp)
      try {
        await promisify(execFile)('ffmpeg', args)
        await rename(temp, path)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('app:scan-projects', async () => {    const result = await dialog.showOpenDialog({
      title: dialogTitle('选择要搜索的文件夹'),
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return []
    const found: Array<{ path: string; name: string; size: number; modified: number }> = []
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (found.length >= 200 || depth > 6) return
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (found.length >= 200) break
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full, depth + 1)
        } else if (
          entry.isFile() &&
          (entry.name.toLowerCase().endsWith('.nscribe') ||
            entry.name.toLowerCase().endsWith('.nspkg'))
        ) {
          try {
            const info = await stat(full)
            found.push({ path: full, name: entry.name, size: info.size, modified: info.mtimeMs })
          } catch {
            // 忽略无法读取的文件
          }
        }
      }
    }
    await walk(result.filePaths[0], 0)
    return found
  })

  ipcMain.handle('window:close-confirmed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      confirmedClose.add(win)
      win.destroy()
    }
  })

  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setFullScreen(!win.isFullScreen())
  })

  ipcMain.handle('window:is-fullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  ipcMain.handle('shortcut:resolve', async (_event, path: string) => {
    if (process.platform !== 'win32') return null
    try {
      const link = shell.readShortcutLink(path)
      return link.target ?? null
    } catch {
      return null
    }
  })

  ipcMain.handle('diagnostics:done', async (event, report: DiagnosticsReport) => {
    const dir = join(app.getAppPath(), '.diagnostics')
    const file = join(dir, 'report.json')
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(file, JSON.stringify(report, null, 2), 'utf8')
      console.log(`[diagnose] report written to ${file}`)
    } catch (error) {
      console.error('[diagnose] failed to write report', error)
    }

    if (isDiagnose) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) win.showInactive()
      await new Promise((resolve) => setTimeout(resolve, 900))
      if (win) {
        try {
          const image = await win.webContents.capturePage()
          await writeFile(join(dir, 'p0.png'), image.toPNG())
          console.log('[diagnose] screenshot written')
        } catch (error) {
          console.error('[diagnose] screenshot failed', error)
        }
      }
      if (diagnoseTimer) clearTimeout(diagnoseTimer)
      setTimeout(() => app.exit(0), 300)
    }

    return { saved: file }
  })
}

// macOS 双击 .nscribe / .nspkg 时系统不是传命令行参数，而是发 open-file 事件。
// 应用还没就绪就先记下来，等创建窗口时再打开；已经在运行就直接送给渲染进程。
function openFileFromSystem(file: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('app:open-file', file)
    return
  }
  pendingOpenFile = file
  if (app.isReady()) {
    welcomeWindow?.destroy()
    welcomeWindow = null
    mainWindow = createWindow()
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!filePath) return
  if (!app.isReady()) {
    pendingOpenFile = filePath
    return
  }
  openFileFromSystem(filePath)
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = argv.find((arg) => /\.(nscribe|nspkg|scribe)$/i.test(arg))
    if (!file) return
    openFileFromSystem(file)
  })
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  app.setAppUserModelId('com.newscribe.app')
  if (process.platform === 'darwin' && !app.isPackaged) {
    // 开发模式跑的是 Electron 自己的包，Dock 会显示 Electron 图标，这里换成本应用的
    const devIcon = appIconPath()
    if (devIcon) app.dock?.setIcon(devIcon)
  }
  ensureNspkgAssociation()
  registerIpc()
  buildMenu()
  const showWelcome =
    !hasSeenWelcome() &&
    !pendingOpenFile &&
    !isAnyShot &&
    !isExportTest &&
    !isPerfTest &&
    !isDiagnose
  if (showWelcome) welcomeWindow = createWelcomeWindow()
  else mainWindow = createWindow()

  if (isDiagnose) {
    diagnoseTimer = setTimeout(() => {
      console.error('[diagnose] timed out after 90s')
      app.exit(2)
    }, 90_000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  DiagnosticsReport,
  NewScribeApi,
  OpenDialogRequest,
  SaveDialogRequest
} from '../shared/types'

const api: NewScribeApi = {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  finishDiagnostics: (report: DiagnosticsReport) => ipcRenderer.invoke('diagnostics:done', report),
  saveSmokeClip: (data: ArrayBuffer) => ipcRenderer.invoke('diagnostics:clip', data),
  saveExportTest: (data: ArrayBuffer) => ipcRenderer.invoke('export:test', data),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item', path),
  confirmClose: () => ipcRenderer.invoke('window:close-confirmed'),
  setMenuVisible: (visible: boolean) => ipcRenderer.invoke('window:menu-visible', visible),
  getVideosDir: () => ipcRenderer.invoke('app:videos-dir'),
  chooseDirectory: (title: string) => ipcRenderer.invoke('dialog:choose-folder', title),
  setAppLanguage: (language: 'zh' | 'en') => ipcRenderer.invoke('app:set-language', language),
  setAppearance: (theme: 'dark' | 'light', accent: string) =>
    ipcRenderer.invoke('app:set-appearance', theme, accent),
  finishWelcome: () => ipcRenderer.invoke('app:welcome-done'),
  startWelcome: () => ipcRenderer.invoke('app:welcome-start'),
  readClipboardImage: () => ipcRenderer.invoke('clipboard:read-image'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  readClipboardFiles: () => ipcRenderer.invoke('clipboard:read-files'),
  stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
  scanProjects: () => ipcRenderer.invoke('app:scan-projects'),
  chooseLibraryFolder: () => ipcRenderer.invoke('library:choose'),
  listLibrary: (folder: string) => ipcRenderer.invoke('library:list', folder),
  detectVideoScribe: () => ipcRenderer.invoke('library:detect-videoscribe'),
  getLibraryState: () => ipcRenderer.invoke('library:state'),
  addLibrary: (entry: { name: string; path: string }) => ipcRenderer.invoke('library:add', entry),
  removeLibrary: (id: string) => ipcRenderer.invoke('library:remove', id),
  reorderLibraries: (ids: string[]) => ipcRenderer.invoke('library:reorder', ids),
  addRecentAsset: (entry: { path: string; name: string }) =>
    ipcRenderer.invoke('library:recent-add', entry),
  removeRecentAsset: (path: string) => ipcRenderer.invoke('library:recent-remove', path),
  setRecentEnabled: (enabled: boolean) => ipcRenderer.invoke('library:recent-enabled', enabled),
  getScribeAssociation: () => ipcRenderer.invoke('app:scribe-associated'),
  setScribeAssociation: (enabled: boolean) => ipcRenderer.invoke('app:scribe-association', enabled),
  searchWeb: (source: string, query: string) => ipcRenderer.invoke('web:search', source, query),
  downloadWeb: (url: string) => ipcRenderer.invoke('web:download', url),
  cacheWebAsset: (url: string, name: string) => ipcRenderer.invoke('web:cache', url, name),
  openExternal: (url: string) => ipcRenderer.invoke('web:open', url),
  openHelp: (language: 'zh' | 'en') => ipcRenderer.invoke('app:open-help', language),
  exportProjectAssets: (path: string) => ipcRenderer.invoke('project:export-assets', path),
  trashFile: (path: string) => ipcRenderer.invoke('shell:trash', path),
  openFile: (path: string) => ipcRenderer.invoke('shell:open-file', path),
  setVideoMetadata: (
    path: string,
    metadata: { title?: string; artist?: string; comment?: string }
  ) => ipcRenderer.invoke('video:metadata', path, metadata),
  getAiConfig: () => ipcRenderer.invoke('ai:config'),
  setAiConfig: (input: { baseURL: string; model: string; key?: string; saveToLibrary: boolean }) =>
    ipcRenderer.invoke('ai:config-set', input),
  clearAiKey: () => ipcRenderer.invoke('ai:clear-key'),
  generateAiSvg: (prompt: string) => ipcRenderer.invoke('ai:generate', prompt),
  listAiLibrary: () => ipcRenderer.invoke('ai:library'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  onFullscreenChange: (callback) => {
    const listener = (_event: unknown, fullscreen: boolean): void => callback(fullscreen)
    ipcRenderer.on('window:fullscreen-changed', listener)
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener)
  },
  onOpenFile: (callback) => {
    const listener = (_event: unknown, path: string): void => callback(path)
    ipcRenderer.on('app:open-file', listener)
    return () => ipcRenderer.removeListener('app:open-file', listener)
  },
  onMenuAction: (callback) => {
    const listener = (_event: unknown, action: string): void => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
  getPathForFile: (file) => webUtils.getPathForFile(file as never),
  resolveShortcut: (path: string) => ipcRenderer.invoke('shortcut:resolve', path),
  openDialog: (request: OpenDialogRequest) => ipcRenderer.invoke('dialog:open', request),
  saveDialog: (request: SaveDialogRequest) => ipcRenderer.invoke('dialog:save', request),
  fs: {
    readText: (path) => readFile(path, 'utf8'),
    writeText: (path, text) => writeFile(path, text, 'utf8'),
    saveText: async (path, text, backup = true) => {
      const temp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      try {
        await writeFile(temp, text, 'utf8')
        let hasExisting = false
        try {
          await access(path)
          hasExisting = true
        } catch {
          // 首次保存没有旧文件
        }
        if (hasExisting && backup) {
          await copyFile(path, `${path}.bak`)
        }
        await rename(temp, path)
      } catch (error) {
        await unlink(temp).catch(() => undefined)
        throw error
      }
    },
    readBinary: async (path) => {
      const buffer = await readFile(path)
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    },
    writeBinary: async (path, data) => {
      await writeFile(path, Buffer.from(data))
    },
    saveBinary: async (path, data, backup = true) => {
      const temp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      try {
        await writeFile(temp, Buffer.from(data))
        let hasExisting = false
        try {
          await access(path)
          hasExisting = true
        } catch {
          // 首次保存
        }
        if (hasExisting && backup) await copyFile(path, `${path}.bak`)
        await rename(temp, path)
      } catch (error) {
        await unlink(temp).catch(() => undefined)
        throw error
      }
    },
    remove: async (path) => {
      await unlink(path).catch(() => undefined)
    },
    exists: async (path) => {
      try {
        await access(path)
        return true
      } catch {
        return false
      }
    },
    mkdir: async (path) => {
      await mkdir(path, { recursive: true })
    }
  },
  path: { join, dirname, basename }
}

contextBridge.exposeInMainWorld('newscribe', api)

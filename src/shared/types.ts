export interface LibraryEntry {
  id: string
  name: string
  path: string
}

export interface LibraryState {
  libraries: LibraryEntry[]
  recentEnabled: boolean
  recent: Array<{ path: string; name: string; addedAt: number }>
}

export interface RemoteAsset {
  id: string
  source: string
  title: string
  previewUrl: string
  downloadUrl: string
  pageUrl: string
  author?: string
  license?: string
  format: string
}

export interface AppInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  locale: string
}

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  detail: string
  ms?: number
}

export interface DiagnosticsReport {
  createdAt: string
  app: AppInfo
  checks: CheckResult[]
  summary: string
  verdict: 'ready' | 'degraded' | 'blocked'
}

export interface SaveReportResult {
  saved: string
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogRequest {
  title?: string
  filters?: FileFilter[]
  multiple?: boolean
}

export interface SaveDialogRequest {
  title?: string
  defaultPath?: string
  filters?: FileFilter[]
}

export interface FileSystemApi {
  readText(path: string): Promise<string>
  writeText(path: string, text: string): Promise<void>
  /** 临时文件 + rename 原子替换，并保留上一版 .bak */
  saveText(path: string, text: string, backup?: boolean): Promise<void>
  readBinary(path: string): Promise<ArrayBuffer>
  writeBinary(path: string, data: ArrayBuffer): Promise<void>
  saveBinary(path: string, data: ArrayBuffer, backup?: boolean): Promise<void>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export interface PathApi {
  join(...parts: string[]): string
  dirname(path: string): string
  basename(path: string): string
}

export interface NewScribeApi {
  getAppInfo(): Promise<AppInfo>
  finishDiagnostics(report: DiagnosticsReport): Promise<SaveReportResult>
  saveSmokeClip(data: ArrayBuffer): Promise<{ saved: string }>
  saveExportTest(data: ArrayBuffer): Promise<{ saved: string }>
  openDialog(request: OpenDialogRequest): Promise<string[]>
  saveDialog(request: SaveDialogRequest): Promise<string | null>
  showItemInFolder(path: string): Promise<void>
  confirmClose(): Promise<void>
  setMenuVisible(visible: boolean): Promise<void>
  getVideosDir(): Promise<string>
  chooseDirectory(title: string): Promise<string | null>
  setAppLanguage(language: 'zh' | 'en'): Promise<void>
  setAppearance(theme: 'dark' | 'light', accent: string): Promise<void>
  finishWelcome(): Promise<void>
  startWelcome(): Promise<void>
  readClipboardImage(): Promise<string | null>
  readClipboardText(): Promise<string>
  readClipboardFiles(): Promise<string[]>
  stat(path: string): Promise<{ size: number; modified: number } | null>
  scanProjects(): Promise<Array<{ path: string; name: string; size: number; modified: number }>>
  chooseLibraryFolder(): Promise<string | null>
  listLibrary(folder: string): Promise<Array<{ path: string; name: string; size: number }>>
  detectVideoScribe(): Promise<{
    caches: Array<{ name: string; path: string }>
    favourites: Array<{ name: string; path: string }>
  }>
  getLibraryState(): Promise<LibraryState>
  addLibrary(entry: { name: string; path: string }): Promise<{ ok: boolean; reason?: string; state: LibraryState }>
  removeLibrary(id: string): Promise<LibraryState>
  reorderLibraries(ids: string[]): Promise<LibraryState>
  addRecentAsset(entry: { path: string; name: string }): Promise<LibraryState>
  removeRecentAsset(path: string): Promise<LibraryState>
  setRecentEnabled(enabled: boolean): Promise<LibraryState>
  getScribeAssociation(): Promise<boolean>
  setScribeAssociation(enabled: boolean): Promise<boolean>
  searchWeb(source: string, query: string): Promise<RemoteAsset[]>
  downloadWeb(url: string): Promise<ArrayBuffer>
  cacheWebAsset(url: string, name: string): Promise<string>
  openExternal(url: string): Promise<void>
  openHelp(language: 'zh' | 'en'): Promise<void>
  exportProjectAssets(path: string): Promise<{ count: number; target: string } | null>
  trashFile(path: string): Promise<boolean>
  openFile(path: string): Promise<boolean>
  setVideoMetadata(
    path: string,
    metadata: { title?: string; artist?: string; comment?: string }
  ): Promise<{ ok: boolean; error?: string }>
  getAiConfig(): Promise<{ baseURL: string; model: string; saveToLibrary: boolean; hasKey: boolean }>
  setAiConfig(input: { baseURL: string; model: string; key?: string; saveToLibrary: boolean }): Promise<{ ok: boolean }>
  clearAiKey(): Promise<{ ok: boolean }>
  generateAiSvg(prompt: string): Promise<{ svg: string; path?: string }>
  listAiLibrary(): Promise<Array<{ path: string; name: string; size: number; modified: number }>>
  toggleFullscreen(): Promise<void>
  isFullscreen(): Promise<boolean>
  onFullscreenChange(callback: (fullscreen: boolean) => void): () => void
  onOpenFile(callback: (path: string) => void): () => void
  onMenuAction(callback: (action: string) => void): () => void
  getPathForFile(file: unknown): string
  resolveShortcut(path: string): Promise<string | null>
  fs: FileSystemApi
  path: PathApi
}

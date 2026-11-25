import type { AnimationKind } from '@shared/project'

export type StartupBehavior = 'home' | 'new' | 'last' | 'choose'
export type AccentId = 'amber' | 'blue' | 'mint' | 'violet' | 'rose'

export interface NetworkSources {
  iconify: boolean
  openverse: boolean
  wikimedia: boolean
  undraw: boolean
  qiuwen: boolean
}

export interface AppSettings {
  autosaveEnabled: boolean
  autosaveSeconds: number
  openFolderAfterExport: boolean
  theme: 'dark' | 'light' | 'system'
  accent: AccentId
  language: 'zh' | 'en'
  compactToolbar: boolean
  /** 编辑器在画布外也显示背景色和纹理，便于编辑画布外元素 */
  showCanvasOutside: boolean
  /** 导入 SVG 后默认的出现方式 */
  svgAppear: AnimationKind
  /** 导入位图后默认的出现方式 */
  imageAppear: AnimationKind
  defaultTextFont: string
  defaultAppearDuration: number
  defaultHold: number
  defaultTransition: number
  defaultBackground: string
  startup: StartupBehavior
  networkSources: NetworkSources
  exportQuality: '720p' | '1080p' | '2k' | '4k' | 'custom'
  exportFps: number
  exportCustomWidth: number
  exportCustomHeight: number
  exportDirectory: string
}

const KEY = 'newscribe.settings'

const DEFAULTS: AppSettings = {
  autosaveEnabled: true,
  autosaveSeconds: 120,
  openFolderAfterExport: false,
  theme: 'dark',
  accent: 'amber',
  language: 'zh',
  compactToolbar: false,
  showCanvasOutside: true,
  svgAppear: 'draw',
  imageAppear: 'fade',
  defaultTextFont: 'Microsoft YaHei',
  defaultAppearDuration: 1.2,
  defaultHold: 1.5,
  defaultTransition: 1,
  defaultBackground: '#ffffff',
  startup: 'new',
  networkSources: {
    iconify: true,
    openverse: true,
    wikimedia: false,
    undraw: true,
    qiuwen: true
  },
  exportQuality: '1080p',
  exportFps: 30,
  exportCustomWidth: 1920,
  exportCustomHeight: 1080,
  exportDirectory: ''
}

const APPEAR_KINDS: AnimationKind[] = ['draw', 'bitmap', 'unfold', 'chart', 'fade', 'move', 'zoom', 'spin', 'typewriter']

function appearKind(value: unknown, fallback: AnimationKind): AnimationKind {
  return APPEAR_KINDS.includes(value as AnimationKind) ? (value as AnimationKind) : fallback
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      autosaveEnabled: parsed.autosaveEnabled ?? DEFAULTS.autosaveEnabled,
      autosaveSeconds: Math.min(
        3600,
        Math.max(15, Math.round(parsed.autosaveSeconds ?? DEFAULTS.autosaveSeconds))
      ),
      openFolderAfterExport: parsed.openFolderAfterExport ?? DEFAULTS.openFolderAfterExport,
      theme: parsed.theme === 'light' || parsed.theme === 'system' ? parsed.theme : 'dark',
      accent:
        parsed.accent === 'blue' ||
        parsed.accent === 'mint' ||
        parsed.accent === 'violet' ||
        parsed.accent === 'rose'
          ? parsed.accent
          : 'amber',
      language: parsed.language === 'en' || parsed.language === 'zh'
        ? parsed.language
        : navigator.language.toLowerCase().startsWith('zh')
          ? 'zh'
          : 'en',
      compactToolbar: Boolean(parsed.compactToolbar),
      showCanvasOutside: parsed.showCanvasOutside ?? DEFAULTS.showCanvasOutside,
      svgAppear: appearKind(parsed.svgAppear, DEFAULTS.svgAppear),
      imageAppear: appearKind(parsed.imageAppear, DEFAULTS.imageAppear),
      defaultTextFont:
        typeof parsed.defaultTextFont === 'string' && parsed.defaultTextFont.trim()
          ? parsed.defaultTextFont
          : DEFAULTS.defaultTextFont,
      defaultAppearDuration: Math.max(
        0.1,
        parsed.defaultAppearDuration ?? DEFAULTS.defaultAppearDuration
      ),
      defaultHold: Math.max(0, parsed.defaultHold ?? DEFAULTS.defaultHold),
      defaultTransition: Math.max(0, parsed.defaultTransition ?? DEFAULTS.defaultTransition),
      defaultBackground:
        typeof parsed.defaultBackground === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.defaultBackground)
          ? parsed.defaultBackground
          : DEFAULTS.defaultBackground,
      startup:
        parsed.startup === 'home' || parsed.startup === 'last' || parsed.startup === 'choose'
          ? parsed.startup
          : 'new',
      networkSources: {
        ...DEFAULTS.networkSources,
        ...(parsed.networkSources ?? {})
      },
      exportQuality:
        parsed.exportQuality === '720p' ||
        parsed.exportQuality === '2k' ||
        parsed.exportQuality === '4k' ||
        parsed.exportQuality === 'custom'
          ? parsed.exportQuality
          : '1080p',
      exportFps: [24, 25, 30, 50, 60].includes(parsed.exportFps ?? 30)
        ? (parsed.exportFps as number)
        : 30,
      exportCustomWidth: Math.max(320, parsed.exportCustomWidth ?? 1920),
      exportCustomHeight: Math.max(240, parsed.exportCustomHeight ?? 1080),
      exportDirectory: typeof parsed.exportDirectory === 'string' ? parsed.exportDirectory : ''
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // 忽略
  }
}

import type { Project } from '@shared/project'
import { buildTimeline } from '@shared/timeline'
import { extensionOf, createAssetRuntime, type AssetRuntime } from './assets'
import { useEditorStore } from './store'
import { ensureDrawPlans } from './draw'
import { renderPreviewFrame } from './preview'
import { buildProjectPackage, loadProjectPackage, PACKAGE_EXTENSION } from './projectPackage'

const isAbsolutePath = (value: string): boolean => /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(value)

export type ProjectFormat = 'nscribe' | 'nspkg'

export interface SaveProjectOptions {
  format?: ProjectFormat
  saveAs?: boolean
}

function formatFromPath(path: string | null | undefined): ProjectFormat {
  return path?.toLowerCase().endsWith(PACKAGE_EXTENSION) ? 'nspkg' : 'nscribe'
}

export async function saveProject(
  options: boolean | SaveProjectOptions = false
): Promise<string | null> {
  const state = useEditorStore.getState()
  const saveAs = typeof options === 'boolean' ? options : Boolean(options.saveAs)
  const currentFormat = formatFromPath(state.filePath)
  const format =
    typeof options === 'object' && options.format
      ? options.format
      : currentFormat
  let path = saveAs ? null : state.filePath

  if (!path) {
    const base =
      window.newscribe.path
        .basename(state.filePath ?? '')
        .replace(/\.(nscribe|nspkg)$/i, '') || '未命名'
    const extension = format === 'nspkg' ? PACKAGE_EXTENSION : '.nscribe'
    path = await window.newscribe.saveDialog({
      title: format === 'nspkg' ? '保存为分享工程' : '保存本地工程',
      defaultPath: `${base}${extension}`,
      filters:
        format === 'nspkg'
          ? [{ name: 'NewScribe 分享工程（单文件）', extensions: ['nspkg'] }]
          : [{ name: 'NewScribe 本地工程', extensions: ['nscribe'] }]
    })
    if (!path) return null
    const expected = format === 'nspkg' ? /\.nspkg$/i : /\.nscribe$/i
    if (!expected.test(path)) path = path.replace(/\.(nspkg|nscribe)$/i, '') + extension
  } else {
    const expected = format === 'nspkg' ? /\.nspkg$/i : /\.nscribe$/i
    if (!expected.test(path)) path = path.replace(/\.(nspkg|nscribe)$/i, '') + (format === 'nspkg' ? PACKAGE_EXTENSION : '.nscribe')
  }

  const project = structuredClone(state.project)
  try {
    await ensureDrawPlans(project, state.assets)
    const timeline = buildTimeline(project)
    const canvas = document.createElement('canvas')
    canvas.width = 480
    canvas.height = 270
    const ctx = canvas.getContext('2d')
    if (ctx) {
      renderPreviewFrame({
        ctx,
        width: 480,
        height: 270,
        dpr: 1,
        project,
        assets: state.assets,
        timeline,
        time: timeline.duration
      })
      project.thumbnail = canvas.toDataURL('image/jpeg', 0.72)
    }
  } catch {
    // 缩略图失败不影响保存
  }

  if (format === 'nspkg') {
    const packed = buildProjectPackage(project, state.assets)
    const bytes = packed.bytes.slice()
    await window.newscribe.fs.saveBinary(path, bytes.buffer as ArrayBuffer)
    useEditorStore.getState().markSaved(path, packed.project)
    return path
  }

  const dir = window.newscribe.path.dirname(path)
  const base = window.newscribe.path.basename(path).replace(/\.nscribe$/i, '')
  const assetsDir = window.newscribe.path.join(dir, `${base}.assets`)
  await window.newscribe.fs.mkdir(assetsDir)

  for (const asset of project.assets) {
    const runtime = state.assets[asset.id]
    if (!runtime) continue
    const fileName = `${asset.hash.slice(0, 16)}.${extensionOf(asset.name)}`
    const absolute = window.newscribe.path.join(assetsDir, fileName)
    if (!(await window.newscribe.fs.exists(absolute))) {
      const bytes = runtime.bytes
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      await window.newscribe.fs.writeBinary(absolute, copy)
    }
    asset.file = `./${base}.assets/${fileName}`
  }

  await window.newscribe.fs.saveText(path, JSON.stringify(project, null, 2))
  useEditorStore.getState().markSaved(path, project)
  return path
}

export async function relinkAsset(assetId: string, path: string): Promise<void> {
  const state = useEditorStore.getState()
  const asset = state.project.assets.find((item) => item.id === assetId)
  const bytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
  const runtime = await createAssetRuntime({
    name: asset?.name ?? window.newscribe.path.basename(path),
    mime: asset?.mime,
    bytes,
    originalPath: path
  })
  runtime.asset.id = assetId
  useEditorStore.getState().setAssetRuntime(assetId, runtime)
}

export interface OpenResult {
  ok: boolean
  path?: string
  missing: string[]
  error?: string
  /** 原工程无法读取，内容来自 .nscribe.bak */
  recoveredFromBackup?: boolean
}

export async function openProject(): Promise<OpenResult> {
  const paths = await window.newscribe.openDialog({
    title: '打开工程',
    filters: [
      { name: 'NewScribe 工程', extensions: ['nscribe', 'nspkg'] },
      { name: 'NewScribe 本地工程', extensions: ['nscribe'] },
      { name: 'NewScribe 分享工程', extensions: ['nspkg'] }
    ]
  })
  const path = paths[0]
  if (!path) return { ok: false, missing: [] }
  return openProjectPath(path)
}

async function openPackageProject(path: string): Promise<OpenResult> {
  try {
    let loaded: Awaited<ReturnType<typeof loadProjectPackage>>
    let recoveredFromBackup = false
    try {
      loaded = await loadProjectPackage(path)
    } catch (primaryError) {
      const backupPath = `${path}.bak`
      if (!(await window.newscribe.fs.exists(backupPath))) throw primaryError
      loaded = await loadProjectPackage(backupPath)
      recoveredFromBackup = true
      await window.newscribe.fs
        .saveBinary(path, loaded.rawBytes.buffer as ArrayBuffer, false)
        .catch(() => undefined)
    }
    useEditorStore.getState().loadProject(loaded.project, loaded.assets, path, loaded.missing)
    try {
      localStorage.setItem('newscribe.lastPath', path)
    } catch {
      // 忽略
    }
    return { ok: true, path, missing: loaded.missing, recoveredFromBackup }
  } catch (error) {
    return {
      ok: false,
      missing: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function openProjectPath(path: string): Promise<OpenResult> {
  if (path.toLowerCase().endsWith(PACKAGE_EXTENSION)) return openPackageProject(path)
  try {
    const load = async (candidate: string): Promise<{ project: Project; text: string }> => {
      const text = await window.newscribe.fs.readText(candidate)
      const project = JSON.parse(text) as Project
      if (!project || project.version !== 1 || !Array.isArray(project.elements)) {
        throw new Error('工程文件结构无效')
      }
      return { project, text }
    }

    let project: Project
    let recoveredFromBackup = false
    try {
      project = (await load(path)).project
    } catch (primaryError) {
      const backupPath = `${path}.bak`
      if (!(await window.newscribe.fs.exists(backupPath))) throw primaryError
      const backup = await load(backupPath)
      project = backup.project
      recoveredFromBackup = true
      // 原文件已经损坏；把可用备份写回主文件，但不要用它覆盖掉好备份。
      await window.newscribe.fs.saveText(path, backup.text, false).catch(() => undefined)
    }

    const dir = window.newscribe.path.dirname(path)
    const assets: Record<string, AssetRuntime> = {}
    const missing: string[] = []

    for (const asset of project.assets ?? []) {
      if (!asset.file) {
        missing.push(asset.id)
        continue
      }
      const absolute = isAbsolutePath(asset.file)
        ? asset.file
        : window.newscribe.path.join(dir, asset.file)

      if (!(await window.newscribe.fs.exists(absolute))) {
        missing.push(asset.id)
        continue
      }

      try {
        const bytes = new Uint8Array(await window.newscribe.fs.readBinary(absolute))
        const runtime = await createAssetRuntime({
          name: asset.name,
          mime: asset.mime,
          bytes,
          originalPath: absolute
        })
        runtime.asset.id = asset.id
        runtime.asset.file = asset.file
        assets[asset.id] = runtime
      } catch {
        missing.push(asset.id)
      }
    }

    useEditorStore.getState().loadProject(project, assets, path, missing)
    try {
      localStorage.setItem('newscribe.lastPath', path)
    } catch {
      // 忽略
    }
    return { ok: true, path, missing, recoveredFromBackup }
  } catch (error) {
    return {
      ok: false,
      missing: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

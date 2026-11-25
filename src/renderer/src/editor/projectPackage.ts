import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Project } from '@shared/project'
import { createAssetRuntime, extensionOf, type AssetRuntime } from './assets'
import { loadHands, persistHands } from './hands'

export const PACKAGE_FORMAT = 'newscribe-package'
export const PACKAGE_EXTENSION = '.nspkg'

export interface PackageBuildResult {
  bytes: Uint8Array
  project: Project
}

function assetEntry(asset: { id: string; name: string; hash: string }): string {
  const key = asset.hash?.slice(0, 16) || asset.id
  return `assets/${key}.${extensionOf(asset.name)}`
}

export function buildProjectPackage(
  source: Project,
  assets: Record<string, AssetRuntime>
): PackageBuildResult {
  const project = structuredClone(source)
  const files: Record<string, Uint8Array> = {}

  for (const asset of project.assets) {
    const runtime = assets[asset.id]
    if (!runtime) {
      asset.file = ''
      continue
    }
    const entry = assetEntry(asset)
    asset.file = entry
    if (!files[entry]) files[entry] = runtime.bytes
  }

  files['manifest.json'] = strToU8(
    JSON.stringify(
      {
        format: PACKAGE_FORMAT,
        formatVersion: 1,
        app: 'NewScribe',
        createdAt: new Date().toISOString(),
        project: 'project.json',
        assetCount: project.assets.length,
        handCount: loadHands().length
      },
      null,
      2
    )
  )
  files['project.json'] = strToU8(JSON.stringify(project, null, 2))
  files['hands.json'] = strToU8(JSON.stringify(loadHands(), null, 2))

  return {
    bytes: zipSync(files, { level: 0 }),
    project
  }
}

export interface PackageLoadResult {
  project: Project
  assets: Record<string, AssetRuntime>
  missing: string[]
  rawBytes: Uint8Array
}

export async function loadProjectPackage(path: string): Promise<PackageLoadResult> {
  const rawBytes = new Uint8Array(await window.newscribe.fs.readBinary(path))
  const entries = unzipSync(rawBytes)
  const manifestBytes = entries['manifest.json']
  if (manifestBytes) {
    const manifest = JSON.parse(strFromU8(manifestBytes)) as { format?: string }
    if (manifest.format && manifest.format !== PACKAGE_FORMAT) {
      throw new Error('这不是有效的 NewScribe 工程包')
    }
  }
  const projectBytes = entries['project.json']
  if (!projectBytes) throw new Error('工程包缺少 project.json')
  const project = JSON.parse(strFromU8(projectBytes)) as Project
  if (!project || project.version !== 1 || !Array.isArray(project.elements)) {
    throw new Error('工程包结构无效')
  }

  const assets: Record<string, AssetRuntime> = {}
  const missing: string[] = []
  for (const asset of project.assets ?? []) {
    const entry = asset.file?.replace(/^\.\//, '') || ''
    const bytes =
      (entry ? entries[entry] : undefined) ??
      entries[Object.keys(entries).find((name) => name.endsWith(`/${asset.id}`)) ?? '']
    if (!bytes) {
      missing.push(asset.id)
      continue
    }
    try {
      const runtime = await createAssetRuntime({
        name: asset.name,
        mime: asset.mime,
        bytes
      })
      runtime.asset.id = asset.id
      runtime.asset.file = asset.file || entry
      assets[asset.id] = runtime
    } catch {
      missing.push(asset.id)
    }
  }

  const handsBytes = entries['hands.json']
  if (handsBytes) {
    try {
      const packagedHands = JSON.parse(strFromU8(handsBytes)) as unknown
      if (Array.isArray(packagedHands)) {
        const existing = loadHands()
        const byId = new Map(existing.map((hand) => [hand.id, hand]))
        for (const hand of packagedHands) {
          if (hand && typeof hand === 'object' && 'id' in hand && 'dataUrl' in hand) {
            byId.set(String(hand.id), hand as (typeof existing)[number])
          }
        }
        persistHands([...byId.values()])
      }
    } catch {
      // 损坏的手势数据不应阻止工程打开
    }
  }

  return { project, assets, missing, rawBytes }
}

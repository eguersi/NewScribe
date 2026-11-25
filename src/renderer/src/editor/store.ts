import { create } from 'zustand'
import {
  createChartElement,
  createEmptyProject,
  createQrElement,
  createTableElement,
  createMindMapElement,
  createShapeElement,
  createMathElement,
  createMoleculeElement,
  createIpaElement,
  createMaskElement,
  type AudioSpec,
  type Project,
  type SceneElement,
  type ShapeKind,
  type ShapePoint
} from '@shared/project'
import type { AssetRuntime } from './assets'
import { createSvgFontImage } from './assets'
import { fitAllCamera } from '@shared/timeline'
import { invalidateDrawElement } from './draw'
import { loadSettings } from './settings'

function createProjectWithDefaults(): Project {
  const project = createEmptyProject()
  try {
    project.canvas.background = loadSettings().defaultBackground
  } catch {
    // 使用默认白底
  }
  return project
}

function applyImportDefaults(element: SceneElement): SceneElement {
  if (element.kind !== 'svg' && element.kind !== 'image') return element
  const settings = loadSettings()
  return {
    ...element,
    appear: {
      ...element.appear,
      kind: element.kind === 'svg' ? settings.svgAppear : settings.imageAppear,
      duration: settings.defaultAppearDuration
    },
    hold: settings.defaultHold,
    transition: { ...element.transition, duration: settings.defaultTransition }
  }
}

function creationContext(
  project: Project,
  viewSize: { width: number; height: number },
  viewport: ViewportState
): { scale: number; screenWidth: number; screenHeight: number; centerX: number; centerY: number } {
  const scale = Math.max(0.04, viewport.scale)
  const screenWidth = viewSize.width > 0 ? viewSize.width : project.canvas.width * 0.6
  const screenHeight = viewSize.height > 0 ? viewSize.height : project.canvas.height * 0.6
  const centerX =
    viewSize.width > 0
      ? (viewSize.width / 2 - viewport.tx) / scale
      : project.canvas.width / 2
  const centerY =
    viewSize.height > 0
      ? (viewSize.height / 2 - viewport.ty) / scale
      : project.canvas.height / 2
  return { scale, screenWidth, screenHeight, centerX, centerY }
}

function fitNewElement(
  element: SceneElement,
  width: number,
  height: number,
  centerX: number,
  centerY: number
): SceneElement {
  const w = Math.max(8, width)
  const h = Math.max(8, height)
  return {
    ...element,
    x: centerX - w / 2,
    y: centerY - h / 2,
    width: w,
    height: h,
    camera: { ...element.camera, x: centerX, y: centerY }
  }
}

export interface ViewportState {
  /** 屏幕像素 / 世界像素 */
  scale: number
  /** 世界原点在屏幕上的位置 */
  tx: number
  ty: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const HISTORY_LIMIT = 60

let elementClipboard: SceneElement[] = []

export function fitViewport(
  canvas: { width: number; height: number },
  view: { width: number; height: number }
): ViewportState {
  if (view.width <= 0 || view.height <= 0) return { scale: 1, tx: 0, ty: 0 }
  const scale = Math.min(view.width / canvas.width, view.height / canvas.height) * 0.82
  return {
    scale,
    tx: (view.width - canvas.width * scale) / 2,
    ty: (view.height - canvas.height * scale) / 2
  }
}

interface EditorStore {
  project: Project
  assets: Record<string, AssetRuntime>
  selectedId: string | null
  selectedIds: string[]
  viewport: ViewportState
  viewSize: { width: number; height: number }
  pendingShape: ShapeKind | null
  pendingMask: boolean
  shapeEditorId: string | null
  filePath: string | null
  dirty: boolean
  /** 丢失素材的 asset id */
  missing: string[]
  past: Project[]
  future: Project[]
  showOutputFrame: boolean
  textFocusRequest: number
  clipboardInternalAt: number
  animationPreview: { elementId: string; startedAt: number } | null

  setViewSize(size: { width: number; height: number }): void
  setViewport(viewport: ViewportState): void
  fitView(): void
  resetProject(): void
  setShowOutputFrame(value: boolean): void
  requestTextFocus(): void
  playAnimation(elementId: string): void
  stopAnimation(): void

  registerAsset(runtime: AssetRuntime): void
  addElement(element: SceneElement): void
  addChart(kind?: 'line' | 'bar' | 'pie'): void
  addQr(): void
  addTable(): void
  addMindMap(): void
  startShape(kind: ShapeKind): void
  cancelShape(): void
  addShape(rect: Rect, kind: ShapeKind, points?: ShapePoint[]): void
  startMask(): void
  cancelMask(): void
  addMask(rect: Rect): void
  addMath(): void
  addMolecule(): void
  addIpa(): void
  openShapeEditor(id: string): void
  closeShapeEditor(): void
  updateElement(id: string, patch: Partial<SceneElement>, commit?: boolean): void
  removeElement(id: string): void
  reorderElement(from: number, to: number): void
  select(id: string | null, additive?: boolean): void
  selectMany(ids: string[]): void
  selectAll(): void
  updateElements(ids: string[], patch: Partial<SceneElement>, commit?: boolean): void
  deleteSelected(): void
  pinCamera(id: string): void
  pinCameraMany(): void
  recallCamera(id: string): void
  copySelected(): void
  duplicateElement(id: string): void
  setSvgFont(elementId: string, fontFamily: string): void
  applySvgFontToAll(fontFamily: string): void
  applyTextFontToAll(fontFamily: string): void
  hasClipboard(): boolean
  pasteClipboard(): void

  setCanvas(patch: Partial<Project['canvas']>, commit?: boolean): void
  setEnding(enabled: boolean): void
  updateEnding(patch: Partial<{ duration: number; hold: number }>): void
  setBackgroundImage(runtime: AssetRuntime): void
  updateBackgroundImage(patch: Partial<{ fit: 'tile' | 'stretch'; fixed: boolean }>): void
  clearBackgroundImage(): void
  setAudio(assetId: string, patch?: Partial<AudioSpec>): void
  updateAudio(patch: Partial<AudioSpec>): void
  removeAudio(): void
  setAudio2(assetId: string, patch?: Partial<AudioSpec>): void
  updateAudio2(patch: Partial<AudioSpec>): void
  removeAudio2(): void
  pushHistory(snapshot?: Project): void
  undo(): void
  redo(): void

  markSaved(filePath: string, project: Project): void
  setAssetRuntime(assetId: string, runtime: AssetRuntime): void
  replaceElementAsset(elementId: string, runtime: AssetRuntime): void
  moveElementTo(elementId: string, position: 'start' | 'end'): void
  moveElementBy(elementId: string, delta: -1 | 1): void
  setElementHand(elementId: string, hand: string): void
  loadProject(
    project: Project,
    assets: Record<string, AssetRuntime>,
    filePath: string,
    missing: string[]
  ): void
  setMissing(names: string[]): void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  project: createProjectWithDefaults(),
  assets: {},
  selectedId: null,
  selectedIds: [],
  viewport: { scale: 0.4, tx: 0, ty: 0 },
  viewSize: { width: 0, height: 0 },
  pendingShape: null,
  pendingMask: false,
  shapeEditorId: null,
  filePath: null,
  dirty: false,
  missing: [],
  past: [],
  future: [],
  showOutputFrame: (() => {
    try {
      return localStorage.getItem('newscribe.showOutputFrame') !== '0'
    } catch {
      return true
    }
  })(),
  textFocusRequest: 0,
  clipboardInternalAt: 0,
  animationPreview: null,

  requestTextFocus: () => {
    set((state) => ({ textFocusRequest: state.textFocusRequest + 1 }))
  },

  playAnimation: (elementId) => {
    set({ animationPreview: { elementId, startedAt: performance.now() } })
  },

  stopAnimation: () => {
    set({ animationPreview: null })
  },

  setShowOutputFrame: (value) => {
    try {
      localStorage.setItem('newscribe.showOutputFrame', value ? '1' : '0')
    } catch {
      // 忽略
    }
    set({ showOutputFrame: value })
  },

  setViewSize: (size) => {
    const state = get()
    const isFirst = state.viewSize.width === 0 && size.width > 0
    set({ viewSize: size })
    if (isFirst) {
      set({ viewport: fitViewport(state.project.canvas, size) })
    }
  },

  setViewport: (viewport) => set({ viewport }),

  fitView: () => {
    const { project, viewSize } = get()
    set({ viewport: fitViewport(project.canvas, viewSize) })
  },

  resetProject: () => {
    const { viewSize } = get()
    const project = createProjectWithDefaults()
    set({
      project,
      assets: {},
      selectedId: null,
      selectedIds: [],
      filePath: null,
      dirty: false,
      missing: [],
      past: [],
      future: [],
      viewport: fitViewport(project.canvas, viewSize)
    })
  },

  registerAsset: (runtime) => {
    set((state) => {
      const already = state.project.assets.some((asset) => asset.id === runtime.asset.id)
      return {
        assets: { ...state.assets, [runtime.asset.id]: runtime },
        project: already
          ? state.project
          : { ...state.project, assets: [...state.project.assets, runtime.asset] },
        dirty: true
      }
    })
  },

  addElement: (element) => {
    const state = get()
    let applied = applyImportDefaults(element)
    if (state.viewSize.width > 0) {
      applied = {
        ...applied,
        camera: {
          ...applied.camera,
          zoom: Math.max(
            0.05,
            (state.project.canvas.width * state.viewport.scale) / state.viewSize.width
          )
        }
      }
    }
    set((current) => ({
      past: [...current.past, structuredClone(current.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: { ...current.project, elements: [...current.project.elements, applied] },
      selectedId: applied.id,
      selectedIds: [applied.id],
      dirty: true
    }))
  },

  addChart: (kind = 'bar') => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.56) / context.scale
    )
    const element = fitNewElement(
      createChartElement(state.project, kind),
      width,
      width * 0.62,
      context.centerX,
      context.centerY
    )
    get().addElement(element)
  },

  addQr: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const size = Math.min(
      state.project.canvas.width * 0.8,
      (Math.min(context.screenWidth * 0.28, context.screenHeight * 0.5)) / context.scale
    )
    const element = fitNewElement(
      createQrElement(state.project),
      size,
      size,
      context.centerX,
      context.centerY
    )
    get().addElement(element)
  },

  addTable: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.5) / context.scale
    )
    const base = createTableElement(state.project)
    const element = fitNewElement(
      base,
      width,
      width * 0.58,
      context.centerX,
      context.centerY
    )
    if (element.table) {
      const ratio = width / 760
      element.table = {
        ...element.table,
        fontSize: Math.max(1.5, element.table.fontSize * ratio),
        cellPadding: Math.max(0.5, element.table.cellPadding * ratio)
      }
    }
    get().addElement(element)
  },

  addMindMap: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.56) / context.scale
    )
    const base = createMindMapElement(state.project)
    const element = fitNewElement(
      base,
      width,
      width * 0.62,
      context.centerX,
      context.centerY
    )
    if (element.mindmap) {
      const ratio = width / 900
      element.mindmap = {
        ...element.mindmap,
        fontSize: Math.max(1.5, element.mindmap.fontSize * ratio),
        nodePadding: Math.max(0.5, element.mindmap.nodePadding * ratio),
        gapX: Math.max(2, element.mindmap.gapX * ratio),
        gapY: Math.max(1, element.mindmap.gapY * ratio)
      }
    }
    get().addElement(element)
  },

  startShape: (kind) => set({ pendingShape: kind, pendingMask: false }),

  cancelShape: () => set({ pendingShape: null, pendingMask: false }),

  addShape: (rect, kind, points) => {
    get().addElement(createShapeElement(rect, kind, points))
    set({ pendingShape: null })
  },

  startMask: () => set({ pendingShape: null, pendingMask: true }),

  cancelMask: () => set({ pendingMask: false }),

  addMask: (rect) => {
    get().addElement(createMaskElement(rect))
    set({ pendingMask: false })
  },

  addMath: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.52) / context.scale
    )
    get().addElement(
      fitNewElement(
        createMathElement(state.project),
        width,
        width * 0.38,
        context.centerX,
        context.centerY
      )
    )
  },

  addMolecule: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.4) / context.scale
    )
    get().addElement(
      fitNewElement(
        createMoleculeElement(state.project),
        width,
        width * 0.8,
        context.centerX,
        context.centerY
      )
    )
  },

  addIpa: () => {
    const state = get()
    const context = creationContext(state.project, state.viewSize, state.viewport)
    const width = Math.min(
      state.project.canvas.width * 1.5,
      (context.screenWidth * 0.44) / context.scale
    )
    const base = createIpaElement(state.project)
    const element = fitNewElement(
      base,
      width,
      width * 0.42,
      context.centerX,
      context.centerY
    )
    if (element.ipa) {
      element.ipa = {
        ...element.ipa,
        fontSize: Math.max(2, element.ipa.fontSize * (width / 560))
      }
    }
    get().addElement(element)
  },

  openShapeEditor: (id) => set({ shapeEditorId: id }),

  closeShapeEditor: () => set({ shapeEditorId: null }),

  updateElement: (id, patch, commit = true) => {
    if ('strokeOnly' in patch) invalidateDrawElement(id)
    set((state) => {
      const elements = state.project.elements.map((element) =>
        element.id === id ? { ...element, ...patch } : element
      )
      return {
        project: { ...state.project, elements },
        past: commit ? [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT) : state.past,
        future: commit ? [] : state.future,
        dirty: true
      }
    })
  },

  removeElement: (id) => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...state.project,
        elements: state.project.elements.filter((element) => element.id !== id)
      },
      selectedIds: state.selectedIds.filter((item) => item !== id),
      selectedId:
        state.selectedId === id
          ? state.selectedIds.filter((item) => item !== id).slice(-1)[0] ?? null
          : state.selectedId,
      dirty: true
    }))
  },

  reorderElement: (from, to) => {
    set((state) => {
      const elements = [...state.project.elements]
      if (from < 0 || from >= elements.length || to < 0 || to >= elements.length) return state
      const [moved] = elements.splice(from, 1)
      elements.splice(to, 0, moved)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: { ...state.project, elements },
        dirty: true
      }
    })
  },

  select: (id, additive = false) => {
    set((state) => {
      let next: string[]
      if (!id) next = []
      else if (additive) {
        next = state.selectedIds.includes(id)
          ? state.selectedIds.filter((item) => item !== id)
          : [...state.selectedIds, id]
      } else {
        next = [id]
      }
      return { selectedIds: next, selectedId: next[next.length - 1] ?? null }
    })
  },

  selectMany: (ids) => {
    const next = [...new Set(ids)]
    set({ selectedIds: next, selectedId: next[next.length - 1] ?? null })
  },

  selectAll: () => {
    const ids = get().project.elements.map((element) => element.id)
    set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null })
  },

  updateElements: (ids, patch, commit = true) => {
    set((state) => {
      const wanted = new Set(ids)
      return {
        project: {
          ...state.project,
          elements: state.project.elements.map((element) =>
            wanted.has(element.id) ? { ...element, ...patch } : element
          )
        },
        past: commit ? [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT) : state.past,
        future: commit ? [] : state.future,
        dirty: true
      }
    })
  },

  deleteSelected: () => {
    set((state) => {
      if (state.selectedIds.length === 0) return state
      const wanted = new Set(state.selectedIds)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          elements: state.project.elements.filter((element) => !wanted.has(element.id))
        },
        selectedId: null,
        selectedIds: [],
        dirty: true
      }
    })
  },

  pinCamera: (id) => {
    const { project, viewport, viewSize } = get()
    const centerX = (viewSize.width / 2 - viewport.tx) / viewport.scale
    const centerY = (viewSize.height / 2 - viewport.ty) / viewport.scale
    const zoom = (project.canvas.width * viewport.scale) / Math.max(1, viewSize.width)
    get().updateElement(id, {
      camera: { x: centerX, y: centerY, zoom: Math.max(0.05, zoom) }
    })
  },

  pinCameraMany: () => {
    const { project, viewport, viewSize, selectedIds } = get()
    if (selectedIds.length === 0) return
    const centerX = (viewSize.width / 2 - viewport.tx) / viewport.scale
    const centerY = (viewSize.height / 2 - viewport.ty) / viewport.scale
    const zoom = (project.canvas.width * viewport.scale) / Math.max(1, viewSize.width)
    get().updateElements(selectedIds, {
      camera: { x: centerX, y: centerY, zoom: Math.max(0.05, zoom) }
    })
  },

  recallCamera: (id) => {
    const { project, viewSize } = get()
    const element = project.elements.find((item) => item.id === id)
    if (!element || viewSize.width <= 0 || viewSize.height <= 0) return
    // 与 pinCamera 完全互逆：固定视角按画布宽度换算出 zoom。
    const scale = Math.max(0.02, element.camera.zoom * viewSize.width / Math.max(1, project.canvas.width))
    set({
      viewport: {
        scale,
        tx: viewSize.width / 2 - element.camera.x * scale,
        ty: viewSize.height / 2 - element.camera.y * scale
      }
    })
  },

  copySelected: () => {
    const { project, selectedIds } = get()
    if (selectedIds.length === 0) return
    elementClipboard = project.elements
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => structuredClone(item))
    set({ clipboardInternalAt: Date.now() })
  },

  duplicateElement: (id) => {
    const source = get().project.elements.find((item) => item.id === id)
    if (!source) return
    const clone = structuredClone(source)
    clone.id = crypto.randomUUID()
    clone.x += 24
    clone.y += 24
    clone.camera = {
      ...clone.camera,
      x: clone.camera.x + 24,
      y: clone.camera.y + 24
    }
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: { ...state.project, elements: [...state.project.elements, clone] },
      selectedId: clone.id,
      selectedIds: [clone.id],
      dirty: true
    }))
  },

  setSvgFont: (elementId, fontFamily) => {
    const state = get()
    const element = state.project.elements.find((item) => item.id === elementId)
    if (!element || element.kind !== 'svg') return
    const runtime = state.assets[element.assetId]
    if (!runtime || !runtime.asset.svgHasText) return
    state.updateElement(elementId, {
      svgFontFamily: fontFamily.trim() || undefined
    })
    invalidateDrawElement(elementId)
    if (!fontFamily.trim()) return
    if (runtime.svgFontImages?.has(fontFamily)) {
      set({ assets: { ...get().assets } })
      return
    }
    void createSvgFontImage(runtime, fontFamily).then((image) => {
      if (!image) return
      runtime.svgFontImages = runtime.svgFontImages ?? new Map()
      runtime.svgFontImages.set(fontFamily, image)
      set({ assets: { ...get().assets } })
    })
  },

  applySvgFontToAll: (fontFamily) => {
    const state = get()
    const targets = state.project.elements.filter(
      (element) =>
        element.kind === 'svg' &&
        state.assets[element.assetId]?.asset.svgHasText
    )
    if (targets.length === 0) return
    const ids = new Set(targets.map((element) => element.id))
    for (const id of ids) invalidateDrawElement(id)
    set((current) => ({
      past: [...current.past, structuredClone(current.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...current.project,
        elements: current.project.elements.map((element) =>
          ids.has(element.id)
            ? { ...element, svgFontFamily: fontFamily.trim() || undefined }
            : element
        )
      },
      dirty: true
    }))
    const font = fontFamily.trim()
    if (!font) {
      set({ assets: { ...get().assets } })
      return
    }
    const runtimes = Array.from(
      new Set(targets.map((element) => state.assets[element.assetId]).filter(Boolean))
    )
    void Promise.all(
      runtimes.map(async (runtime) => {
        if (runtime.svgFontImages?.has(font)) return
        const image = await createSvgFontImage(runtime, font)
        if (!image) return
        runtime.svgFontImages = runtime.svgFontImages ?? new Map()
        runtime.svgFontImages.set(font, image)
      })
    ).then(() => set({ assets: { ...get().assets } }))
  },

  applyTextFontToAll: (fontFamily) => {
    const font = fontFamily.trim()
    if (!font) return
    const targets = get().project.elements.filter(
      (element) => element.kind === 'text' && element.text
    )
    if (targets.length === 0) return
    const ids = new Set(targets.map((element) => element.id))
    set((current) => ({
      past: [...current.past, structuredClone(current.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...current.project,
        elements: current.project.elements.map((element) =>
          ids.has(element.id) && element.text
            ? { ...element, text: { ...element.text, fontFamily: font } }
            : element
        )
      },
      dirty: true
    }))
  },

  hasClipboard: () => elementClipboard.length > 0,

  pasteClipboard: () => {
    if (elementClipboard.length === 0) return
    const state = get()
    const cameraZoom =
      state.viewSize.width > 0
        ? Math.max(0.05, (state.project.canvas.width * state.viewport.scale) / state.viewSize.width)
        : null
    const clones = elementClipboard.map((item) => {
      const clone = structuredClone(item)
      clone.id = crypto.randomUUID()
      clone.x += 24
      clone.y += 24
      clone.camera = {
        ...clone.camera,
        x: clone.camera.x + 24,
        y: clone.camera.y + 24,
        ...(cameraZoom !== null ? { zoom: cameraZoom } : {})
      }
      return clone
    })
    elementClipboard = clones.map((item) => structuredClone(item))
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: { ...state.project, elements: [...state.project.elements, ...clones] },
      selectedIds: clones.map((item) => item.id),
      selectedId: clones[clones.length - 1]?.id ?? null,
      clipboardInternalAt: Date.now(),
      dirty: true
    }))
  },

  setCanvas: (patch, commit = true) => {
    set((state) => ({
      past: commit ? [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT) : state.past,
      future: commit ? [] : state.future,
      project: { ...state.project, canvas: { ...state.project.canvas, ...patch } },
      dirty: true
    }))
  },

  setBackgroundImage: (runtime) => {
    set((state) => {
      const exists = state.project.assets.some((asset) => asset.id === runtime.asset.id)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        assets: { ...state.assets, [runtime.asset.id]: runtime },
        project: {
          ...state.project,
          assets: exists
            ? state.project.assets.map((asset) =>
                asset.id === runtime.asset.id ? runtime.asset : asset
              )
            : [...state.project.assets, runtime.asset],
          canvas: {
            ...state.project.canvas,
            backgroundImage: {
              assetId: runtime.asset.id,
              fit: 'stretch',
              fixed: false
            }
          }
        },
        dirty: true
      }
    })
  },

  updateBackgroundImage: (patch) => {
    set((state) => {
      const current = state.project.canvas.backgroundImage
      if (!current) return state
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          canvas: {
            ...state.project.canvas,
            backgroundImage: { ...current, ...patch }
          }
        },
        dirty: true
      }
    })
  },

  clearBackgroundImage: () => {
    set((state) => {
      if (!state.project.canvas.backgroundImage) return state
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          canvas: { ...state.project.canvas, backgroundImage: undefined }
        },
        dirty: true
      }
    })
  },

  setEnding: (enabled) => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...state.project,
        ending: {
          enabled,
          duration: state.project.ending?.duration ?? 2.5,
          hold: state.project.ending?.hold ?? 1.5
        }
      },
      dirty: true
    }))
  },

  updateEnding: (patch) => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...state.project,
        ending: {
          enabled: state.project.ending?.enabled ?? true,
          duration: state.project.ending?.duration ?? 2.5,
          hold: state.project.ending?.hold ?? 1.5,
          ...patch
        }
      },
      dirty: true
    }))
  },

  setAudio: (assetId, patch) => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...state.project,
        audio: {
          assetId,
          volume: 0.7,
          fadeIn: 0.5,
          fadeOut: 1,
          loop: true,
          ...patch
        }
      },
      dirty: true
    }))
  },

  updateAudio: (patch) => {
    set((state) => {
      if (!state.project.audio) return state
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          audio: { ...state.project.audio, ...patch }
        },
        dirty: true
      }
    })
  },

  removeAudio: () => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: { ...state.project, audio: undefined },
      dirty: true
    }))
  },

  setAudio2: (assetId, patch) => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: {
        ...state.project,
        audio2: {
          assetId,
          volume: 0.9,
          fadeIn: 0.3,
          fadeOut: 0.5,
          loop: false,
          ...patch
        }
      },
      dirty: true
    }))
  },

  updateAudio2: (patch) => {
    set((state) => {
      if (!state.project.audio2) return state
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          audio2: { ...state.project.audio2, ...patch }
        },
        dirty: true
      }
    })
  },

  removeAudio2: () => {
    set((state) => ({
      past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      future: [],
      project: { ...state.project, audio2: undefined },
      dirty: true
    }))
  },

  pushHistory: (snapshot) => {
    set((state) => ({
      past: [...state.past, structuredClone(snapshot ?? state.project)].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true
    }))
  },

  undo: () => {
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [structuredClone(state.project), ...state.future].slice(0, HISTORY_LIMIT),
        selectedId: null,
        selectedIds: [],
        dirty: true
      }
    })
  },

  redo: () => {
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        project: next,
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selectedId: null,
        selectedIds: [],
        dirty: true
      }
    })
  },

  markSaved: (filePath, project) => {
    try {
      if (filePath) localStorage.setItem('newscribe.lastPath', filePath)
    } catch {
      // 忽略
    }
    set({ filePath, project, dirty: false })
  },

  setAssetRuntime: (assetId, runtime) => {
    set((state) => ({
      assets: { ...state.assets, [assetId]: runtime },
      project: {
        ...state.project,
        assets: state.project.assets.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                hash: runtime.asset.hash,
                name: runtime.asset.name,
                mime: runtime.asset.mime
              }
            : asset
        )
      },
      missing: state.missing.filter((id) => id !== assetId),
      dirty: true
    }))
  },

  replaceElementAsset: (elementId, runtime) => {
    invalidateDrawElement(elementId)
    set((state) => {
      const exists = state.project.assets.some((asset) => asset.id === runtime.asset.id)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        assets: { ...state.assets, [runtime.asset.id]: runtime },
        project: {
          ...state.project,
          assets: exists
            ? state.project.assets.map((asset) =>
                asset.id === runtime.asset.id ? runtime.asset : asset
              )
            : [...state.project.assets, runtime.asset],
          elements: state.project.elements.map((element) =>
            element.id === elementId
              ? {
                  ...element,
                  assetId: runtime.asset.id,
                  kind: runtime.asset.kind === 'svg' ? 'svg' : 'image'
                }
              : element
          )
        },
        dirty: true
      }
    })
  },

  moveElementTo: (elementId, position) => {
    set((state) => {
      const elements = [...state.project.elements]
      const index = elements.findIndex((element) => element.id === elementId)
      if (index < 0) return state
      const [element] = elements.splice(index, 1)
      elements.splice(position === 'start' ? 0 : elements.length, 0, element)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: { ...state.project, elements },
        dirty: true
      }
    })
  },

  moveElementBy: (elementId, delta) => {
    set((state) => {
      const elements = [...state.project.elements]
      const index = elements.findIndex((element) => element.id === elementId)
      if (index < 0) return state
      const target = Math.max(0, Math.min(elements.length - 1, index + delta))
      if (target === index) return state
      const [element] = elements.splice(index, 1)
      elements.splice(target, 0, element)
      return {
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        future: [],
        project: { ...state.project, elements },
        dirty: true
      }
    })
  },

  setElementHand: (elementId, hand) => {
    get().updateElement(elementId, { hand })
  },

  loadProject: (project, assets, filePath, missing) => {
    const { viewSize } = get()
    const fitScale = Math.min(
      viewSize.width / Math.max(1, project.canvas.width),
      viewSize.height / Math.max(1, project.canvas.height)
    )
    const camera = fitAllCamera(project)
    const viewport =
      project.elements.length > 0 && viewSize.width > 0 && viewSize.height > 0
        ? {
            scale: Math.max(0.02, fitScale * camera.zoom),
            tx: viewSize.width / 2 - camera.x * fitScale * camera.zoom,
            ty: viewSize.height / 2 - camera.y * fitScale * camera.zoom
          }
        : fitViewport(project.canvas, viewSize)
    set({
      project,
      assets,
      filePath,
      missing,
      selectedId: null,
      selectedIds: [],
      dirty: false,
      past: [],
      future: [],
      viewport
    })
    // 重新打开工程时，SVG 字体覆盖图需要根据保存的字体重新生成。
    void (async () => {
      let changed = false
      for (const element of project.elements) {
        const font = element.kind === 'svg' ? element.svgFontFamily : undefined
        const runtime = element.kind === 'svg' ? get().assets[element.assetId] : undefined
        if (!font || !runtime?.asset.svgHasText || runtime.svgFontImages?.has(font)) continue
        invalidateDrawElement(element.id)
        const image = await createSvgFontImage(runtime, font)
        if (!image) continue
        runtime.svgFontImages = runtime.svgFontImages ?? new Map()
        runtime.svgFontImages.set(font, image)
        changed = true
      }
      if (changed) set({ assets: { ...get().assets } })
    })()
  },

  setMissing: (names) => set({ missing: names })
}))

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export type AnimationKind = 'draw' | 'bitmap' | 'unfold' | 'chart' | 'fade' | 'move' | 'zoom' | 'spin' | 'typewriter'

export type MoveDirection = 'left' | 'right' | 'top' | 'bottom'
export type DisappearKind = 'fade' | 'zoom' | 'spin' | 'move'
export type ImagePlayback = 'once' | 'loop' | 'first' | 'last'
export type ImagePlayStart = 'after-appear' | 'with-appear'
export type ImagePlayEnd = 'transition-start' | 'transition-end' | 'continue'

/** 摄像机位：中心点的世界坐标 + 缩放（1 = 画布宽度铺满输出画面） */
export interface CameraPose {
  x: number
  y: number
  zoom: number
}

export interface ElementAnimation {
  kind: AnimationKind
  /** 出现动画时长（秒） */
  duration: number
  easing: Easing
  /** 仅 move 使用 */
  direction?: MoveDirection
  /** 仅 move 使用，世界坐标像素 */
  distance?: number
  /** 出现时同时淡入 */
  fadeIn?: boolean
  /** 位图描绘方向（度） */
  bitmapAngle?: number
}

export interface TransitionSpec {
  duration: number
  easing: Easing
}

export interface Asset {
  id: string
  kind: 'image' | 'svg' | 'audio'
  name: string
  mime: string
  /** 相对工程文件的路径；未保存时为空 */
  file: string
  width: number
  height: number
  hash: string
  originalPath?: string
  animated?: boolean
  frameCount?: number
  /** SVG 内含 SMIL / CSS 声明式动画 */
  svgAnimated?: boolean
  /** SVG 内含 text/tspan 标签 */
  svgHasText?: boolean
}

export interface TextSpec {
  content: string
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: number
  /** 竖排文字 */
  vertical?: boolean
}

export type ChartKind = 'line' | 'bar' | 'pie'

export interface ChartSeries {
  name: string
  color: string
  values: number[]
}

export interface MathSpec {
  latex: string
  color: string
  fontSize: number
  displayMode: boolean
}

export interface MoleculeSpec {
  smiles: string
  color: string
  /** 键线宽度 */
  strokeWidth: number
}

export function defaultMolecule(): MoleculeSpec {
  return {
    smiles: 'c1ccccc1',
    color: '#1f2937',
    strokeWidth: 3
  }
}

export interface IpaSpec {
  xsampa: string
  fontSize: number
  color: string
}

export function defaultIpa(): IpaSpec {
  return {
    xsampa: '"h@loU',
    fontSize: 54,
    color: '#1f2937'
  }
}

export function defaultMath(): MathSpec {
  return {
    latex: 'E = mc^2',
    color: '#1f2937',
    fontSize: 28,
    displayMode: true
  }
}

export type ShapeKind =
  | 'rectangle'
  | 'triangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'circle'
  | 'arrow_shape'
  | 'star'
  | 'heart'
  | 'arrow'
  | 'freeform'
  | 'line'

export interface ShapePoint {
  x: number
  y: number
  /** 进入该节点的贝塞尔控制点 */
  in?: ShapePoint
  /** 离开该节点的贝塞尔控制点 */
  out?: ShapePoint
}

export interface ShapeSpec {
  kind: ShapeKind
  /** 归一化坐标，0..1 */
  points: ShapePoint[]
  closed: boolean
  strokeEnabled: boolean
  stroke: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  fillEnabled: boolean
  fill: string
}

export function defaultShape(kind: ShapeKind, points?: ShapePoint[]): ShapeSpec {
  const templates: Record<ShapeKind, ShapePoint[]> = {
    rectangle: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    triangle: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    parallelogram: [{ x: 0.22, y: 0 }, { x: 1, y: 0 }, { x: 0.78, y: 1 }, { x: 0, y: 1 }],
    trapezoid: [{ x: 0.22, y: 0 }, { x: 0.78, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    circle: [
      { x: 0.5, y: 0, in: { x: 0.2239, y: 0 }, out: { x: 0.7761, y: 0 } },
      { x: 1, y: 0.5, in: { x: 1, y: 0.2239 }, out: { x: 1, y: 0.7761 } },
      { x: 0.5, y: 1, in: { x: 0.7761, y: 1 }, out: { x: 0.2239, y: 1 } },
      { x: 0, y: 0.5, in: { x: 0, y: 0.7761 }, out: { x: 0, y: 0.2239 } }
    ],
    arrow_shape: [
      { x: 0, y: 0.34 },
      { x: 0.58, y: 0.34 },
      { x: 0.58, y: 0.08 },
      { x: 1, y: 0.5 },
      { x: 0.58, y: 0.92 },
      { x: 0.58, y: 0.66 },
      { x: 0, y: 0.66 }
    ],
    star: [
      { x: 0.5, y: 0 },
      { x: 0.62, y: 0.34 },
      { x: 0.98, y: 0.35 },
      { x: 0.69, y: 0.56 },
      { x: 0.8, y: 0.92 },
      { x: 0.5, y: 0.7 },
      { x: 0.2, y: 0.92 },
      { x: 0.31, y: 0.56 },
      { x: 0.02, y: 0.35 },
      { x: 0.38, y: 0.34 }
    ],
    heart: [
      { x: 0.5, y: 0.95, in: { x: 0.9, y: 0.65 }, out: { x: 0.1, y: 0.65 } },
      { x: 0.25, y: 0.12, in: { x: 0.02, y: 0.25 }, out: { x: 0.42, y: 0.02 } },
      { x: 0.5, y: 0.25, in: { x: 0.5, y: 0.18 }, out: { x: 0.5, y: 0.18 } },
      { x: 0.75, y: 0.12, in: { x: 0.58, y: 0.02 }, out: { x: 0.98, y: 0.25 } }
    ],
    arrow: [
      { x: 0.04, y: 0.5 },
      { x: 0.78, y: 0.5 },
      { x: 0.58, y: 0.3 },
      { x: 0.94, y: 0.5 },
      { x: 0.58, y: 0.7 },
      { x: 0.78, y: 0.5 }
    ],
    line: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
    freeform: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.1 }, { x: 0.92, y: 0.78 }, { x: 0.3, y: 0.9 }]
  }
  return {
    kind,
    points: points ?? templates[kind],
    closed: kind !== 'arrow' && kind !== 'line',
    strokeEnabled: true,
    stroke: '#2b2f3a',
    strokeWidth: 5,
    strokeStyle: 'solid',
    fillEnabled: kind !== 'arrow' && kind !== 'line',
    fill: '#f5c45a'
  }
}

export interface MindMapSpec {
  outline: string
  fontSize: number
  nodePadding: number
  gapX: number
  gapY: number
  nodeFill: string
  nodeText: string
  nodeBorder: string
  connector: string
}

export function defaultMindMap(): MindMapSpec {
  return {
    outline: '中心主题\n  分支一\n    子主题\n  分支二\n  分支三',
    fontSize: 22,
    nodePadding: 12,
    gapX: 54,
    gapY: 24,
    nodeFill: '#fffaf0',
    nodeText: '#2b2118',
    nodeBorder: '#d9a441',
    connector: '#b07a2a'
  }
}

export interface TableSpec {
  title: string
  showTitle: boolean
  rows: string[][]
  headerRow: boolean
  fontFamily: string
  fontSize: number
  color: string
  headerColor: string
  headerBackground: string
  background: string
  borderColor: string
  borderWidth: number
  cellPadding: number
  align: 'left' | 'center' | 'right'
}

export function defaultTable(): TableSpec {
  return {
    title: '数据表',
    showTitle: true,
    rows: [
      ['项目', '数值'],
      ['示例 A', '12'],
      ['示例 B', '24'],
      ['示例 C', '18']
    ],
    headerRow: true,
    fontFamily: 'Microsoft YaHei',
    fontSize: 22,
    color: '#1f2937',
    headerColor: '#111827',
    headerBackground: '#f3f4f6',
    background: '#ffffff',
    borderColor: '#94a3b8',
    borderWidth: 2,
    cellPadding: 10,
    align: 'center'
  }
}

export interface QrSpec {
  content: string
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
  foreground: string
  background: string
  transparentBackground?: boolean
  margin: number
}

export function defaultQr(): QrSpec {
  return {
    content: 'https://github.com/',
    errorCorrection: 'M',
    foreground: '#1f2937',
    background: '#ffffff',
    transparentBackground: false,
    margin: 4
  }
}

export interface ChartSpec {
  kind: ChartKind
  title: string
  labels: string[]
  series: ChartSeries[]
  showLegend: boolean
  showValues: boolean
  showAxis: boolean
}

export function defaultChart(): ChartSpec {
  return {
    kind: 'bar',
    title: '月度数据',
    labels: ['一月', '二月', '三月', '四月', '五月'],
    series: [{ name: '销量', color: '#f5a524', values: [12, 19, 8, 24, 16] }],
    showLegend: true,
    showValues: true,
    showAxis: true
  }
}

export type MaskShape = 'rect' | 'ellipse'
export type MaskTargetMode = 'previous' | 'all' | 'specific'

export interface MaskSpec {
  shape: MaskShape
  /** previous = 只挖掉蒙版之前的元素；all = 挖掉全部；specific = 只作用于 targetId */
  targetMode?: MaskTargetMode
  /** 仅 targetMode = specific */
  targetId?: string
}

export interface SceneElement {
  id: string
  assetId: string
  kind: 'image' | 'svg' | 'text' | 'chart' | 'qr' | 'table' | 'mindmap' | 'shape' | 'math' | 'molecule' | 'ipa' | 'mask'
  /** 未旋转时的左上角（世界坐标） */
  x: number
  y: number
  width: number
  height: number
  /** 角度制，绕元素中心旋转 */
  rotation: number
  /** 水平翻转 */
  flipX?: boolean
  /** 0..1 */
  opacity: number
  /** 仅文字元素使用 */
  text?: TextSpec
  /** 仅图表元素使用 */
  chart?: ChartSpec
  qr?: QrSpec
  table?: TableSpec
  mindmap?: MindMapSpec
  shape?: ShapeSpec
  math?: MathSpec
  molecule?: MoleculeSpec
  ipa?: IpaSpec
  mask?: MaskSpec
  /** 覆盖 SVG 内部文字字体；空 = 使用 SVG 自带字体 */
  svgFontFamily?: string
  /** 描绘时只描边，走完路径后直接显示成品 */
  strokeOnly?: boolean
  /** 内置手势高度 */
  handHeight?: number
  /** 手势大小模式：随镜头缩放 / 固定屏幕大小 */
  handSizeMode?: 'view' | 'screen'
  /** 描绘时的手势：none / default / 自定义手势 id */
  hand: string
  /** 这个元素对应的固定机位 */
  camera: CameraPose
  appear: ElementAnimation
  /** 出现完成后停留时长（秒） */
  hold: number
  /** 停留结束后淡出的时长（秒），0 表示不消失 */
  disappear: number
  /** 是否启用消失动画；旧工程未设置时由 disappear > 0 推断 */
  disappearEnabled?: boolean
  disappearKind?: DisappearKind
  /** 非淡化消失时是否同时淡出 */
  disappearFadeOut?: boolean
  /** hold = 暂停结束即开始，transition = 切换结束后开始 */
  disappearAfter?: 'hold' | 'transition'
  disappearDirection?: MoveDirection
  /** 动图播放行为 */
  imagePlayback?: ImagePlayback
  imagePlayStart?: ImagePlayStart
  imagePlayEnd?: ImagePlayEnd
  /** 切换到下一个元素的时长 */
  transition: TransitionSpec
}

export type TextureKind = 'none' | 'paper' | 'grain' | 'canvas' | 'linen' | 'embossed' | 'leather'

export interface CanvasSpec {
  width: number
  height: number
  background: string
  texture?: TextureKind
  textureOpacity?: number
  /** true = 纹理固定在屏幕上，不随镜头移动/缩放 */
  textureFixed?: boolean
  backgroundImage?: {
    assetId: string
    fit: 'tile' | 'stretch'
    /** true = 固定在屏幕上，不随镜头移动/缩放 */
    fixed: boolean
  }
}

export interface AudioSpec {
  assetId: string
  volume: number
  fadeIn: number
  fadeOut: number
  loop: boolean
}

export interface Project {
  version: 1
  canvas: CanvasSpec
  assets: Asset[]
  elements: SceneElement[]
  /** 工程缩略图（data URL），导航页和加载占位使用 */
  thumbnail?: string
  audio?: AudioSpec
  /** 第二条音轨（例如画外音） */
  audio2?: AudioSpec
  /** 结尾展示全部元素 */
  ending?: {
    enabled: boolean
    duration: number
    hold: number
  }
}

export function createEmptyProject(): Project {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080, background: '#ffffff' },
    assets: [],
    elements: []
  }
}

export function defaultCamera(project: Project): CameraPose {
  return {
    x: project.canvas.width / 2,
    y: project.canvas.height / 2,
    zoom: 1
  }
}

export function createElementFromAsset(
  asset: Asset,
  rect: { x: number; y: number; width: number; height: number }
): SceneElement {
  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    kind: asset.kind === 'svg' ? 'svg' : 'image',
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    camera: {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      zoom: 1
    },
    appear: { kind: 'fade', duration: 1.2, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createChartElement(project: Project, kind: ChartKind = 'bar'): SceneElement {
  const width = Math.min(760, project.canvas.width * 0.62)
  const height = width * 0.62
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'chart',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    chart: { ...defaultChart(), kind },
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'chart', duration: 1.4, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createQrElement(project: Project): SceneElement {
  const size = Math.min(380, project.canvas.width * 0.36, project.canvas.height * 0.62)
  const x = (project.canvas.width - size) / 2
  const y = (project.canvas.height - size) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'qr',
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    qr: defaultQr(),
    camera: {
      x: x + size / 2,
      y: y + size / 2,
      zoom: 1
    },
    appear: { kind: 'fade', duration: 0.8, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createMindMapElement(project: Project): SceneElement {
  const width = Math.min(900, project.canvas.width * 0.74)
  const height = Math.min(560, project.canvas.height * 0.62)
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'mindmap',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    mindmap: defaultMindMap(),
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'chart', duration: 2.2, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createTableElement(project: Project): SceneElement {
  const table = defaultTable()
  const width = Math.min(760, project.canvas.width * 0.64)
  const height = Math.min(520, width * 0.58)
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'table',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    table,
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'fade', duration: 0.8, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createMathElement(project: Project): SceneElement {
  const width = Math.min(680, project.canvas.width * 0.56)
  const height = Math.min(260, project.canvas.height * 0.3)
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'math',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    math: defaultMath(),
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'draw', duration: 2.2, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createMoleculeElement(project: Project): SceneElement {
  const width = Math.min(520, project.canvas.width * 0.46)
  const height = Math.min(420, project.canvas.height * 0.46)
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'molecule',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    molecule: defaultMolecule(),
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'draw', duration: 1.6, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createIpaElement(project: Project): SceneElement {
  const width = Math.min(560, project.canvas.width * 0.5)
  const height = Math.min(240, project.canvas.height * 0.28)
  const x = (project.canvas.width - width) / 2
  const y = (project.canvas.height - height) / 2
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'ipa',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    ipa: defaultIpa(),
    camera: {
      x: x + width / 2,
      y: y + height / 2,
      zoom: 1
    },
    appear: { kind: 'draw', duration: 1.4, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createMaskElement(rect: {
  x: number
  y: number
  width: number
  height: number
}): SceneElement {
  const width = Math.max(8, rect.width)
  const height = Math.max(8, rect.height)
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'mask',
    x: rect.x,
    y: rect.y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    mask: { shape: 'rect', targetMode: 'previous' },
    camera: {
      x: rect.x + width / 2,
      y: rect.y + height / 2,
      zoom: 1
    },
    appear: { kind: 'fade', duration: 0.8, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createShapeElement(
  rect: { x: number; y: number; width: number; height: number },
  kind: ShapeKind,
  points?: ShapePoint[]
): SceneElement {
  const width = Math.max(8, rect.width)
  const height = Math.max(8, rect.height)
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'shape',
    x: rect.x,
    y: rect.y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    shape: defaultShape(kind, points),
    camera: {
      x: rect.x + width / 2,
      y: rect.y + height / 2,
      zoom: 1
    },
    appear: { kind: 'draw', duration: 1.2, easing: 'easeOut' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

export function createTextElement(
  rect: { x: number; y: number; width: number; height: number },
  content = '输入文字'
): SceneElement {
  return {
    id: crypto.randomUUID(),
    assetId: '',
    kind: 'text',
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: 0,
    opacity: 1,
    hand: 'none',
    text: {
      content,
      fontFamily: 'Microsoft YaHei',
      fontSize: 72,
      color: '#1f2937',
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      align: 'center',
      lineHeight: 1.35
    },
    camera: {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      zoom: 1
    },
    appear: { kind: 'typewriter', duration: 1.6, easing: 'linear' },
    hold: 1.5,
    disappear: 0,
    transition: { duration: 1, easing: 'easeInOut' }
  }
}

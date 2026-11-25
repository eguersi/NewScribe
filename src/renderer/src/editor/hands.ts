export interface HandConfig {
  id: string
  name: string
  dataUrl: string
  pivotX: number
  pivotY: number
  height: number
}

const STORAGE_KEY = 'newscribe.hands'
const imageCache = new Map<string, HTMLImageElement>()
let handCache: HandConfig[] | null = null

export const DEFAULT_HAND = { pivotX: 15, pivotY: 15, height: 500 }

export interface BuiltinHand {
  id: string
  name: string
  imageUrl: string
  pivotX: number
  pivotY: number
  height: number
}

export const BUILTIN_HANDS: BuiltinHand[] = [
  {
    id: 'default',
    name: '右手',
    imageUrl: new URL('../assets/hand.png', import.meta.url).href,
    pivotX: 15,
    pivotY: 15,
    height: 500
  },
  {
    id: 'marker',
    name: '马克笔（无标志）',
    imageUrl: new URL('../assets/hand-marker.png', import.meta.url).href,
    pivotX: 110,
    pivotY: 110,
    height: 210
  },
  {
    id: 'marker-logo',
    name: '马克笔（有标志）',
    imageUrl: new URL('../assets/hand-marker-logo.png', import.meta.url).href,
    pivotX: 110,
    pivotY: 110,
    height: 210
  },
  {
    id: 'chalk',
    name: '粉笔',
    imageUrl: new URL('../assets/hand-chalk.svg', import.meta.url).href,
    pivotX: 74,
    pivotY: 84,
    height: 210
  },
  {
    id: 'pen',
    name: '钢笔（无标志）',
    imageUrl: new URL('../assets/hand-pen.png', import.meta.url).href,
    pivotX: 73,
    pivotY: 915,
    height: 210
  },
  {
    id: 'pen-logo',
    name: '钢笔（有标志）',
    imageUrl: new URL('../assets/hand-pen-logo.png', import.meta.url).href,
    pivotX: 73,
    pivotY: 915,
    height: 210
  },
  {
    id: 'brush',
    name: '毛笔（无标志）',
    imageUrl: new URL('../assets/hand-brush.png', import.meta.url).href,
    pivotX: 70,
    pivotY: 80,
    height: 210
  },
  {
    id: 'brush-logo',
    name: '毛笔（有标志）',
    imageUrl: new URL('../assets/hand-brush-logo.png', import.meta.url).href,
    pivotX: 70,
    pivotY: 80,
    height: 210
  }
]

const builtinHandImages = new Map<string, HTMLImageElement>()

export function getBuiltinHand(id: string): BuiltinHand | undefined {
  return BUILTIN_HANDS.find((hand) => hand.id === id)
}

export function getBuiltinHandImage(hand: BuiltinHand): HTMLImageElement | null {
  const cached = builtinHandImages.get(hand.id)
  if (cached) return cached.complete ? cached : null
  const image = new Image()
  image.src = hand.imageUrl
  builtinHandImages.set(hand.id, image)
  return null
}

export interface HandVisual {
  image: HTMLImageElement
  pivotX: number
  pivotY: number
  height: number
}

export function getHandDrawHeight(
  element: { handSizeMode?: 'view' | 'screen' },
  hand: HandVisual,
  worldScale: number
): number {
  return element.handSizeMode === 'screen'
    ? hand.height / Math.max(1e-4, worldScale)
    : hand.height
}

export function getHandVisual(handId: string, heightOverride?: number): HandVisual | null {
  const builtin = getBuiltinHand(handId)
  if (builtin) {
    const image = getBuiltinHandImage(builtin)
    if (!image) return null
    return {
      image,
      pivotX: builtin.pivotX,
      pivotY: builtin.pivotY,
      height: Math.max(20, heightOverride ?? builtin.height)
    }
  }
  if (!handId || handId === 'none') return null
  const config = getHandConfig(handId)
  if (!config) return null
  const image = getHandImage(config.dataUrl)
  if (!image) return null
  return { image, pivotX: config.pivotX, pivotY: config.pivotY, height: config.height }
}

export function loadHands(): HandConfig[] {
  if (handCache) return handCache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    handCache = raw ? (JSON.parse(raw) as HandConfig[]) : []
  } catch {
    handCache = []
  }
  return handCache
}

export function persistHands(hands: HandConfig[]): void {
  handCache = hands
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hands))
  } catch {
    // 忽略
  }
}

export function addHand(name: string, dataUrl: string): HandConfig {
  const hand: HandConfig = {
    id: crypto.randomUUID(),
    name,
    dataUrl,
    ...DEFAULT_HAND
  }
  persistHands([...loadHands(), hand])
  return hand
}

export function updateHand(id: string, patch: Partial<HandConfig>): HandConfig | null {
  let updated: HandConfig | null = null
  const hands = loadHands().map((hand) => {
    if (hand.id !== id) return hand
    updated = { ...hand, ...patch }
    return updated
  })
  if (updated) persistHands(hands)
  return updated
}

export function getHandConfig(id: string): HandConfig | undefined {
  return loadHands().find((hand) => hand.id === id)
}

export function getHandImage(dataUrl: string): HTMLImageElement | null {
  const cached = imageCache.get(dataUrl)
  if (cached) return cached.complete ? cached : null
  const image = new Image()
  image.src = dataUrl
  imageCache.set(dataUrl, image)
  return null
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

import { createElementFromAsset, createTextElement } from '@shared/project'
import { createAssetRuntime } from './assets'
import { useEditorStore } from './store'

const BULB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440">
  <path d="M200 40c-75 0-128 57-128 128 0 48 26 80 58 103 12 9 18 22 18 38v14h104v-14c0-16 6-29 18-38 32-23 58-55 58-103 0-71-53-128-128-128z" fill="#fff2cc" stroke="#22262f" stroke-width="8" stroke-linejoin="round"/>
  <path d="M154 323h92M162 356h76M170 389h60" stroke="#22262f" stroke-width="9" stroke-linecap="round"/>
  <path d="M200 120v150M175 195l25 75 25-75" fill="none" stroke="#f5a524" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M120 120c-18 22-26 44-26 68M280 120c18 22 26 44 26 68" fill="none" stroke="#8a93a6" stroke-width="6" stroke-linecap="round"/>
</svg>`

const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 220">
  <path d="M30 170c80-90 190-120 320-96" fill="none" stroke="#22262f" stroke-width="9" stroke-linecap="round"/>
  <path d="M350 74l70-14-24 70z" fill="#fff2cc" stroke="#22262f" stroke-width="8" stroke-linejoin="round"/>
</svg>`

async function makeBitmapBytes(): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return new Uint8Array()

  const sky = ctx.createLinearGradient(0, 0, 640, 480)
  sky.addColorStop(0, '#7dd3fc')
  sky.addColorStop(1, '#2563eb')
  ctx.fillStyle = sky
  ctx.beginPath()
  ctx.arc(320, 210, 150, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(60, 420)
  ctx.lineTo(220, 250)
  ctx.lineTo(340, 420)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.moveTo(270, 420)
  ctx.lineTo(430, 210)
  ctx.lineTo(580, 420)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#f5a524'
  ctx.beginPath()
  ctx.arc(486, 138, 38, 0, Math.PI * 2)
  ctx.fill()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return new Uint8Array()
  return new Uint8Array(await blob.arrayBuffer())
}

async function addSvg(
  name: string,
  source: string,
  rect: { x: number; y: number; width: number; height: number },
  zoom: number
) {
  const bytes = new TextEncoder().encode(source)
  const runtime = await createAssetRuntime({ name, mime: 'image/svg+xml', bytes })
  useEditorStore.getState().registerAsset(runtime)
  const element = createElementFromAsset(runtime.asset, rect)
  element.camera = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    zoom
  }
  useEditorStore.getState().addElement(element)
  return element
}

/** 生成一段用于导出测试的提示音 WAV，避免测试依赖外部音频文件 */
export async function createToneAudioRuntime() {
  const sampleRate = 48_000
  const seconds = 14
  const frames = sampleRate * seconds
  const buffer = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + frames * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let index = 0; index < frames; index += 1) {
    const time = index / sampleRate
    const envelope = Math.min(1, time / 0.6) * Math.min(1, (seconds - time) / 1.2)
    const value = Math.sin(2 * Math.PI * 440 * time) * 0.25 * Math.max(0, envelope)
    view.setInt16(44 + index * 2, Math.round(value * 32767), true)
  }
  return createAssetRuntime({
    name: '测试音.wav',
    mime: 'audio/wav',
    bytes: new Uint8Array(buffer)
  })
}

/** 仅用于开发期截图与手动体验 */
export async function loadDemo(): Promise<void> {
  const state = useEditorStore.getState()
  if (state.project.elements.length > 0) return

  const bulb = await addSvg('灯泡.svg', BULB, { x: 520, y: 180, width: 420, height: 462 }, 1.7)

  const bitmapBytes = await makeBitmapBytes()
  const bitmapRuntime = await createAssetRuntime({
    name: '风景.png',
    mime: 'image/png',
    bytes: bitmapBytes
  })
  useEditorStore.getState().registerAsset(bitmapRuntime)
  const bitmap = createElementFromAsset(bitmapRuntime.asset, {
    x: 1040,
    y: 180,
    width: 560,
    height: 420
  })
  bitmap.camera = { x: 1320, y: 390, zoom: 1.8 }
  useEditorStore.getState().addElement(bitmap)

  await addSvg('箭头.svg', ARROW, { x: 1010, y: 700, width: 520, height: 220 }, 2.1)

  const text = createTextElement(
    { x: 520, y: 760, width: 900, height: 190 },
    '手绘白板动画'
  )
  text.text!.fontSize = 96
  text.text!.color = '#1f2937'
  text.camera = { x: 970, y: 855, zoom: 1.6 }
  useEditorStore.getState().addElement(text)

  useEditorStore.getState().updateElement(bulb.id, {
    appear: { kind: 'draw', duration: 3, easing: 'linear' }
  })
  useEditorStore.getState().updateElement(bitmap.id, {
    appear: { kind: 'draw', duration: 2.5, easing: 'linear' }
  })
  useEditorStore.getState().select(bulb.id)
}

import type { CameraPose, Easing, Project, SceneElement } from './project'

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

export function ease(easing: Easing, t: number): number {
  const x = clamp01(t)
  switch (easing) {
    case 'linear':
      return x
    case 'easeIn':
      return x * x * x
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3)
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    default:
      return x
  }
}

/**
 * 摄像机插值：位移线性、缩放取对数。
 * 这样视觉上变焦是匀速的，不会出现「先快后慢」。
 */
export function lerpCamera(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = clamp01(t)
  const fromZoom = Math.max(from.zoom, 1e-6)
  const toZoom = Math.max(to.zoom, 1e-6)
  const zoom = Math.exp(Math.log(fromZoom) + (Math.log(toZoom) - Math.log(fromZoom)) * k)
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    zoom
  }
}

interface SegmentBase {
  start: number
  end: number
}

export interface TransitionSegment extends SegmentBase {
  kind: 'transition'
  /** 切换时长归属于「前一个」元素 */
  elementId: string
  from: CameraPose
  to: CameraPose
  easing: Easing
}

export interface AppearSegment extends SegmentBase {
  kind: 'appear'
  elementId: string
  easing: Easing
}

export interface HoldSegment extends SegmentBase {
  kind: 'hold'
  elementId: string
}

export interface EndingSegment extends SegmentBase {
  kind: 'ending'
  from: CameraPose
  to: CameraPose
  moveEnd: number
  easing: Easing
}

export type TimelineSegment = TransitionSegment | AppearSegment | HoldSegment | EndingSegment

export interface ElementTiming {
  appearStart: number
  appearEnd: number
  holdEnd: number
  /** 消失动画真正开始的时刻 */
  disappearStart: number
}

export interface Timeline {
  segments: TimelineSegment[]
  duration: number
  timing: Record<string, ElementTiming>
}

/**
 * 时间轴语义（严格串行）：
 *
 *   [出现_0][暂停_0][切换_0→1][出现_1][暂停_1][切换_1→2]...
 *
 * - 切换时长归前一个元素；最后一个元素的切换不计入总时长。
 * - 每个元素在「出现 / 暂停」期间锁定自己的机位。
 * - 两个元素机位相同时，切换段仍然是「原地等待」，不做特殊跳过。
 */
export function buildTimeline(project: Project): Timeline {
  const segments: TimelineSegment[] = []
  const timing: Record<string, ElementTiming> = {}

  let cursor = 0
  const elements = project.elements

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]

    if (index > 0) {
      const previous = elements[index - 1]
      const duration = Math.max(0, previous.transition.duration)
      if (duration > 0) {
        segments.push({
          kind: 'transition',
          elementId: previous.id,
          start: cursor,
          end: cursor + duration,
          from: previous.camera,
          to: element.camera,
          easing: previous.transition.easing
        })
        cursor += duration
      }
    }

    const appearDuration = Math.max(0, element.appear.duration)
    const holdDuration = Math.max(0, element.hold)

    segments.push({
      kind: 'appear',
      elementId: element.id,
      start: cursor,
      end: cursor + appearDuration,
      easing: element.appear.easing
    })

    const appearStart = cursor
    cursor += appearDuration

    segments.push({
      kind: 'hold',
      elementId: element.id,
      start: cursor,
      end: cursor + holdDuration
    })

    timing[element.id] = {
      appearStart,
      appearEnd: appearStart + appearDuration,
      holdEnd: cursor + holdDuration,
      disappearStart: cursor + holdDuration
    }

    cursor += holdDuration
  }

  const ending = project.ending
  if (ending?.enabled && elements.length > 0) {
    const last = elements[elements.length - 1]
    const to = fitAllCamera(project)
    const move = Math.max(0.1, ending.duration)
    const hold = Math.max(0, ending.hold)
    segments.push({
      kind: 'ending',
      start: cursor,
      end: cursor + move + hold,
      from: last.camera,
      to,
      moveEnd: cursor + move,
      easing: 'easeInOut'
    })
    cursor += move + hold
  }

  for (const element of elements) {
    const timingEntry = timing[element.id]
    if (!timingEntry) continue
    const transition = segments.find(
      (segment) => segment.kind === 'transition' && segment.elementId === element.id
    )
    timingEntry.disappearStart =
      element.disappearAfter === 'transition' && transition
        ? transition.end
        : timingEntry.holdEnd
  }

  let duration = cursor
  for (const element of elements) {
    const disappear = element.disappear ?? 0
    const enabled = element.disappearEnabled ?? disappear > 0
    const timingEntry = timing[element.id]
    if (enabled && disappear > 0 && timingEntry) {
      duration = Math.max(duration, timingEntry.disappearStart + disappear)
    }
  }

  return { segments, duration, timing }
}

/** 找到 t 所在的段；t 等于总时长时返回最后一段 */
export function segmentAt(timeline: Timeline, time: number): TimelineSegment | null {
  if (timeline.segments.length === 0) return null
  const t = Math.min(Math.max(time, 0), timeline.duration)
  for (const segment of timeline.segments) {
    if (t >= segment.start && t < segment.end) return segment
  }
  return timeline.segments[timeline.segments.length - 1]
}

export function cameraOfElement(element: SceneElement): CameraPose {
  return element.camera
}

export function fitAllCamera(project: Project): CameraPose {
  if (project.elements.length === 0) {
    return { x: project.canvas.width / 2, y: project.canvas.height / 2, zoom: 1 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of project.elements) {
    minX = Math.min(minX, element.x)
    minY = Math.min(minY, element.y)
    maxX = Math.max(maxX, element.x + element.width)
    maxY = Math.max(maxY, element.y + element.height)
  }
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const zoom = Math.min(
    project.canvas.width / (width * 1.12),
    project.canvas.height / (height * 1.12)
  )
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom: Math.max(0.05, zoom)
  }
}

export interface ElementState {
  /** 0 = 还没出现，1 = 完全出现 */
  progress: number
  visible: boolean
}

export type TimelinePhase = 'idle' | 'transition' | 'appear' | 'hold' | 'end'

export interface TimelineSample {
  time: number
  camera: CameraPose
  phase: TimelinePhase
  activeElementId: string | null
  elements: Record<string, ElementState>
}

export function sampleTimeline(project: Project, timeline: Timeline, time: number): TimelineSample {
  const elements: Record<string, ElementState> = {}

  for (const element of project.elements) {
    const appearStart = timeline.timing[element.id]?.appearStart ?? 0
    const duration = Math.max(0, element.appear.duration)

    if (time < appearStart) {
      elements[element.id] = { progress: 0, visible: false }
      continue
    }

    if (duration === 0) {
      elements[element.id] = { progress: 1, visible: true }
      continue
    }

    const raw = (time - appearStart) / duration
    if (raw >= 1) {
      elements[element.id] = { progress: 1, visible: true }
    } else {
      elements[element.id] = {
        progress: ease(element.appear.easing, raw),
        visible: true
      }
    }
  }

  const segment = segmentAt(timeline, time)

  if (!segment) {
    return {
      time,
      camera: { x: project.canvas.width / 2, y: project.canvas.height / 2, zoom: 1 },
      phase: 'idle',
      activeElementId: null,
      elements
    }
  }

  if (segment.kind === 'ending') {
    const span = Math.max(1e-6, segment.moveEnd - segment.start)
    const k = clamp01((time - segment.start) / span)
    return {
      time,
      camera:
        time >= segment.moveEnd
          ? segment.to
          : lerpCamera(segment.from, segment.to, ease(segment.easing, k)),
      phase: 'end',
      activeElementId: null,
      elements
    }
  }

  const element = project.elements.find((item) => item.id === segment.elementId)
  const camera = element?.camera ?? { x: project.canvas.width / 2, y: project.canvas.height / 2, zoom: 1 }

  if (segment.kind === 'transition') {
    const span = segment.end - segment.start
    const k = span <= 0 ? 1 : (time - segment.start) / span
    return {
      time,
      camera: lerpCamera(segment.from, segment.to, ease(segment.easing, k)),
      phase: time >= timeline.duration ? 'end' : 'transition',
      activeElementId: segment.elementId,
      elements
    }
  }

  return {
    time,
    camera,
    phase: time >= timeline.duration ? 'end' : segment.kind,
    activeElementId: segment.elementId,
    elements
  }
}

export interface Viewport {
  width: number
  height: number
}

/** 世界坐标 → 屏幕坐标，返回可直接给 ctx.setTransform 的矩阵 */
export interface Transform2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function viewTransform(camera: CameraPose, canvasWidth: number, viewport: Viewport): Transform2D {
  const scale = (viewport.width * camera.zoom) / canvasWidth
  return {
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    e: viewport.width / 2 - camera.x * scale,
    f: viewport.height / 2 - camera.y * scale
  }
}

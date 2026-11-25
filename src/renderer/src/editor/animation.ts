import type { ImagePlayEnd, ImagePlayStart, SceneElement } from '@shared/project'
import type { Timeline } from '@shared/timeline'
import type { AssetAnimation } from './assets'

export interface ImagePlayWindow {
  start: number
  end: number
}

export function imagePlayWindow(
  element: SceneElement,
  timeline: Timeline
): ImagePlayWindow | null {
  const timing = timeline.timing[element.id]
  if (!timing) return null
  const start =
    (element.imagePlayStart ?? 'after-appear') === 'with-appear'
      ? timing.appearStart
      : timing.appearEnd
  const transition = timeline.segments.find(
    (segment) => segment.kind === 'transition' && segment.elementId === element.id
  )
  const endMode: ImagePlayEnd = element.imagePlayEnd ?? 'transition-start'
  const end =
    endMode === 'continue'
      ? timeline.duration
      : endMode === 'transition-end'
        ? transition?.end ?? timing.holdEnd
        : timing.holdEnd
  return { start, end: Math.max(start, end) }
}

export function frameAtLocal(
  animation: AssetAnimation,
  playback: ImagePlayStart | ImagePlayEnd | 'once' | 'loop' | 'first' | 'last',
  local: number
): ImageBitmap {
  const frames = animation.frames
  if (playback === 'first') return frames[0].image
  if (playback === 'last') return frames[frames.length - 1].image

  const total = Math.max(0.001, animation.total)
  let time = Math.max(0, local)
  if (playback === 'loop') time %= total
  else if (time >= total) time = total - 1e-6

  let cursor = 0
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    if (time < cursor + frame.duration) return frame.image
    cursor += frame.duration
  }
  return frames[frames.length - 1].image
}

/** 某个时间点在当前元素播放窗口内的帧；窗口结束后停在最终帧。 */
export function imageFrameAt(
  animation: AssetAnimation,
  playback: SceneElement['imagePlayback'],
  window: ImagePlayWindow,
  time: number
): ImageBitmap {
  const mode = playback ?? 'once'
  if (mode === 'first' || mode === 'last') return frameAtLocal(animation, mode, 0)
  const endTime = Math.max(window.start, window.end)
  const local = Math.max(0, Math.min(time, endTime) - window.start)
  return frameAtLocal(animation, mode, local)
}

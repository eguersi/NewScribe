/// <reference types="vite/client" />

import type { NewScribeApi } from '@shared/types'

declare global {
  interface Window {
    newscribe: NewScribeApi
  }
}

declare module '*.svg?url' {
  const src: string
  export default src
}

declare module '*.wasm?url' {
  const src: string
  export default src
}

export {}

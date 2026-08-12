import type { NoteTakerApi } from './index'

/**
 * Teaches TypeScript about the object the preload script injects.
 * Without this, `window.api` in the renderer would be a type error.
 */
declare global {
  interface Window {
    api: NoteTakerApi
  }
}

export {}

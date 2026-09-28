import type { NoteMeta } from './types'

/**
 * Most recently edited first — for a capture tool, recency is the only
 * ordering anyone actually wants.
 *
 * Lives in `shared/` because both processes sort: the main process orders what
 * it reads off disk, and the renderer re-orders locally after a save or rename
 * rather than round-tripping the whole list. Two copies of this comparator
 * would be two chances to disagree about what "most recent" means.
 */
export function byRecency(a: NoteMeta, b: NoteMeta): number {
  return b.updatedAt - a.updatedAt
}

import { describe, expect, it } from 'vitest'
import { byRecency } from './sorting'
import type { NoteMeta } from './types'

const note = (id: string, updatedAt: number): NoteMeta => ({ id, title: id, updatedAt })

describe('byRecency', () => {
  it('orders most recently updated first', () => {
    const sorted = [note('old', 1000), note('newest', 3000), note('middle', 2000)].sort(byRecency)
    expect(sorted.map((n) => n.id)).toEqual(['newest', 'middle', 'old'])
  })

  it('treats equal timestamps as equal', () => {
    expect(byRecency(note('a', 500), note('b', 500))).toBe(0)
  })

  it('is safe to use on an already-sorted list', () => {
    // Array.prototype.sort is stable in modern JS, so re-sorting must not
    // reshuffle notes saved within the same millisecond.
    const input = [note('a', 500), note('b', 500), note('c', 500)]
    expect([...input].sort(byRecency).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
})

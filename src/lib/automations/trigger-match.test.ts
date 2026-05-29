import { describe, it, expect } from 'vitest'
import { tagTriggerMatches } from './engine'

describe('tagTriggerMatches', () => {
  const COHORT = 'tag-cohort-id'
  const D2D = 'tag-d2d-id'

  it('fires only for the configured tag', () => {
    expect(tagTriggerMatches({ tag_id: COHORT }, { tag_id: COHORT })).toBe(true)
    expect(tagTriggerMatches({ tag_id: COHORT }, { tag_id: D2D })).toBe(false)
  })

  it('does not fire when no tag is in context', () => {
    expect(tagTriggerMatches({ tag_id: COHORT }, undefined)).toBe(false)
    expect(tagTriggerMatches({ tag_id: COHORT }, {})).toBe(false)
  })

  it('fires for any tag when no tag_id configured (back-compat)', () => {
    expect(tagTriggerMatches({}, { tag_id: COHORT })).toBe(true)
    expect(tagTriggerMatches(null, { tag_id: COHORT })).toBe(true)
  })
})

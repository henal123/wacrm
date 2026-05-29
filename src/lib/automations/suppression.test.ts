import { describe, it, expect } from 'vitest'
import { suppressionReason } from './suppression'

describe('suppressionReason', () => {
  it('suppresses opted-out contacts', () => {
    expect(suppressionReason(['program:cohort', 'optout:whatsapp'])).toBe('opted_out')
  })

  it('suppresses paused sequences (interest reply / agent takeover)', () => {
    expect(suppressionReason(['seq:cohort', 'seq:paused'])).toBe('sequence_paused')
  })

  it('prioritizes opt-out over pause', () => {
    expect(suppressionReason(['seq:paused', 'optout:whatsapp'])).toBe('opted_out')
  })

  it('allows normal contacts through', () => {
    expect(suppressionReason(['program:cohort', 'stage:new'])).toBeNull()
    expect(suppressionReason([])).toBeNull()
  })

  it('lets transactional sends bypass seq:paused but not opt-out', () => {
    expect(suppressionReason(['seq:paused'], { transactional: true })).toBeNull()
    expect(suppressionReason(['optout:whatsapp'], { transactional: true })).toBe('opted_out')
  })
})

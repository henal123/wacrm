import { describe, it, expect } from 'vitest'
import { previewTextForMessage } from './preview'

describe('previewTextForMessage', () => {
  it('returns the body for text messages', () => {
    expect(previewTextForMessage('text', 'hello there')).toBe('hello there')
  })

  it('prefers a non-empty body over the type fallback for any type', () => {
    expect(previewTextForMessage('interactive', 'Pick an option')).toBe('Pick an option')
    expect(previewTextForMessage('template', 'Hi John')).toBe('Hi John')
  })

  it('falls back to a type label when there is no body', () => {
    expect(previewTextForMessage('image', null)).toBe('📷 Photo')
    expect(previewTextForMessage('video')).toBe('🎥 Video')
    expect(previewTextForMessage('audio')).toBe('🎙️ Audio')
    expect(previewTextForMessage('document', '')).toBe('📎 Document')
    expect(previewTextForMessage('location')).toBe('📍 Location')
    expect(previewTextForMessage('interactive')).toBe('[Interactive]')
  })

  it('uses the template name when a template has no body', () => {
    expect(previewTextForMessage('template', null, 'welcome_v2')).toBe('Template: welcome_v2')
  })

  it('falls back to a generic label for a body-less, name-less template', () => {
    expect(previewTextForMessage('template', '   ')).toBe('[Template]')
  })

  it('never returns an empty string for non-text content', () => {
    for (const t of ['image', 'video', 'audio', 'document', 'location', 'template', 'interactive'] as const) {
      expect(previewTextForMessage(t, null)).not.toBe('')
    }
  })
})

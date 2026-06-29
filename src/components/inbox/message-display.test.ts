import { describe, it, expect } from 'vitest'
import { templateBubbleBody, isCustomerInteractiveTap } from './message-display'

describe('templateBubbleBody', () => {
  it('returns the rendered body when present', () => {
    expect(templateBubbleBody({ content_text: 'Hi John, your order shipped', template_name: 'order_update' }))
      .toBe('Hi John, your order shipped')
  })

  it('falls back to the template name when the body is missing (historical rows)', () => {
    expect(templateBubbleBody({ content_text: undefined, template_name: 'welcome_v2' }))
      .toBe('Template: welcome_v2')
    expect(templateBubbleBody({ content_text: '   ', template_name: 'welcome_v2' }))
      .toBe('Template: welcome_v2')
  })

  it('returns null when neither body nor name is available', () => {
    expect(templateBubbleBody({ content_text: '', template_name: undefined })).toBeNull()
  })
})

describe('isCustomerInteractiveTap', () => {
  it('is true for a customer tap', () => {
    expect(isCustomerInteractiveTap({ sender_type: 'customer' })).toBe(true)
  })

  it('is false for a bot-sent interactive prompt', () => {
    expect(isCustomerInteractiveTap({ sender_type: 'bot' })).toBe(false)
    expect(isCustomerInteractiveTap({ sender_type: 'agent' })).toBe(false)
  })
})

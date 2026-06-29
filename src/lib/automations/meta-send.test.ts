import { describe, it, expect } from 'vitest'
import { interpolateTemplateParams } from './meta-send'

describe('interpolateTemplateParams', () => {
  it('substitutes positional placeholders (1-indexed)', () => {
    expect(interpolateTemplateParams('Hi {{1}}, your code is {{2}}', ['John', '4821'])).toBe(
      'Hi John, your code is 4821',
    )
  })

  it('tolerates whitespace inside the braces', () => {
    expect(interpolateTemplateParams('Hello {{ 1 }}', ['World'])).toBe('Hello World')
  })

  it('leaves placeholders intact when a param is missing', () => {
    expect(interpolateTemplateParams('Hi {{1}} and {{2}}', ['Solo'])).toBe('Hi Solo and {{2}}')
  })

  it('returns the body unchanged when there are no placeholders', () => {
    expect(interpolateTemplateParams('No variables here', ['unused'])).toBe('No variables here')
  })

  it('does not misorder double-digit placeholders', () => {
    const params = Array.from({ length: 10 }, (_, i) => String(i + 1))
    expect(interpolateTemplateParams('{{1}}-{{10}}', params)).toBe('1-10')
  })
})

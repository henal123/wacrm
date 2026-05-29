import { describe, it, expect } from 'vitest'
import {
  canonicalizeIndianPhone,
  buildIngestArgs,
  type IngestLeadPayload,
} from './ingest'

describe('canonicalizeIndianPhone', () => {
  it('prefixes 91 onto a bare 10-digit Indian mobile', () => {
    expect(canonicalizeIndianPhone('9876543210')).toBe('919876543210')
  })

  it('strips formatting from a +91 number', () => {
    expect(canonicalizeIndianPhone('+91 98765 43210')).toBe('919876543210')
    expect(canonicalizeIndianPhone('+91-98765-43210')).toBe('919876543210')
  })

  it('drops a domestic trunk 0 before a 10-digit mobile', () => {
    expect(canonicalizeIndianPhone('09876543210')).toBe('919876543210')
  })

  it('drops a trunk 0 sitting after the 91 country code', () => {
    expect(canonicalizeIndianPhone('91 0 98765 43210')).toBe('919876543210')
  })

  it('passes through an already-canonical 91 number', () => {
    expect(canonicalizeIndianPhone('919876543210')).toBe('919876543210')
  })

  it('collapses every variant of one number to the same canonical form', () => {
    const forms = ['9876543210', '+919876543210', '09876543210', '91 98765 43210']
    const canon = forms.map((f) => canonicalizeIndianPhone(f))
    expect(new Set(canon)).toEqual(new Set(['919876543210']))
  })

  it('keeps a valid foreign number as-is (does not force 91)', () => {
    // US +1 415 555 0123
    expect(canonicalizeIndianPhone('+14155550123')).toBe('14155550123')
  })

  it('rejects junk and too-short input', () => {
    expect(canonicalizeIndianPhone('')).toBeNull()
    expect(canonicalizeIndianPhone('abc')).toBeNull()
    expect(canonicalizeIndianPhone('12345')).toBeNull()
  })
})

describe('buildIngestArgs', () => {
  const uid = '11111111-1111-1111-1111-111111111111'

  it('maps a cohort application payload to RPC args', () => {
    const payload: IngestLeadPayload = {
      name: '  Asha Verma ',
      phone: '+91 98765 43210',
      email: 'Asha@Example.com',
      source: 'cohort-app',
      program: 'cohort',
      business_stage: 'idea',
      application_status: 'applied',
      portfolio_url: 'https://behance.net/asha',
      external_ref: 'cohort:42',
      create_deal: true,
    }
    expect(buildIngestArgs(uid, payload)).toEqual({
      p_user_id: uid,
      p_phone: '919876543210',
      p_name: 'Asha Verma',
      p_email: 'asha@example.com',
      p_source: 'cohort-app',
      p_program: 'cohort',
      p_business_stage: 'idea',
      p_application_status: 'applied',
      p_portfolio: 'https://behance.net/asha',
      p_marketing_consent: true,
      p_external_ref: 'cohort:42',
      p_notes: null,
      p_create_deal: true,
    })
  })

  it('defaults consent to true and create_deal to false', () => {
    const args = buildIngestArgs(uid, { phone: '9876543210', source: 'brochure' })
    expect(args.p_marketing_consent).toBe(true)
    expect(args.p_create_deal).toBe(false)
  })

  it('honors an explicit consent=false', () => {
    const args = buildIngestArgs(uid, {
      phone: '9876543210',
      source: 'contact',
      marketing_consent: false,
    })
    expect(args.p_marketing_consent).toBe(false)
  })

  it('coerces blank optional fields to null', () => {
    const args = buildIngestArgs(uid, {
      phone: '9876543210',
      source: 'contact',
      name: '   ',
      email: '',
      notes: '[Careers] hi',
    })
    expect(args.p_name).toBeNull()
    expect(args.p_email).toBeNull()
    expect(args.p_notes).toBe('[Careers] hi')
  })

  it('throws on an unusable phone', () => {
    expect(() => buildIngestArgs(uid, { phone: 'nope', source: 'contact' })).toThrow(
      'invalid_phone',
    )
  })
})

import { normalizePhone, isValidE164 } from '@/lib/whatsapp/phone-utils'

/**
 * Lead ingestion — pure helpers shared by POST /api/leads/ingest.
 *
 * Kept side-effect free so they're unit-testable without a DB or Meta.
 * The route layer handles auth, rate limiting, and the `ingest_lead` RPC
 * call (see migration 014); these functions only normalize + map.
 */

/** Shape the Apex website POSTs to /api/leads/ingest. */
export interface IngestLeadPayload {
  phone: string
  name?: string
  email?: string
  /** brochure | cohort-app | d2d-inquiry | contact | … */
  source: string
  /** cohort | d2d | advisory */
  program?: string
  business_stage?: string
  application_status?: string
  portfolio_url?: string
  /** Defaults to true (consent established by the site's privacy policy). */
  marketing_consent?: boolean
  /** Stable idempotency key, e.g. `cohort:<application-id>`. */
  external_ref?: string
  notes?: string
  /** Create a pipeline deal (cohort/d2d applications), not for brochure/contact. */
  create_deal?: boolean
}

/** Args passed to the `ingest_lead` Postgres RPC (names match the function). */
export interface IngestLeadRpcArgs {
  p_user_id: string
  p_phone: string
  p_name: string | null
  p_email: string | null
  p_source: string | null
  p_program: string | null
  p_business_stage: string | null
  p_application_status: string | null
  p_portfolio: string | null
  p_marketing_consent: boolean
  p_external_ref: string | null
  p_notes: string | null
  p_create_deal: boolean
}

/**
 * Canonicalize a phone number to digits-only E.164 *without* the `+`,
 * preferring India's `91XXXXXXXXXX` form so dedupe is stable.
 *
 * Rules:
 *   - 10 digits starting 6-9 (Indian mobile)      → prefix `91`
 *   - 0 + 10-digit Indian mobile (trunk prefix)   → drop 0, prefix `91`
 *   - 91 + trunk 0 + 10-digit                      → drop the trunk 0
 *   - already `91XXXXXXXXXX`                        → unchanged
 *   - anything else that is valid E.164            → kept as-is (other countries)
 * Returns null when the result isn't a plausible E.164 number.
 */
export function canonicalizeIndianPhone(raw: string): string | null {
  const digits = normalizePhone(raw || '')
  if (!digits) return null

  let out = digits
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    out = '91' + digits
  } else if (digits.length === 11 && /^0[6-9]/.test(digits)) {
    out = '91' + digits.slice(1)
  } else if (digits.length === 13 && digits.startsWith('910')) {
    out = '91' + digits.slice(3)
  } // else: already-international (incl. 12-digit 91…) — keep digits as-is

  return isValidE164('+' + out) ? out : null
}

function clean(s?: string | null): string | null {
  if (s == null) return null
  const t = String(s).trim()
  return t === '' ? null : t
}

/**
 * Map the website payload to RPC args. Throws on an unusable phone so the
 * route can return 400. `marketing_consent` defaults to true; `create_deal`
 * defaults to false.
 */
export function buildIngestArgs(
  userId: string,
  payload: IngestLeadPayload,
): IngestLeadRpcArgs {
  const phone = canonicalizeIndianPhone(payload.phone)
  if (!phone) {
    throw new Error('invalid_phone')
  }
  const email = clean(payload.email)
  return {
    p_user_id: userId,
    p_phone: phone,
    p_name: clean(payload.name),
    p_email: email ? email.toLowerCase() : null,
    p_source: clean(payload.source),
    p_program: clean(payload.program),
    p_business_stage: clean(payload.business_stage),
    p_application_status: clean(payload.application_status),
    p_portfolio: clean(payload.portfolio_url),
    p_marketing_consent: payload.marketing_consent !== false,
    p_external_ref: clean(payload.external_ref),
    p_notes: clean(payload.notes),
    p_create_deal: payload.create_deal === true,
  }
}

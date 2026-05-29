import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { buildIngestArgs, type IngestLeadPayload } from '@/lib/leads/ingest'

/**
 * Inbound lead pipe from the Apex Fashion Lab website.
 *
 * The caller is the marketing site (a different origin, no Supabase
 * session), so auth is a shared secret (`x-wacrm-secret` == LEAD_INGEST_SECRET)
 * — same trust model as the cron endpoints. All writes go through the
 * `ingest_lead` Postgres RPC (migration 014), which is atomic and
 * advisory-locked so concurrent submits for one phone can't double-insert.
 *
 * Leads belong to a single operator account (LEAD_INGEST_USER_ID). The
 * apply-confirmation WhatsApp template is sent only when explicitly enabled
 * (LEAD_INGEST_SEND_TEMPLATE) and never blocks ingestion if Meta rejects it.
 */
export async function POST(request: Request) {
  const expected = process.env.LEAD_INGEST_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'lead ingestion not configured' }, { status: 503 })
  }
  const userId = process.env.LEAD_INGEST_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'LEAD_INGEST_USER_ID not set' }, { status: 503 })
  }

  // Constant-time secret compare (length pre-check required by timingSafeEqual).
  const supplied = request.headers.get('x-wacrm-secret') ?? ''
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit('lead-ingest', RATE_LIMITS.leadIngest)
  if (!rl.success) return rateLimitResponse(rl)

  let body: IngestLeadPayload
  try {
    body = (await request.json()) as IngestLeadPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body?.phone || !body?.source) {
    return NextResponse.json({ error: 'phone and source are required' }, { status: 400 })
  }

  let args
  try {
    args = buildIngestArgs(userId, body)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'bad_request' },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()
  const { data, error } = await db.rpc('ingest_lead', args)
  if (error) {
    console.error('[leads/ingest] rpc failed:', error.message)
    // Surface the DB error to the (secret-authed) caller — this endpoint is
    // server-to-server only, so returning the Postgres code/message is safe
    // and makes setup/debugging tractable.
    return NextResponse.json(
      {
        error: 'ingest_failed',
        code: error.code ?? null,
        detail: error.message ?? null,
        hint: error.hint ?? null,
      },
      { status: 500 },
    )
  }

  const result = (data ?? {}) as {
    contact_id?: string
    conversation_id?: string
    deal_id?: string | null
    deduped?: boolean
  }

  // Apply-confirmation template — opt-in via env, applications only, first
  // creation only, and never fatal (Meta will reject until the template is
  // approved; that must not fail the ingest).
  let messaged = false
  if (
    process.env.LEAD_INGEST_SEND_TEMPLATE === 'true' &&
    args.p_create_deal &&
    args.p_marketing_consent &&
    !result.deduped &&
    result.contact_id &&
    result.conversation_id
  ) {
    try {
      await engineSendTemplate({
        userId,
        conversationId: result.conversation_id,
        contactId: result.contact_id,
        templateName: 'apex_application_received',
        language: 'en',
        params: [
          args.p_name ?? 'there',
          args.p_program === 'd2d' ? 'Design to Delivery' : 'Fashionpreneur Cohort',
        ],
      })
      messaged = true
    } catch (e) {
      console.error(
        '[leads/ingest] template send failed (non-fatal):',
        e instanceof Error ? e.message : e,
      )
    }
  }

  return NextResponse.json({
    ok: true,
    contact_id: result.contact_id ?? null,
    deal_id: result.deal_id ?? null,
    deduped: result.deduped ?? false,
    messaged,
  })
}

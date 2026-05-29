import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { canonicalizeIndianPhone } from '@/lib/leads/ingest'

/**
 * TidyCal booking webhook → wacrm.
 *
 * On a `booking.created` event we match the booker to an existing contact
 * (by phone, then email), record the call time, move their open deal to the
 * "call booked" stage, and pause automated nurture (`seq:paused`) so a human
 * owns the run from here. Optionally fires the confirmation template.
 *
 * Auth: shared secret via `x-tidycal-secret` header or `?secret=` query
 * (TidyCal's webhook UI allows either), constant-time compared to
 * TIDYCAL_WEBHOOK_SECRET. Leads belong to LEAD_INGEST_USER_ID.
 *
 * Payload is parsed defensively — TidyCal nests the booking under `data`
 * (or sometimes top-level) with the booker under `contact`.
 */
export async function POST(request: Request) {
  const expected = process.env.TIDYCAL_WEBHOOK_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'tidycal webhook not configured' }, { status: 503 })
  }
  const userId = process.env.LEAD_INGEST_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'LEAD_INGEST_USER_ID not set' }, { status: 503 })
  }

  const url = new URL(request.url)
  const supplied =
    request.headers.get('x-tidycal-secret') ?? url.searchParams.get('secret') ?? ''
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = (body.event ?? body.type ?? '') as string
  // Only act on creations; ack everything else so TidyCal stops retrying.
  if (event && !/created/i.test(event)) {
    return NextResponse.json({ ok: true, ignored: event })
  }

  const data = (body.data ?? body) as Record<string, unknown>
  const contact = (data.contact ?? {}) as Record<string, unknown>
  const name = str(contact.name) ?? str(data.name)
  const email = str(contact.email) ?? str(data.email)
  const rawPhone =
    str(contact.phone_number) ?? str(contact.phone) ?? str(data.phone_number)
  const callAt = str(data.starts_at) ?? str(data.start_at) ?? str(data.starts_at_utc)
  const phone = rawPhone ? canonicalizeIndianPhone(rawPhone) : null

  if (!email && !phone) {
    return NextResponse.json({ error: 'no contact identifier in payload' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Resolve the contact: phone (last-10) first, then email.
  let contactId: string | null = null
  let conversationId: string | null = null
  if (phone) {
    const last10 = phone.slice(-10)
    const { data: rows } = await db
      .from('contacts')
      .select('id, phone')
      .eq('user_id', userId)
    contactId =
      (rows ?? []).find(
        (r: { id: string; phone: string }) =>
          (r.phone ?? '').replace(/\D/g, '').slice(-10) === last10,
      )?.id ?? null
  }
  if (!contactId && email) {
    const { data: row } = await db
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .ilike('email', email)
      .maybeSingle()
    contactId = row?.id ?? null
  }

  if (!contactId) {
    // Booker isn't in the CRM yet — nothing to update. Ack so TidyCal
    // doesn't retry; the lead will arrive via the normal ingest pipe.
    return NextResponse.json({ ok: true, matched: false })
  }

  // Conversation (find-or-create) for any send.
  const { data: conv } = await db
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .maybeSingle()
  conversationId = conv?.id ?? null
  if (!conversationId) {
    const { data: created } = await db
      .from('conversations')
      .insert({ user_id: userId, contact_id: contactId, status: 'open' })
      .select('id')
      .single()
    conversationId = created?.id ?? null
  }

  if (callAt) await setCustomField(db, userId, contactId, 'call_at', callAt)
  await addTags(db, userId, contactId, ['stage:call-booked', 'seq:paused'])
  const movedTo = await moveOpenDealToBooked(db, userId, contactId)

  let messaged = false
  if (
    process.env.LEAD_INGEST_SEND_TEMPLATE === 'true' &&
    conversationId &&
    callAt
  ) {
    try {
      await engineSendTemplate({
        userId,
        conversationId,
        contactId,
        templateName: 'apex_call_confirmed',
        language: 'en',
        params: [name ?? 'there', formatCallTime(callAt)],
      })
      messaged = true
    } catch (e) {
      console.error(
        '[tidycal] confirmation send failed (non-fatal):',
        e instanceof Error ? e.message : e,
      )
    }
  }

  // Schedule 24h + 2h reminders via the automations cron. Only when template
  // sends are enabled and the slot is far enough out; marked transactional so
  // the booked-call `seq:paused` doesn't suppress them.
  let remindersScheduled = 0
  if (process.env.LEAD_INGEST_SEND_TEMPLATE === 'true' && conversationId && callAt) {
    const callMs = new Date(callAt).getTime()
    if (!Number.isNaN(callMs)) {
      const vars = { name: name ?? 'there', call_time: formatCallTime(callAt) }
      remindersScheduled += await scheduleReminder(
        db, userId, 'Call reminder 24h', contactId, conversationId, callMs - 24 * 3_600_000, vars,
      )
      remindersScheduled += await scheduleReminder(
        db, userId, 'Call reminder 2h', contactId, conversationId, callMs - 2 * 3_600_000, vars,
      )
    }
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    moved_to: movedTo,
    messaged,
    reminders_scheduled: remindersScheduled,
  })
}

/**
 * Queue a reminder send for `runAtMs` by inserting an automation_pending_executions
 * row pointing at the named reminder automation. Returns 1 if scheduled, 0 if
 * skipped (past time, or the reminder automation isn't seeded yet).
 */
async function scheduleReminder(
  db: Db,
  userId: string,
  automationName: string,
  contactId: string,
  conversationId: string,
  runAtMs: number,
  vars: Record<string, unknown>,
): Promise<number> {
  if (runAtMs <= Date.now()) return 0
  const { data: auto } = await db
    .from('automations')
    .select('id')
    .eq('user_id', userId)
    .eq('name', automationName)
    .maybeSingle()
  if (!auto) return 0
  const { error } = await db.from('automation_pending_executions').insert({
    automation_id: auto.id,
    user_id: userId,
    contact_id: contactId,
    log_id: null,
    parent_step_id: null,
    branch: null,
    next_step_position: 0,
    context: { conversation_id: conversationId, vars, transactional: true },
    run_at: new Date(runAtMs).toISOString(),
    status: 'pending',
  })
  if (error) {
    console.error('[tidycal] reminder schedule failed:', error.message)
    return 0
  }
  return 1
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function formatCallTime(iso: string): string {
  // Human-ish IST rendering; falls back to the raw value.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}

type Db = ReturnType<typeof supabaseAdmin>

async function setCustomField(
  db: Db,
  userId: string,
  contactId: string,
  field: string,
  value: string,
): Promise<void> {
  let { data: cf } = await db
    .from('custom_fields')
    .select('id')
    .eq('user_id', userId)
    .eq('field_name', field)
    .maybeSingle()
  if (!cf) {
    const { data: created } = await db
      .from('custom_fields')
      .insert({ user_id: userId, field_name: field, field_type: 'text' })
      .select('id')
      .single()
    cf = created
  }
  if (!cf) return
  await db
    .from('contact_custom_values')
    .upsert(
      { contact_id: contactId, custom_field_id: cf.id, value },
      { onConflict: 'contact_id,custom_field_id' },
    )
}

async function addTags(
  db: Db,
  userId: string,
  contactId: string,
  names: string[],
): Promise<void> {
  for (const name of names) {
    let { data: tag } = await db
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle()
    if (!tag) {
      const { data: created } = await db
        .from('tags')
        .insert({ user_id: userId, name, color: '#6366f1' })
        .select('id')
        .single()
      tag = created
    }
    if (!tag) continue
    await db
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: tag.id },
        { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
      )
  }
}

/**
 * Move the contact's open deal into the booked stage of its pipeline:
 * "Discovery Call" for D2D Sales, "Call Booked" for Cohort Admissions.
 * Returns the stage moved to, or null if no open deal / stage found.
 */
async function moveOpenDealToBooked(
  db: Db,
  userId: string,
  contactId: string,
): Promise<string | null> {
  const { data: deal } = await db
    .from('deals')
    .select('id, pipeline_id, pipelines(name)')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .maybeSingle()
  if (!deal) return null

  const pipe = (deal as { pipelines?: { name?: string } | { name?: string }[] }).pipelines
  const pipelineName = Array.isArray(pipe) ? pipe[0]?.name : pipe?.name
  const stageName = pipelineName === 'D2D Sales' ? 'Discovery Call' : 'Call Booked'

  const { data: stage } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', deal.pipeline_id)
    .eq('name', stageName)
    .maybeSingle()
  if (!stage) return null

  await db.from('deals').update({ stage_id: stage.id }).eq('id', deal.id)
  return stageName
}

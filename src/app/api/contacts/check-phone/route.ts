import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { canonicalizeIndianPhone } from '@/lib/leads/ingest'
import { phonesMatch } from '@/lib/whatsapp/phone-utils'

/**
 * Check if a phone number already exists on a contact for this user. Called
 * by the Contacts UI before creating a new contact, to prevent the same
 * person being added multiple times in different formats (the manual-add
 * path doesn't go through ingest_lead, so it bypasses the RPC's dedupe).
 *
 * Uses the indexed last-10-digit lookup (migration 017). If the RPC isn't
 * applied yet, falls back to fetching contacts for the user and matching
 * with phonesMatch so the gate still works (just slower).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const raw = body.phone?.trim()
  if (!raw) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  // Canonicalize for last-10 match; if it doesn't normalize at all, still
  // try a raw last-10-digit match so partial entries get caught too.
  const canonical = canonicalizeIndianPhone(raw)
  const last10 = (canonical ?? raw).replace(/\D/g, '').slice(-10)
  if (last10.length < 10) return NextResponse.json({ existing: null })

  const admin = supabaseAdmin()
  const { data: viaRpc, error: rpcErr } = await admin.rpc('find_contact_by_phone_last10', {
    p_user_id: user.id,
    p_last10: last10,
  })
  if (!rpcErr && Array.isArray(viaRpc) && viaRpc.length) {
    const c = viaRpc[0] as { id: string; name: string | null; phone: string; email: string | null }
    return NextResponse.json({ existing: { id: c.id, name: c.name, phone: c.phone, email: c.email } })
  }

  // Fallback (RPC not applied yet) — fetch + JS match. Same logic as the
  // webhook's findOrCreateContact, so behavior matches even pre-migration.
  if (rpcErr) {
    const { data: contacts } = await admin
      .from('contacts')
      .select('id,name,phone,email')
      .eq('user_id', user.id)
    const hit = (contacts ?? []).find((c) => phonesMatch(c.phone, raw))
    if (hit) return NextResponse.json({ existing: hit })
  }
  return NextResponse.json({ existing: null })
}

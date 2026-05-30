import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'

/**
 * Dispatch the `tag_added` automation trigger after a tag is added to a
 * contact in the UI. The client adds the contact_tags row directly (browser
 * Supabase), then calls this endpoint so tag-triggered automations
 * (lifecycle sequences like post-call follow-up, onboarding, re-engagement)
 * actually fire. Authed by the user's session; only fires for contacts the
 * user owns.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { contact_id?: string; tag_id?: string; conversation_id?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { contact_id, tag_id, conversation_id } = body
  if (!contact_id || !tag_id) {
    return NextResponse.json({ error: 'contact_id and tag_id required' }, { status: 400 })
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('user_id')
    .eq('id', contact_id)
    .maybeSingle()
  if (!contact || contact.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runAutomationsForTrigger({
      userId: user.id,
      triggerType: 'tag_added',
      contactId: contact_id,
      context: { tag_id, conversation_id },
    })
  } catch (e) {
    console.error('[tag-added] dispatch failed:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}

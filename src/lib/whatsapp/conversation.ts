import type { SupabaseClient } from '@supabase/supabase-js'

// ------------------------------------------------------------
// Shared find-or-create for a contact's conversation.
//
// Conversations were historically only created by the inbound webhook,
// so any path that wants to send to a contact who has never replied
// (the manual "Start chat" action, automations enrolling imported
// leads, etc.) needs to create the conversation itself. The manual
// send route already does this inline (src/app/api/whatsapp/send/route.ts);
// the automation engine used to *throw* when no conversation existed,
// which silently dropped nurture sends to never-messaged leads. This
// helper is the single canonical implementation those callers share.
//
// Takes the admin (service-role) client as a parameter so each engine
// passes its own lazily-initialized client — the helper itself stays
// free of any module-load env coupling.
// ------------------------------------------------------------

/**
 * Return the id of `contactId`'s conversation for `userId`, creating one
 * if none exists. Safe to call concurrently and resilient to duplicate
 * conversation rows (there is no unique constraint on
 * `conversations(user_id, contact_id)`).
 */
export async function findOrCreateConversation(
  admin: SupabaseClient,
  userId: string,
  contactId: string,
): Promise<{ id: string }> {
  const existing = await lookupConversationId(admin, userId, contactId)
  if (existing) return { id: existing }

  const { data: created, error: createErr } = await admin
    .from('conversations')
    .insert({
      user_id: userId,
      contact_id: contactId,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!createErr && created?.id) {
    return { id: created.id as string }
  }

  // 23505 = unique_violation. A concurrent caller won the race and
  // created the row between our lookup and insert — re-read and use it.
  if ((createErr as { code?: string } | null)?.code === '23505') {
    const raced = await lookupConversationId(admin, userId, contactId)
    if (raced) return { id: raced }
  }

  throw new Error(
    `failed to create conversation for contact ${contactId}: ${createErr?.message ?? 'unknown error'}`,
  )
}

/**
 * Newest existing conversation id for the (user, contact) pair, or null.
 *
 * Uses `.limit(1)` + `rows[0]` rather than `.single()`/`.maybeSingle()`
 * because those throw on >1 row — and with no DB-level uniqueness on
 * `(user_id, contact_id)`, a duplicate must not crash the send path.
 * Mirrors the defensive pattern in `flows/engine.ts` loadActiveRunForContact.
 */
async function lookupConversationId(
  admin: SupabaseClient,
  userId: string,
  contactId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
  if (error) {
    throw new Error(`conversation lookup failed: ${error.message}`)
  }
  const rows = (data as Array<{ id: string }> | null) ?? []
  return rows[0]?.id ?? null
}

/**
 * Client-side helper to fire the `tag_added` automation trigger after a tag
 * is added to a contact in the UI.
 *
 * The browser writes the `contact_tags` row directly (anon Supabase client),
 * then calls `POST /api/automations/tag-added` so tag-triggered automations
 * (lifecycle sequences like post-call follow-up, onboarding, re-engagement)
 * actually enroll. Every site that adds a tag should call this for each
 * NEWLY-added tag — pre-existing tags and removals must not fire it.
 *
 * Fire-and-forget: enrollment is non-fatal, so any failure is swallowed and
 * never blocks the tag write or the surrounding UI flow.
 */
export function dispatchTagAdded(contactId: string, tagId: string): void {
  fetch('/api/automations/tag-added', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_id: contactId, tag_id: tagId }),
  }).catch(() => {});
}

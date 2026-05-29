/**
 * Whether an automated (bot) send to a contact must be suppressed.
 *
 * Checked at wait-step *resume* time so a tag applied AFTER a sequence was
 * scheduled still stops the next send. Two universally-safe rules:
 *   - `optout:whatsapp` — the contact unsubscribed (STOP keyword). Never message.
 *   - `seq:paused`      — an interested reply or an agent takeover paused the
 *                         bot so a human can drive the conversation (the hybrid
 *                         reply model).
 *
 * Cadence concerns (quiet hours, weekly frequency caps) are intentionally NOT
 * here: applying them to every automation would delay legitimate short or
 * time-sensitive ones (e.g. a 5-minute welcome step, or a call reminder). Those
 * are handled per nurture sequence via wait-step spacing and scheduled run_at.
 */
export const SUPPRESSION_TAGS = ['optout:whatsapp', 'seq:paused'] as const

export function suppressionReason(tags: readonly string[]): string | null {
  if (tags.includes('optout:whatsapp')) return 'opted_out'
  if (tags.includes('seq:paused')) return 'sequence_paused'
  return null
}

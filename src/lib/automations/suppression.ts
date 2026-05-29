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

export function suppressionReason(
  tags: readonly string[],
  opts?: { transactional?: boolean },
): string | null {
  // Opt-out always suppresses — never message someone who unsubscribed.
  if (tags.includes('optout:whatsapp')) return 'opted_out'
  // A paused sequence (interest reply / agent takeover) stops nurture, but
  // NOT transactional sends like booked-call reminders.
  if (!opts?.transactional && tags.includes('seq:paused')) return 'sequence_paused'
  return null
}

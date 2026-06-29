import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findOrCreateConversation } from './conversation'

// Minimal chainable stub of the supabase query builder. The lookup chain
// ends at `.limit()` (awaited directly); the insert chain ends at
// `.single()`. `lookups` is a queue of responses consumed one per
// find-or-create lookup; `insert` is the single insert response.
function makeClient(opts: {
  lookups: Array<{ data: unknown; error: unknown }>
  insert?: { data: unknown; error: unknown }
}) {
  const lookups = [...opts.lookups]
  const insertSpy = vi.fn()
  const client = {
    from() {
      const builder: Record<string, unknown> = {}
      const passthrough = () => builder
      builder.select = passthrough
      builder.eq = passthrough
      builder.order = passthrough
      builder.limit = () =>
        Promise.resolve(lookups.shift() ?? { data: [], error: null })
      builder.insert = (payload: unknown) => {
        insertSpy(payload)
        return builder
      }
      builder.single = () =>
        Promise.resolve(opts.insert ?? { data: null, error: null })
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, insertSpy }
}

describe('findOrCreateConversation', () => {
  it('returns the existing conversation id without inserting', async () => {
    const { client, insertSpy } = makeClient({
      lookups: [{ data: [{ id: 'conv-existing' }], error: null }],
    })
    const result = await findOrCreateConversation(client, 'user-1', 'contact-1')
    expect(result).toEqual({ id: 'conv-existing' })
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('creates a conversation when none exists', async () => {
    const { client, insertSpy } = makeClient({
      lookups: [{ data: [], error: null }],
      insert: { data: { id: 'conv-new' }, error: null },
    })
    const result = await findOrCreateConversation(client, 'user-1', 'contact-1')
    expect(result).toEqual({ id: 'conv-new' })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', contact_id: 'contact-1' }),
    )
  })

  it('returns the newest of duplicate rows without throwing', async () => {
    // The helper uses .limit(1) + rows[0], so a duplicate (user, contact)
    // pair resolves to the first row instead of crashing like .single().
    const { client } = makeClient({
      lookups: [{ data: [{ id: 'conv-newest' }, { id: 'conv-older' }], error: null }],
    })
    const result = await findOrCreateConversation(client, 'user-1', 'contact-1')
    expect(result).toEqual({ id: 'conv-newest' })
  })

  it('re-reads the existing row when a concurrent insert races (23505)', async () => {
    const { client } = makeClient({
      lookups: [
        { data: [], error: null }, // first lookup: none yet
        { data: [{ id: 'conv-raced' }], error: null }, // post-23505 re-read
      ],
      insert: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    const result = await findOrCreateConversation(client, 'user-1', 'contact-1')
    expect(result).toEqual({ id: 'conv-raced' })
  })

  it('throws when the insert fails for a non-race reason', async () => {
    const { client } = makeClient({
      lookups: [{ data: [], error: null }],
      insert: { data: null, error: { code: '500', message: 'boom' } },
    })
    await expect(
      findOrCreateConversation(client, 'user-1', 'contact-1'),
    ).rejects.toThrow(/failed to create conversation/)
  })
})

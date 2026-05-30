#!/usr/bin/env node
/**
 * One-time: add `message_template_status_update` to the WA-CRM Meta App's
 * subscribed webhook fields, so template approvals/rejections from Meta
 * automatically update the local message_templates row (handled in
 * src/app/api/whatsapp/webhook/route.ts).
 *
 * Usage:
 *   META_APP_ID=...  META_APP_SECRET=...  node scripts/subscribe-template-status.mjs
 *
 * Idempotent — re-POSTing the same field list is a no-op.
 *
 * Note: this is an *app-level* subscription. Each individual WABA also has
 * to be subscribed to the app via POST {waba_id}/subscribed_apps — that
 * step is unchanged and only needs to be done once per WABA.
 */
const APP_ID = process.env.META_APP_ID
const APP_SECRET = process.env.META_APP_SECRET
if (!APP_ID || !APP_SECRET) {
  console.error('Missing META_APP_ID or META_APP_SECRET in env.')
  process.exit(1)
}

const APP_ACCESS_TOKEN = `${APP_ID}|${APP_SECRET}`
const url = `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions`

// Meta's POST /{app_id}/subscriptions REPLACES the field list, so we must
// include every field we want — re-listing `messages` keeps inbound flow
// working alongside the new template-status events.
const fields = ['messages', 'message_template_status_update'].join(',')

const body = new URLSearchParams({
  object: 'whatsapp_business_account',
  fields,
  include_values: 'true',
  access_token: APP_ACCESS_TOKEN,
})

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
})
const text = await res.text()
console.log(`[${res.status}]`, text)
if (!res.ok) process.exit(1)

// Verify by reading current subscriptions back.
const verify = await fetch(`${url}?access_token=${encodeURIComponent(APP_ACCESS_TOKEN)}`)
const verifyJson = await verify.json()
console.log('\nCurrent subscriptions:')
console.log(JSON.stringify(verifyJson, null, 2))

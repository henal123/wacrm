import type { ContentType } from '@/types'

// ------------------------------------------------------------
// Conversation-list preview text for a message.
//
// The inbox list shows each conversation's latest message as a short
// preview. Text messages preview as their body, but media / template /
// interactive messages have no body (or a null one), so a naive
// `content_text ?? ""` renders a blank row. This derives a sensible
// type-based fallback — mirroring the `contentText || '[<type>]'` shape
// the webhook already persists to `conversations.last_message_text` —
// so the client-side realtime patch and a fresh server fetch agree.
// ------------------------------------------------------------

const TYPE_FALLBACK: Record<ContentType, string> = {
  text: '',
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎙️ Audio',
  document: '📎 Document',
  location: '📍 Location',
  template: '[Template]',
  interactive: '[Interactive]',
}

/**
 * Short preview string for a message in the conversation list.
 * Prefers the message body; falls back to a type label so non-text
 * messages never render as an empty preview.
 */
export function previewTextForMessage(
  contentType: ContentType,
  contentText?: string | null,
  templateName?: string | null,
): string {
  const body = contentText?.trim()
  if (body) return body
  if (contentType === 'template' && templateName) {
    return `Template: ${templateName}`
  }
  return TYPE_FALLBACK[contentType] ?? ''
}

import type { Message } from "@/types";

// ------------------------------------------------------------
// Pure display helpers for the message bubble. Kept JSX-free in a
// separate module so the rendering decisions can be unit-tested in
// the node test environment (the .tsx bubble itself needs a DOM).
// ------------------------------------------------------------

/**
 * Body text to render inside a `template` bubble. Prefers the rendered
 * body; falls back to the template name so historical rows (sent before
 * automations stored a body) and body-less templates never render as a
 * bare "Template" chip. Returns null only when neither is available.
 */
export function templateBubbleBody(
  message: Pick<Message, "content_text" | "template_name">,
): string | null {
  const body = message.content_text?.trim();
  if (body) return body;
  if (message.template_name) return `Template: ${message.template_name}`;
  return null;
}

/**
 * Whether an `interactive` message is a customer's tap on a button/list
 * row (true) vs a bot-sent interactive prompt (false). Only customer
 * taps get the "Button reply" affordance; bot prompts render as a normal
 * outbound message.
 */
export function isCustomerInteractiveTap(
  message: Pick<Message, "sender_type">,
): boolean {
  return message.sender_type === "customer";
}

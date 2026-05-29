# Apex Fashion Lab — WhatsApp template submissions

Create these in **Meta WhatsApp Manager → Message Templates** (or via your BSP),
language **English (`en`)**. After they're **Approved**, run
`POST /api/whatsapp/templates/sync` in wacrm, set `LEAD_INGEST_SEND_TEMPLATE=true`,
then activate the **Nurture —** automations.

## Voice
Write like a person, not a brochure. One idea per message, lead with the
founder's problem (not "we're great"), be specific (₹, Myntra/Nykaa/Amazon,
real outcomes), and end with ONE clear thing to do. Apex = "Asia's first
fashion entrepreneurship lab" — proof beats claims, so the nurture leans on
**founder-story videos** from the channel: <https://www.youtube.com/@ApexFashionLab>.

> Swap the channel link for a **specific video URL** when you have one that fits
> (e.g. a founder journey / honest review). Each distinct link is its own
> template, so pin one evergreen video per template.

## Where variables are allowed
| Sent by | Variables? | Why |
|---|---|---|
| **Ingest route** (`apex_application_received`) | ✅ real values | code passes `name`, `program` |
| **Broadcast** (`/api/whatsapp/broadcast`) | ✅ real values | per-recipient params supported |
| **Nurture automations** (sequences) | ❌ **none** | the engine sends template params *literally* — `{{1}}` would arrive as the text "{{1}}". Keep these variable-free. |

---

## A. Ingest-route — Utility (variables)

**`apex_application_received`** · Utility · `{{1}}`=first name, `{{2}}`=program
> Hi {{1}}, thanks for applying to the {{2}} at Apex Fashion Lab 🙌 We read every application ourselves, so you'll hear from a real person within 48 hours. While you wait — reply and tell us the *one* thing you're most stuck on with your brand right now. It helps us make our conversation count.

---

## B. Nurture sequences — Marketing (NO variables)

Sent by `Nurture — Cohort / D2D / Top of funnel`. These carry the channel link;
the goal is a reply, not a hard sell.

**`apex_value_story`** · Marketing
> Most fashion brands in India stall at the same spot: a great idea, and a factory that won't touch a small first order. That gap kills more labels than bad designs ever do. We've helped founders cross it — from a tiny first batch to selling on Myntra & Nykaa. See how one of them did it 👇
> https://www.youtube.com/@ApexFashionLab

**`apex_case_study`** · Marketing
> Real story: a founder came to us with ₹0 in sales and a notes-app full of ideas. Six months on — an actual label, healthy margins, live across marketplaces. It wasn't luck; it was the right supply chain + a launch plan that made sense. Want us to map that path for *your* brand? Reply "map".

**`apex_social_proof`** · Marketing
> Don't take our word for it — hear it straight from a founder who built their brand with us 👇
> https://www.youtube.com/@ApexFashionLab
> If you're serious about launching, reply "apply" and we'll show you the next step.

**`apex_seats_filling`** · Marketing
> Quick heads-up: the current Fashionpreneur wave is filling up. Founders who get in get mentors, a builder network, hands-on execution, and eligibility for up to ₹10L in funding. Want us to hold a seat while you decide? Reply "yes".

**`apex_reengage`** · Marketing
> Still thinking about your fashion brand? No rush — but the gap between "someday" and "launched" is usually just having the right team around you. We've opened a new wave and we'd love to help you start. Reply "yes" and we'll pick up where you left off.

---

## C. Broadcast-only — Marketing (variables OK; you set params per send)

**`apex_next_wave`** · Marketing
> We're opening the next wave of founders at Apex Fashion Lab — Asia's first fashion entrepreneurship lab. If building your own label has been on your mind, this is the moment. Reply and we'll walk you through how it works.

**`apex_cohort_open`** · Marketing · button: **URL** "Apply now" → apply page
> Applications for the Fashionpreneur Cohort are open 🎉 12 weeks of real mentors, a founder network, hands-on execution, and up to ₹10L funding eligibility — to take your brand from idea to market. Seats are limited. Tap below to apply.

**`apex_webinar_invite`** · Marketing · `{{1}}`=topic, `{{2}}`=date, `{{3}}`=link
> Free masterclass: "{{1}}" on {{2}}. Join the Apex Fashion Lab team live — how to build and scale a fashion label in India, plus a Q&A. Save your spot here: {{3}}
> Reply if you have any questions, see you there!

*(Meta rejects a variable as the last character — keep static text after `{{3}}`.)*

---

## Submission tips
- **Category matters**: Utility = transactional (tied to an action the user took); Marketing = promotional. Mis-categorizing risks rejection.
- Keep it warm and human; avoid guarantees ("you'll make ₹X") and anything spammy — India + Marketing templates get extra scrutiny.
- The nurture sequences only send `apex_value_story`, `apex_case_study`, `apex_social_proof`, `apex_seats_filling` — get those approved first; the rest power broadcasts/re-engagement.
- After approval: `POST /api/whatsapp/templates/sync` → `LEAD_INGEST_SEND_TEMPLATE=true` → activate **Nurture — Cohort / D2D / Top of funnel** in wacrm.

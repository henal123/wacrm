# Apex Fashion Lab — WhatsApp template submissions

Create these in **Meta WhatsApp Manager → Message Templates** (or via your BSP),
language **English (`en`)**. After they're **Approved**, run
`POST /api/whatsapp/templates/sync` in wacrm to pull them in, then flip
`LEAD_INGEST_SEND_TEMPLATE=true` and activate the nurture sequences.

## Critical: where variables are allowed

| Sent by | Variables? | Why |
|---|---|---|
| **Route** (ingest / TidyCal webhook) | ✅ real values | the code passes actual params (`name`, `time`, …) |
| **Broadcast** (`/api/whatsapp/broadcast`) | ✅ real values | per-recipient params supported |
| **Nurture automation** (sequences) | ❌ **none** | the engine sends template params *literally* — `{{1}}` would arrive as the text "{{1}}". Keep these templates variable-free. |

So the nurture-sequence templates below have **no** `{{n}}` placeholders by design.

---

## A. Route-sent — Utility (have variables)

**`apex_application_received`** · Utility · vars `{{1}}`=name, `{{2}}`=program
> Hi {{1}} 👋 We've received your {{2}} application at Apex Fashion Lab. Our team reviews every application personally — you'll hear from us within 48 hours. Reply here if you have any questions.

**`apex_call_confirmed`** · Utility · `{{1}}`=name, `{{2}}`=date & time
> You're booked, {{1}}! 📅 Your call with Apex Fashion Lab is on {{2}}. We'll call you on this number — reply "reschedule" if the time no longer works.

**`apex_call_reminder_24h`** · Utility · `{{1}}`=name, `{{2}}`=time *(reminder wiring is a follow-up; submit now so it's approved)*
> Hi {{1}}, a reminder that your Apex Fashion Lab call is tomorrow at {{2}}. Looking forward to learning about your brand. Reply "reschedule" if anything changed.

**`apex_call_reminder_2h`** · Utility · `{{1}}`=name, `{{2}}`=time
> Hi {{1}}, your Apex Fashion Lab call is in about 2 hours ({{2}}). Talk soon!

**`apex_call_noshow`** · Utility · `{{1}}`=name
> Hi {{1}}, we missed you on the call today — no worries, life happens. Reply here and we'll find a new time that works.

---

## B. Nurture-sequence — Marketing (NO variables)

These are sent by the seeded sequences (`Nurture — Cohort / D2D / Top of funnel`).

**`apex_value_story`** · Marketing
> Quick story from Apex Fashion Lab: a founder we worked with went from a 50-piece test batch to selling on Myntra & Nykaa in 6 months. The unlock was the right supply chain + marketplace strategy — exactly what we build with our founders. Curious how it'd look for your brand? Reply and let's chat.

**`apex_case_study`** · Marketing
> Thought this would be useful: how we helped a D2C label go from zero to a profitable, scalable operation across marketplaces. Want the same playbook for your brand? Just reply "yes".

**`apex_social_proof`** · Marketing
> Apex Fashion Lab founders have launched brands now selling across Myntra, Nykaa, Amazon & Flipkart. Imagine your label on that list. Ready to start? Reply "apply" and we'll guide you.

**`apex_seats_filling`** · Marketing
> Heads up — seats in the current Fashionpreneur wave are filling up. Selected founders get curriculum, mentors, network + ₹10L funding eligibility. Want us to hold your spot? Reply "yes".

**`apex_reengage`** · Marketing
> It's been a while! Apex Fashion Lab has opened a new wave with more hands-on execution support for founders. Want to pick up where we left off? Reply "yes".

---

## C. Broadcast-only — Marketing (variables OK, you set params per send)

**`apex_next_wave`** · Marketing
> We're onboarding the next wave of fashion founders at Apex Fashion Lab. Still thinking about building your brand? Reply and we'll map your next step.

**`apex_cohort_open`** · Marketing · button: **URL** "Apply now" → your apply page
> Applications for the Fashionpreneur Cohort at Apex Fashion Lab are now open. Limited seats per wave — tap below to apply.

**`apex_webinar_invite`** · Marketing · `{{1}}`=topic, `{{2}}`=date, `{{3}}`=join link
> Free masterclass from Apex Fashion Lab: "{{1}}" on {{2}} — live with our team + Q&A. Save your spot: {{3}}

---

## Submission tips
- **Category matters**: Utility = transactional (tied to an action the user took); Marketing = promotional. Mis-categorizing risks rejection.
- Keep emojis light and avoid anything that reads as spammy/financial-guarantee — India + Marketing templates get extra scrutiny.
- After approval: `POST /api/whatsapp/templates/sync`, set `LEAD_INGEST_SEND_TEMPLATE=true`, then in wacrm activate **Nurture — Cohort / D2D / Top of funnel** (seeded inactive).

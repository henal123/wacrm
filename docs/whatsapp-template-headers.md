# WhatsApp Template Headers — image prompt brief

Goal: one **landscape header image per `apex_*` template**, in a single cohesive visual
system, so the templates read like a premium fashion-consulting firm — not a marketing blast.

You run these prompts in your image tool (Midjourney / Flux / nano-banana / DALL·E / Ideogram),
tweak, and send back the finals (or just the file names). Then I host them, attach them to each
template's header, and submit the set to Meta for re-approval.

---

## Output spec (every image)

- **Aspect ratio:** 1.91:1 landscape. Target **1456 × 762 px** (1080 × 566 also fine).
- **Format / size:** JPG or PNG, **under 5 MB** (WhatsApp image-header limit).
- **No baked-in text, no logos, no watermarks** — the template supplies all words. Keep one clean
  focal area and lots of calm negative space (the message text sits beside it on the phone).
- **Safe edges:** keep the subject off the far edges; WhatsApp crops slightly on some devices.

---

## GLOBAL STYLE BLOCK  → prepend this to every scene prompt

```
Editorial fashion photograph, premium quiet-luxury / "old money" mood, Indian fashion atelier
sensibility. Natural soft window light, shallow depth of field, fine film grain, magazine-quality.
Warm desaturated palette: cream, oatmeal, camel, espresso brown, with a single restrained
brushed-gold accent (#D4B16A). Calm, unhurried, confident, lots of negative space, off-centre
composition. 1.91:1 landscape. No text, no logo, no watermark.
```

## NEGATIVE / AVOID  → append to every prompt (or use as negative prompt)

```
no text, no words, no letters, no logo, no watermark, no UI, no stock-photo cheesiness,
no garish or neon colours, no harsh flash, no clutter, no plastic skin, no deformed hands,
no extra fingers, not lowres, no jpeg artifacts, no busy background.
```

**Midjourney params:** `--ar 191:100 --style raw --v 6.1`  ·  for character/style consistency across
the set use `--sref <one approved image url>` so all 15 share a look.
**Flux / nano-banana (image-to-image):** feed the listed **source** photo as the reference image at
~0.35–0.5 strength so the output keeps your real setting but gains the editorial finish.

---

## The 15 prompts

Each = **GLOBAL STYLE** + the scene below + **NEGATIVE**. "Source" = a file already in
`apex-fashion-lab/public/` you can use as an image-to-image reference (or as the header directly).

### Nurture & proof

**1. `apex_value_story` — "The gap that kills most labels"**
> Scene: a single unfinished garment on a wooden hanger in a quiet, near-empty atelier; an empty
> cutting table and a stilled sewing machine in soft background blur; one shaft of morning light.
> A sense of a good idea waiting for production. Negative space camera-left.
> Source: none (pure generate) — or any clean studio/rail shot from your library.

**2. `apex_case_study` — "From notes app to a real label"**
> Scene: a tidy boutique rail of finished premium menswear (muted earth tones, old-money tailoring),
> shot in warm retail light; one garment pulled slightly forward. Aspirational, calm, resolved.
> Source: any product/rail shot if you have one; else generate.

**3. `apex_social_proof` — "Don't take our word for it"**
> Scene: a warm, candid three-quarter portrait of a young Indian fashion founder in their studio,
> relaxed and confident, looking just off-camera; fabric rolls softly blurred behind. Documentary,
> not posed. **Best as a VIDEO header** if you have a testimonial clip.
> Source: `rishabh.jpg`, `saket.jpg`, `120A2005.JPG` (founder in brown blazer) — image-to-image.

**4. `apex_seats_filling` — "The current wave is filling"**
> Scene: a row of identical design-studio workstations / chairs under warm light, **one seat empty**
> and slightly turned out, the rest occupied-feeling. Quiet scarcity, no faces needed.
> Source: none.

**5. `apex_reengage` — "Still on your mind?"**
> Scene: an open fashion sketchbook with half-finished croquis and a pencil left across it, on a
> wooden desk by a window; a cold cup of chai beside it. Unfinished work, patiently waiting.
> Source: none.

**6. `apex_next_wave` — "The next wave is opening"**
> Scene: a bright modern fashion-lab / workshop, a few founders mid-collaboration around a large
> table strewn with fabric swatches and mood boards; energy but composed. Editorial wide.
> Source: `120A2005.JPG` / `120A2105.JPG` (event energy) — image-to-image, or generate.

### Design-to-Delivery (done-for-you)

**7. `apex_value_story_d2d` — "Bring the vision. We build the brand."**
> Scene: a maker's hands working fine fabric over a tailor's table — measuring tape, chalk, shears,
> a half-constructed jacket. Craftsmanship and care, close and tactile. Warm light.
> Source: none.

**8. `apex_case_study_d2d` — "They stayed the face. We ran the build."**
> Scene: the engine room — orderly rolls of premium fabric, an industrial sewing line softly blurred,
> a QA table with a folded garment under inspection light. Behind-the-scenes production, dignified.
> Source: `Blackout-Studio-5564-768x576.webp` (studio) — reference, or generate.

**9. `apex_social_proof_d2d` — "You stay the brand. We run the engine."**
> Scene: a premium flat-lay on warm marble/wood — a smartphone showing a clean, generic fashion
> e-commerce product page (no real brand marks), beside a folded garment and a fabric swatch.
> Implies "live on the marketplaces" without naming them.
> Source: none — **keep the on-screen UI generic / textless** to pass Meta review.

### Conversion & lifecycle

**10. `apex_book_call` — "Let's map your next step"**
> Scene: a calm corner of a design studio — two chairs angled toward each other by a window, a
> notebook and two coffees on a low table, morning light. A conversation about to happen.
> Source: none.

**11. `apex_cohort_open` — "Fashionpreneur Cohort — now open"**
> Scene: a workshop table of engaged founders (hands, swatches, laptops, notebooks) in a bright lab,
> warm and aspirational, shallow focus. The cohort in motion.
> Source: `120A2105.JPG` (landscape event) — image-to-image is ideal here.

**12. `apex_application_received` — "We've got your application"**
> Scene: a single open notebook and a fountain pen on a warm wooden desk, a folded note and a sprig
> of greenery; soft daylight. Personal, considered, "a real person will read this."
> Source: none.

**13. `apex_welcome_cohort` — "Welcome to Apex Fashion Lab"**
> Scene: an inviting threshold into a bright, fresh atelier — an open studio door, light spilling in,
> a clean cutting table and rails ready. Beginnings, possibility. No people.
> Source: none.

**14. `apex_post_call` — "Good speaking with you"**
> Scene: two coffee cups and a closed notebook on a sunlit café/studio table after a meeting; warm,
> human, resolved. Quiet aftermath of a good conversation.
> Source: none.

**15. `apex_webinar_invite` — "You're invited"**
> Scene: a softly-lit laptop on a clean desk showing an out-of-focus live-session setup (no readable
> UI), a notebook and chai beside it; an evening masterclass mood. Calm and premium.
> Source: `120A2005.JPG` / `120A2105.JPG` (speaker/stage) if you'd rather use the real event.

---

## Source-image index (what's already in `apex-fashion-lab/public/`, live at apexfashionlab.com/<file>)

| File | What it is | Best used for |
|------|------------|---------------|
| `120A2005.JPG` | Founder (brown blazer) presenting, Roots & Ink backdrop, **landscape** | next_wave, cohort_open, webinar_invite, social_proof (ref) |
| `120A2105.JPG` | Speaker on stage, branded backdrop, **landscape** | cohort_open, webinar_invite, next_wave |
| `120A2063.JPG`, `120A2110.JPG` | More event shots (verify) | event/cohort templates |
| `Group-180.png`, `Group-182.png` | Speaker portraits at podium (portrait) | social_proof, post_call (ref) |
| `rishabh.jpg`, `saket.jpg`, `kaif.jpg` | Mentor/founder headshots | social_proof, case_study (ref) |
| `Blackout-Studio-5564-768x576.webp` | Studio (low-res, 768px) | d2d build (ref only — too small to use direct) |
| `*.mp4` (22 files) | Video clips — **check for testimonials** | social_proof / social_proof_d2d as **VIDEO headers** |
| `APEX FASHION LAB.png` | ⚠️ actually a Razorpay payment QR | do not use |

> Tip: the cleanest, most premium result is to **pick ONE generated image you love, then use it as the
> `--sref` / reference for the other 14** so the whole set shares one light, grain, and palette.

---

## After you generate

1. Drop the finals somewhere public (the website `public/` folder, or send them to me and I'll put
   them in Supabase storage). WhatsApp fetches header media by URL.
2. I'll **extend the wacrm send code** to attach a header image per template (it currently sends body
   params only), map each `template_name → header URL`, upload the samples to Meta, and **submit all
   15 edits** (names unchanged, so your automations keep working).
3. We review the rendered templates on a test send to +91 77386 66495 before going wide.

Header type per template: **IMAGE** for all, except `apex_social_proof` /
`apex_social_proof_d2d` which are stronger as **VIDEO** if you have a good testimonial clip.

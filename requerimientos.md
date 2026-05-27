# Retail Visual Audit Pilot

## Objective

Build a production-ready pilot for a controlled AI-powered retail visual audit workflow.

This is NOT a free autonomous agent.

This is a controlled workflow system where:

* Playwright handles navigation,
* OpenAI Multimodal handles visual reasoning,
* Supabase stores all evidence and logs,
* and a Supervisor validates the AI decisions.

The system must process retail survey audits end-to-end using screenshots, retail shelf images, question interpretation, visual product matching, and controlled answer selection.

---

# Core Workflow

## High-Level Flow

```text
Google Sheets
↓
Worker takes next store code
↓
Playwright opens survey website
↓
Insert store code + validator code
↓
Survey opens
↓
Extract image links
↓
Download/store images
↓
Pre-analyze images
↓
Question loop begins
↓
AI answers each question
↓
Supervisor validates
↓
Playwright selects answer
↓
Playwright continues
↓
Select images used
↓
Finish survey
↓
Capture final confirmation code
↓
Write code back to Google Sheets
↓
Continue next store
```

---

# Stack

## Frontend / Dashboard

* Next.js
* TailwindCSS

## Automation

* Playwright

## AI

* OpenAI Multimodal API
* Use multimodal models capable of:

  * image analysis
  * OCR contextual reasoning
  * spatial reasoning
  * product verification
  * visual validation

## Database / Storage

* Supabase PostgreSQL
* Supabase Storage

## Queue / Workers

Use one:

* BullMQ
* Trigger.dev
* Inngest

## Integrations

* Google Sheets API

---

# Core Principles

## IMPORTANT

This system must NOT:

* invent rules,
* assume products,
* hallucinate products,
* reuse previous question logic,
* or infer conditions not explicitly visible.

The system must:

* analyze visually,
* interpret the current question only,
* verify evidence,
* explain reasoning,
* and map to visible options.

---

# Critical Decision Rules

## Rule 1 — No evidence ≠ Negative evidence

If the target product cannot be confirmed:

* NEVER answer NO
* answer:
  "No puedo responder"

---

## Rule 2 — Every question is isolated

Each question must be analyzed independently.

Never reuse:

* rules,
* conditions,
* assumptions,
* or logic from previous questions.

---

## Rule 3 — Use visible options only

The final answer MUST always map to a visible survey option.

Never invent responses outside the visible UI options.

---

## Rule 4 — Visual Example Driven Reasoning

The system must prioritize:

1. visual examples,
2. product matching,
3. location analysis,
4. section reasoning,
5. spatial context,
6. visible evidence.

NOT abstract symbolic reasoning.

---

# Architecture

# 1. Worker System

The system processes stores sequentially.

## Workflow

1. Read pending rows from Google Sheets.
2. Get next store code.
3. Launch Playwright session.
4. Open survey website.
5. Insert:

   * store code from Google Sheets
   * fixed validator code from dashboard input
6. Click Next.
7. Extract image links.
8. Download images.
9. Save images to Supabase Storage.
10. Create survey_run record.
11. Pre-analyze images.
12. Start question loop.
13. Finish survey.
14. Capture final confirmation code.
15. Save confirmation code.
16. Update Google Sheets row.
17. Continue next store.

---

# 2. Dashboard Requirements

Build dashboard with:

## Controls

* Start
* Pause
* Resume
* Stop

## Views

* Pending stores
* In progress
* Completed
* Failed
* Human review
* Supervisor rejected

## Question Review

Display:

* screenshot of question
* selected answer
* explanation
* visual evidence
* image used
* crops used
* supervisor validation
* confidence

## Agent Transparency

The dashboard must show:

* what image was used,
* what crop was used,
* why the answer was selected,
* and the reasoning in simple language.

Do NOT over-explain.

Keep explanations concise and understandable.

---

# 3. Image Intelligence Layer

## IMPORTANT

Do NOT analyze full panorama images directly for every question.

When images are downloaded:

Generate:

* crops,
* zoom regions,
* metadata,
* section estimates,
* OCR regions,
* product candidate zones,
* quality analysis,
* readable text regions.

Store all of this in Supabase.

Questions should reuse this intelligence layer.

---

# 4. Question Registry

Create a reusable Question Registry system.

## Goal

Questions are repetitive and similar.

The system should classify questions into known patterns.

## Example Question Types

* product presence
* product location
* shelf order
* facing count
* price validation
* shelf share
* inventory presence
* vertical arrangement
* horizontal arrangement

## Registry Structure

Each question type should define:

* matching patterns
* expected products
* answer strategy
* visual strategy
* required evidence
* confidence thresholds

---

# 5. Question Analysis Pipeline

Each question must follow this exact pipeline:

## Step 1 — Capture Question

Capture screenshot of current question page.

Extract:

* question text
* instructions
* examples
* highlighted regions
* answer options

---

## Step 2 — Identify Target

Identify:

* target product
* target category
* visual example
* expected behavior
* shelf logic

---

## Step 3 — Image Search

Search for the target product using:

* crops
* zooms
* OCR
* visual similarity
* section analysis

---

## Step 4 — Product Verification

IMPORTANT:
Visual similarity alone is NOT enough.

A product is confirmed only if:

* the label is readable,
* OR the visual match is extremely strong.

If product cannot be confirmed:

* answer:
  "No puedo responder"

---

## Step 5 — Spatial Reasoning

Analyze:

* relative position
* shelf section
* nearby products
* vertical order
* horizontal order
* grouping
* adjacency

---

## Step 6 — Answer Mapping

Map logical conclusion to:

* visible survey options only.

---

## Step 7 — Supervisor Validation

Before selecting the answer:

Supervisor validates:

* product confirmation
* evidence quality
* hallucination risk
* option validity
* reasoning consistency

Supervisor can:

* approve
* reject
* force "No puedo responder"
* request retry with new crops

---

## Step 8 — Playwright Action

If approved:

* select visible option
* click next

---

# 6. Retry Strategy

If:

* low confidence,
* product not confirmed,
* blurry image,
* OCR ambiguous,
* supervisor rejects,

Then:

1. generate new crops,
2. zoom different regions,
3. retry analysis,
4. or send to human review.

---

# 7. Human Review Queue

Build a human review system.

Humans can:

* approve,
* correct,
* retry,
* override.

Store:

* original answer
* corrected answer
* reasoning
* correction reason

---

# 8. Image Traceability

Every answer must store:

* source image
* crop used
* coordinates
* detected section
* OCR evidence
* reasoning
* supervisor decision

This is mandatory.

---

# 9. Supabase Schema

## Tables

### stores

* id
* store_code
* status
* created_at

### survey_runs

* id
* store_id
* started_at
* completed_at
* final_code
* status

### images

* id
* survey_run_id
* image_url
* storage_path
* metadata
* crops
* quality_score

### questions

* id
* survey_run_id
* question_index
* screenshot_path
* detected_question
* options
* question_type

### answers

* id
* question_id
* selected_option
* confidence
* explanation
* evidence
* image_used
* crop_used
* raw_json

### supervisor_reviews

* id
* answer_id
* decision
* reasoning
* confidence

### browser_events

* id
* survey_run_id
* event_type
* screenshot
* metadata

### errors

* id
* survey_run_id
* error_type
* message
* stack
* screenshot

---

# 10. Google Sheets Integration

The system must:

1. Read store codes from Google Sheets.
2. Process sequentially.
3. Write final confirmation code back into the same row.
4. Mark status:

   * completed
   * failed
   * human_review

---

# 11. Playwright Requirements

The Playwright layer must:

* survive page reloads,
* recover after pauses,
* resume after crashes,
* restore session state,
* detect current survey step.

When resuming:
the system must detect:

* current question
* current store
* current progress

without restarting the survey.

---

# 12. AI Models

Use:

* lower-cost multimodal model for simple extraction
* stronger multimodal model for difficult visual reasoning

Prefer:

* lightweight models for OCR/simple classification
* stronger models for:

  * product verification
  * shelf reasoning
  * ambiguous images
  * visual validation

The system should support model routing.

---

# 13. Critical Global Rules

## NEVER:

* hallucinate products
* assume products exist
* assume text is readable
* infer missing labels
* answer NO without confirmed evidence
* reuse previous question rules

## ALWAYS:

* validate visually
* use crops
* explain reasoning
* map only to visible options
* preserve evidence
* allow human review

---

# 14. Deliverables

Build:

* full Next.js dashboard
* Playwright automation
* Supabase integration
* Google Sheets integration
* image intelligence layer
* question registry
* supervisor system
* retry logic
* human review queue
* full logging
* resumable worker architecture

---

# 15. Goal

The goal is NOT to create a chatbot.

The goal is to create a:

# Retail Visual Audit Platform

Focused on:

* reliability,
* traceability,
* visual evidence,
* controlled automation,
* and auditability.

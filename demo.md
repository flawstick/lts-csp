# LTS Tax Demo Script

## Opening (30 seconds)

"LTS Tax is an AI-powered tax compliance automation platform. We handle the entire substance reporting workflow — from document ingestion to portal submission — with zero manual data entry."

"Everything runs on UK-based infrastructure in London for data sovereignty and GDPR compliance."

---

## 1. Dashboard Overview (30 seconds)

**Show:** Main dashboard at `/`

- "Here's our central command — real-time visibility into all active returns"
- "Completion rates, processing times, jurisdiction breakdown"
- "I've kept it open ended for you to add jurisdictions in the future"
- "Everything synced from your government portals automatically"

---

**Show:** ECS Processing and scraping

- all of the returns
- "This is carried out every thirty minutes"
- "show aws side"
- "Show logs"

---

## 2. Tax Return & Document Processing (1 minute)

**Show:** A tax return detail page `/returns/[id]`

- "Let's look at a specific entity"
- "We've uploaded their board minutes, financial statements, FTE calculations"
- "Our extraction pipeline uses multimodal AI to parse PDFs and Excel files"
- "It populates the entire Economic Substance form automatically — directors, UBOs, CIGA activities, everything"

**Click through the form sections**

- "Each section maps directly to the government portal fields"
- "Missing data is flagged — the system knows exactly what's incomplete"

---

## 3. The Magic: Browser Automation (2 minutes)

**Show:** Task page `/tasks/[id]`

- "Here's where it gets interesting"
- "Click Start — we spin up a secure browser session in our London data centre"
- "The AI agent navigates the actual government portal, fills every field, handles dropdowns, radio buttons, multi-step forms"

**While the browser runs:**

- "You're watching this live — same view we have"
- "Each step is logged with screenshots for audit trails"
- "If it hits a login wall or needs human verification, it pauses — you take over, then resume"

**Show the steps timeline:**

- "Full transparency — every action the agent takes is recorded"

---

## 4. Compliance & Control (30 seconds)

- "Override mode lets you force a complete re-submission"
- "Pause anytime to manually intervene"
- "All credentials are encrypted, sessions are isolated, nothing persists after completion"

---

## Closing (30 seconds)

"What used to take 45 minutes of copy-paste per entity now takes under 2 minutes of oversight."

"We're processing Guernsey Economic Substance returns today. Jersey, Isle of Man, and Luxembourg are next."

"Questions?"

---

## Key Talking Points (if asked)

| Topic           | Answer                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Security**    | UK-hosted infrastructure, encrypted at rest and in transit, isolated browser sessions, no credential storage |
| **Accuracy**    | Human-in-the-loop — agent pauses on uncertainty, full audit trail with screenshots                           |
| **Scale**       | Parallel processing — run multiple entities simultaneously                                                   |
| **Integration** | API-first, works with existing document management systems                                                   |
| **Compliance**  | GDPR-compliant, London data residency, full audit logs                                                       |

---

## Demo Checklist

- [ ] Have a test entity ready with uploaded documents
- [ ] Substance form should be mostly complete
- [ ] Portal credentials working (dev@flawstick.com)
- [ ] Good internet connection for live browser view

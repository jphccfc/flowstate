Date drafted: September 8, 2026
Context: Needed ahead of Thursday, September 10, in-person, multi-domain stakeholder meeting day.

---

1. Purpose

During intensive in-person assessment days, Jon moves rapidly between meetings across multiple functional domains and stakeholders. The existing Flow State platform supports structured live-session data capture, but has no fast, low-friction tool for capturing raw notes in the moment, whether structured or unstructured, between and during meetings.

The Meeting Day Scratch Pad is a new page inside the Flow State platform that solves this. It is not a standalone tool. It lives inside the platform and feeds the same underlying data model, so notes captured in the moment become structured inputs for capability, KPI and stakeholder records later.

---

2. Core Requirements

2.1 Speed and access

- Must open fast, in browser, on both mobile and web.
- No login friction beyond standard platform authentication.
- Session should persist through the day.

2.2 Reliability and autosave

- Data must never be lost. This is a hard requirement.
- Autosave fires on every input event, not on a timer.
- Every keystroke and every voice transcription chunk is persisted immediately.
- If connectivity drops, entries queue locally and sync when connectivity returns.

2.3 Capture format

- Entry field is open and freeform.
- No forced structure or required fields.
- Supports plain typed text and voice-to-text transcription.
- Typed text and transcription both land in the same freeform field.
- Basic rich text formatting is required:
  - Bold.
  - Underline.
- Underlying storage format is Markdown or Markdown-compatible text.

2.4 Tagging: person and domain

Every entry can be tagged with:

- A stakeholder name.
- A functional domain.

The five functional domains are:

- Operations.
- Financial and Legal.
- People.
- Technology and Data.
- Customers and Revenue.

Two tagging paths are supported:

Manual inline tagging

Manual tagging uses slash or hashtag syntax while typing.

Examples:

/John Horseman/ /Finance/


or:

#John Horseman #bookkeeping


The system recognises both syntaxes interchangeably.

Automatic AI tagging

If no manual tag is present:

- AI parses the freeform text.
- AI assigns a best-guess stakeholder and domain tag.
- The approach should be consistent with the existing auto-tagging and confidence-scoring approach used elsewhere in Flowstate.

The application remembers the last stakeholder and domain used and preselects them as defaults for the next entry.

This supports quickly recording several entries for the same conversation before moving to the next meeting.

2.5 Integration with the core data model

This is explicitly not a disposable scratch tool.

Entries are first-class data that route into the same pipeline as other captured content:

Domain
→ Capability
→ KPI
→ Stakeholder
→ Location
→ Confidence scores
→ Human review for low-confidence tags


Raw notes remain:

- Viewable.
- Editable.
- Available as their own record.

This remains true even after AI parsing maps portions of the note into structured fields elsewhere.

---

3. Out of Scope for This Pass

- Video capture.
- Enforced structure or required fields within an entry.
- Real-time follow-up question suggestions.

Real-time follow-up suggestions belong to the separate facilitated interview flow, not the scratchpad.

- Everything else — the parsing and mapping to capabilities and KPIs happens after the meeting and will be coordinated and managed by the agents.

---

4. Why This Matters for Thursday

Jon will be moving in and out of meetings across multiple functional domains and stakeholders throughout the day, gathering input in a mixture of structured and unstructured formats.

The scratchpad needs to let him:

- Open it in seconds.
- Speak or type without thinking about structure.
- Tag quickly with a name and domain.
- Trust that everything is saved.

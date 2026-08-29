# AI Prompt Log — Summary

**Attachment to the ISEF AI Usage Disclosure form, item 1b.**

The form permits a summary where the full log is unavailable. The full transcript of this
work does exist and can be exported from Claude Code if the fair requires it. This summary
is provided because the session ran to many hours and hundreds of exchanges.

No prompt contained personal identifying information about interview participants or
patients. The fieldwork audio recordings were never sent to the AI.

## Shape of the session

One person directed the work in conversation. The AI assistant then ran several AI agents
in parallel, each given a written brief and a separate part of the codebase, reporting back
for review. The maintainer approved, redirected and rejected work throughout.

## What was asked, in sequence

**Understand the project.** Read the research paper, the 68-section specification, the
fieldwork interviews and the competition documents. Establish what already existed and what
the machine-learning model actually does.

*Response:* The model was found to classify four conditions at about 71% accuracy, and to
report silence as "Healthy" with high confidence. No application existed; the paper's
earlier web demonstration was not in the repository.

**Plan the application.** Decisions taken by the maintainer, not the AI: build fresh;
follow the full specification but remove Bluetooth in favour of importing files from the
device's memory card, and replace camera-guided stethoscope placement with instructional
diagrams; present results as early warnings rather than diagnoses; build an installable
offline app; keep all data on the phone.

**Build it.** Written in phases — data layer, audio and inference, design system,
authentication, patient registration, the assessment flow, the patient's own screens, the
practitioner review workflow, rehabilitation, monitoring and alerts, the researcher module,
the administrator console. Each phase was reviewed by a separate AI reviewer before being
accepted.

**Research the clinical content.** AI searched published guidance for asthma rehabilitation.
This found that the project's own specification listed a contraindicated exercise, which was
then excluded.

**Package it.** Built as an installable Android application and signed.

**Test the experience.** After the maintainer installed the app and found real defects, the
method changed: agents were instructed to read every word each screen displays, in order,
and ask whether any of it was false. This found a series of defects where the software
stated something untrue to the user.

## The instructions that shaped the software

Recurring directions from the maintainer, which explain why the app behaves as it does:

- Never present invented data as real. No fabricated numbers, no simulated capabilities.
  Anything unbuilt says so plainly.
- Never state a diagnosis. Findings are phrased as possible patterns with advice to consult
  a physician, and a clean result always carries "this does not rule out illness".
- Clinical text must not be machine-translated; it requires a qualified translator and
  practitioner review.
- Report honestly what is not done, and why.

## What the AI refused or escalated rather than decide

- Whether to block recording without recorded consent — returned to the team as an ethics
  decision.
- What breathing exercises to prescribe — an AI agent declined to invent them and required
  cited sources; the resulting content is still marked as awaiting clinical review.
- Filipino clinical wording — left in English rather than machine-translated.
- Whether a fictional plan should fill an empty rehabilitation screen — refused on the
  grounds that filling an empty screen with invented content is exactly what that module
  exists to prevent.

## Corrections the AI made to its own errors

Recorded because the fair may reasonably want to know how reliable the process was:

- Twice, an AI diagnosis of a bug's cause was wrong, based on text searching that missed
  context on adjacent lines. Both were corrected by other agents that measured rather than
  reasoned.
- A defect shipped in which the application greeted a real user by a fictional patient's
  name. It had two independent causes, and the tests that should have caught it could not,
  because a test fixture had been given the same name as the fictional patient.
- An AI-written first-run screen claimed no one could sign in without administrator
  approval, which was untrue for one role.

These were found and fixed during the session, and are recorded in `STATUS.md`.

# Validation instruments

The evaluation phase of the Ausculta study: how the prototype gets put in front of real
people and scored. Added 2026-08-29.

- `instrument-validation-form.pdf` — the DepEd / Puerto Princesa City National Science
  High School Instrument Validation Form. Five general criteria on a 1–5 scale plus four
  validator sections.
- `validation-survey-approach.pdf` — the protocol for running each validator type.

## What these documents establish

**The app's stated identity**, quoted from the validation form:

> Ausculta: An intelligent respiratory auscultation, monitoring, and rehabilitation-support
> system.
>
> Ausculta is a mobile health application designed to assist individuals with asthma in
> monitoring and understanding their respiratory health. […] It is not intended to replace
> professional medical consultation or serve as a standalone diagnostic tool.

Two things follow that the earlier research documents did not emphasise: the primary
subject is **a patient with asthma**, and **rehabilitation support is a title-level
feature**, not an optional module.

**Four validator types, each with its own scored criteria** — these are the acceptance
rubric for the build:

| Validator | Scored on |
|---|---|
| Patients with asthma | Ease of navigation, ease of use, clarity of information, interface design, perceived usefulness, user acceptability |
| Pulmonologist / health practitioner | Clinical relevance, clinical appropriateness, information clarity, patient safety, clinical usefulness |
| Computer engineer | Usability, user interface design, functionality, system organization, technical feasibility |
| Electrical engineer | Hardware feasibility, sensor integration, signal acquisition, electrical safety, system reliability |

General criteria (1–5): general relevance, functionality, performance and usability,
accessibility, reliability.

## What this demands of the software

The survey approach has validators **navigate the prototype unaided** and perform tasks
such as *"Find where you can view your respiratory assessment results."* Nobody walks them
through the buttons. Consequences for the build:

1. **Every path a validator might take must lead somewhere real.** A dead end or a blank
   screen is scored as a navigation failure, not as an unbuilt feature.
2. **Demo data is required, not optional.** Validators are asthma patients who will not
   have recordings from the device. Without seeded fictional data there is nothing for
   them to find, and the tasks cannot be completed.
3. **The patient-facing experience must be finished**, not a placeholder — patients are
   the largest validator group and score interface design directly.
4. **Rehabilitation support must exist** as a real, reachable feature.
5. Prototype status must be stated plainly in the app; the protocol requires telling
   participants it is not for diagnosis or treatment, and the interface must not contradict
   that.

## Open question for the research team

The paper and the fieldwork (four rural clinics around Puerto Princesa) describe a tool
operated by **barangay health workers** for community screening. These validation
documents describe a **patient-facing asthma self-monitoring app**. The master
specification supports both, since it defines Patient, Health Worker and Practitioner
roles — but the two framings imply different primary users, and the validation instrument
is what the study will be graded against. Worth settling explicitly before the validation
runs.

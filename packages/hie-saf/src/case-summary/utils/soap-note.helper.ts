import { Injectable } from '@nestjs/common';
import {
  CaseSummaryDiagnosis,
  CaseSummaryEncounterNote,
  CaseSummaryLabInterpretation,
  CaseSummaryMedication,
  CaseSummarySoapNote,
  CaseSummaryTestOrder,
  CaseSummaryVitals,
} from '../types';

/**
 * Builds a SOAP note from everything else already computed for the summary.
 * Deterministic and template-based — there is no model call here, and there
 * shouldn't be: this note can end up on a SHA claim attachment, so what it
 * says must be exactly traceable to a field already in the response. See
 * `docs/case-summary-endpoint.md` for the rest of the endpoint; this helper
 * has no reference implementation to port from, since the frontend never had
 * this feature.
 *
 * Only clinical notes from `SOAP_NOTE_ENCOUNTER_TYPES` feed the note — an
 * allowlist, not a blocklist. In particular an `ORDER`-type encounter is
 * excluded: on this server an order's own encounter can carry the ordered
 * concept's obs directly (the same "obs on the order encounter" case noted
 * in docs/case-summary-endpoint.md §9 Q7), and that value is already
 * reported properly through `labOrders` — repeating it here as prose would
 * just duplicate, often several times over, once per re-order of the same
 * test. The allowlist is deliberately narrow for now; widen it as other
 * encounter types prove worth including.
 */
@Injectable()
export class SoapNoteHelper {
  build(input: {
    clinicalNotes: Array<CaseSummaryEncounterNote>;
    vitals: CaseSummaryVitals;
    conditions: Array<CaseSummaryDiagnosis>;
    medications: Array<CaseSummaryMedication>;
    labOrders: Array<CaseSummaryTestOrder>;
  }): CaseSummarySoapNote {
    return buildSoapNote(input);
  }
}

/** Encounter types whose notes feed the SOAP note — an allowlist, deliberately narrow for now (see the class docblock). */
export const SOAP_NOTE_ENCOUNTER_TYPES = [
  'DOCTORNOTES',
  'OPDTRIAGE',
  'GENCONSULTATION',
];

/** A field label recognisable as part of the patient's own account of the visit. */
const SUBJECTIVE_LABEL_TESTS: Array<(label: string) => boolean> = [
  (l) => /^chief complaint/i.test(l),
  (l) => /^reason for (visit|refusal)/i.test(l),
  (l) => /^history of present illness/i.test(l),
  (l) => /^social history/i.test(l),
  (l) => /^past medical history/i.test(l),
  (l) => /^onset$/i.test(l),
  (l) => /patient reported/i.test(l),
  (l) => /^review of systems/i.test(l),
  (l) => /^family planning status/i.test(l),
];

/** A field label recognisable as a clinician-observed finding. */
const OBJECTIVE_LABEL_TESTS: Array<(label: string) => boolean> = [
  (l) => /^physical exam/i.test(l),
  (l) => /^general exam findings/i.test(l),
  (l) => /^triage level/i.test(l),
  (l) => /^nutrition status/i.test(l),
  (l) => /^mode of .*collection/i.test(l),
  (l) => /^(systolic|diastolic)( blood pressure)?$/i.test(l),
  (l) => /^air supply mode/i.test(l),
];

/** A field label recognisable as part of the diagnosis, folded into Assessment alongside `conditions`. */
const ASSESSMENT_LABEL_TESTS: Array<(label: string) => boolean> = [
  (l) => /^diagnosis/i.test(l),
];

/** A field label recognisable as treatment/follow-up, folded into Plan alongside medications and pending orders. */
const PLAN_LABEL_TESTS: Array<(label: string) => boolean> = [
  (l) => /^therapeutic plan/i.test(l),
  (l) => /^medication duration/i.test(l),
  (l) => /^referral for/i.test(l),
  (l) => /^clinical comments/i.test(l),
];

type SoapBucket =
  'subjective' | 'objective' | 'assessment' | 'plan' | 'unclassified';

function categorizeLabel(label: string): SoapBucket {
  if (SUBJECTIVE_LABEL_TESTS.some((test) => test(label))) return 'subjective';
  if (OBJECTIVE_LABEL_TESTS.some((test) => test(label))) return 'objective';
  if (ASSESSMENT_LABEL_TESTS.some((test) => test(label))) return 'assessment';
  if (PLAN_LABEL_TESTS.some((test) => test(label))) return 'plan';
  return 'unclassified';
}

/** Title-cases a label for prose (`"CHIEF COMPLAINT"` -> `"Chief Complaint"`). Values are left as recorded — they may be codes or proper nouns, not free text. */
function toTitleCase(label: string): string {
  return label
    .toLowerCase()
    .replace(
      /(^|[\s([-])([a-z])/g,
      (_match, boundary, letter) => `${boundary}${letter.toUpperCase()}`,
    );
}

/**
 * Every field becomes its own terminated sentence — not a `'. '`-joined run —
 * so this can be concatenated with other pre-formed sentences (vitals, labs)
 * without a missing separator where the last field's own value happens not
 * to end in punctuation.
 */
function formatFields(fields: Array<{ label: string; value: string }>): string {
  return fields
    .map((field) => {
      const value = field.value.trim();
      const sentence = `${toTitleCase(field.label)}: ${value}`;
      return /[.!?]$/.test(value) ? sentence : `${sentence}.`;
    })
    .join(' ');
}

function summarizeVitals(vitals: CaseSummaryVitals): string | undefined {
  const parts: Array<string> = [];
  if (vitals.temperature) parts.push(`Temp ${vitals.temperature}°C`);
  if (vitals.pulse) parts.push(`Pulse ${vitals.pulse} bpm`);
  if (vitals.respiratoryRate) parts.push(`RR ${vitals.respiratoryRate}/min`);
  if (vitals.spo2) parts.push(`SpO₂ ${vitals.spo2}%`);
  if (vitals.bloodPressure) parts.push(`BP ${vitals.bloodPressure}`);
  if (vitals.height) parts.push(`Height ${vitals.height} cm`);
  if (vitals.weight) parts.push(`Weight ${vitals.weight} kg`);
  if (vitals.bmi) parts.push(`BMI ${vitals.bmi}`);
  if (vitals.tewScore) parts.push(`TEW score ${vitals.tewScore}`);
  return parts.length ? `Vitals: ${parts.join(', ')}.` : undefined;
}

/** True for anything that should be visually flagged in prose — mirrors `isAbnormal` in `lab-result.helper.ts` without importing it, since `'--'` reads fine bare in a sentence and NORMAL never needs a suffix either way. */
function interpretationSuffix(
  interpretation: CaseSummaryLabInterpretation,
): string {
  return interpretation === 'NORMAL' || interpretation === '--'
    ? ''
    : ` (${interpretation})`;
}

function summarizeLabOrders(
  labOrders: Array<CaseSummaryTestOrder>,
): string | undefined {
  if (!labOrders.length) return undefined;
  const parts = labOrders.map((order) => {
    if (order.pending) return `${order.test} pending`;
    if (!order.results.length) return `${order.test} ordered`;
    const results = order.results
      .map(
        (result) =>
          `${result.test} ${result.value}${result.units ? ` ${result.units}` : ''}${interpretationSuffix(result.interpretation)}`,
      )
      .join(', ');
    return `${order.test}: ${results}`;
  });
  return `Labs: ${parts.join('; ')}.`;
}

function summarizeConditions(
  conditions: Array<CaseSummaryDiagnosis>,
): string | undefined {
  if (!conditions.length) return undefined;
  return conditions
    .map((condition, index) => {
      const bits = [condition.description];
      if (condition.code) bits.push(`(${condition.code})`);
      const qualifiers = [
        condition.certainty?.toLowerCase(),
        condition.primary ? 'primary' : undefined,
      ].filter(Boolean);
      return `${index + 1}. ${bits.join(' ')}${qualifiers.length ? ` — ${qualifiers.join(', ')}` : ''}.`;
    })
    .join(' ');
}

function summarizeMedications(
  medications: Array<CaseSummaryMedication>,
): string | undefined {
  if (!medications.length) return undefined;
  const parts = medications.map((medication) => {
    const bits = [medication.drug];
    if (medication.dose) bits.push(medication.dose);
    if (medication.route) bits.push(medication.route);
    if (medication.frequency) bits.push(medication.frequency);
    if (medication.duration) bits.push(`for ${medication.duration}`);
    return bits.join(' ');
  });
  return `Medications: ${parts.join('; ')}.`;
}

function summarizePendingOrders(
  labOrders: Array<CaseSummaryTestOrder>,
): string | undefined {
  const pending = labOrders
    .filter((order) => order.pending)
    .map((order) => order.test);
  return pending.length ? `Pending: ${pending.join(', ')}.` : undefined;
}

export function buildSoapNote(input: {
  clinicalNotes: Array<CaseSummaryEncounterNote>;
  vitals: CaseSummaryVitals;
  conditions: Array<CaseSummaryDiagnosis>;
  medications: Array<CaseSummaryMedication>;
  labOrders: Array<CaseSummaryTestOrder>;
}): CaseSummarySoapNote {
  const buckets: Record<SoapBucket, Array<{ label: string; value: string }>> = {
    subjective: [],
    objective: [],
    assessment: [],
    plan: [],
    unclassified: [],
  };

  for (const note of input.clinicalNotes) {
    if (
      !note.encounterType ||
      !SOAP_NOTE_ENCOUNTER_TYPES.includes(note.encounterType)
    )
      continue;
    for (const field of note.fields) {
      buckets[categorizeLabel(field.label)].push(field);
    }
  }

  const subjective =
    [formatFields(buckets.subjective)].filter(Boolean).join(' ') || undefined;

  const objective =
    [
      summarizeVitals(input.vitals),
      formatFields(buckets.objective),
      summarizeLabOrders(input.labOrders),
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const assessment =
    [summarizeConditions(input.conditions), formatFields(buckets.assessment)]
      .filter(Boolean)
      .join(' ') || undefined;

  const plan =
    [
      summarizeMedications(input.medications),
      summarizePendingOrders(input.labOrders),
      formatFields(buckets.plan),
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // Nothing here recognised any S/O/A/P signal at all — surfaced under Objective
  // as a catch-all so an unfamiliar form's data isn't silently dropped, rather
  // than guessed into a section it may not belong in.
  const unclassifiedText = formatFields(buckets.unclassified);
  const objectiveWithUnclassified =
    [
      objective,
      unclassifiedText ? `Other notes: ${unclassifiedText}` : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return {
    subjective,
    objective: objectiveWithUnclassified,
    assessment,
    plan,
  };
}

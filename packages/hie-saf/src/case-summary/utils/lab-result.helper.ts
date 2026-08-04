import { Injectable } from '@nestjs/common';
import {
  CaseSummaryLabInterpretation,
  CaseSummaryLabResult,
  ObsTreeNode,
  ObsTreeObs,
  ObsTreeRange,
  ObsVisitWindow,
} from '../types';
import { isoDatePart, toOpenMrsDatetime } from './visit-window.helper';

/** Depth cap for the concept-tree walk (rule in §5: mirrors the frontend's `OBS_TREE_MAX_DEPTH`; real panels nest 1-2 deep). */
const OBS_TREE_MAX_DEPTH = 6;
/** Node budget for the walk. A depth cap alone does not bound *breadth*. */
const OBS_TREE_MAX_NODES = 500;

/**
 * Lab-result rules ported from `case-summary.resource.ts` in
 * `@ampath/esm-dha-workflow-app` (`assessValue`, `formatReferenceRange`,
 * `flattenObsTree`, `readObsValue`) — see docs/case-summary-endpoint.md §6,
 * rules 1-6 and 9-11. Ported verbatim; each rule exists because the obvious
 * implementation was wrong against real AMRS data.
 */
@Injectable()
export class LabResultHelper {
  assessValue(
    value: string,
    range: ObsTreeRange,
  ): CaseSummaryLabInterpretation {
    return assessValue(value, range);
  }

  formatReferenceRange(range: ObsTreeRange): string | undefined {
    return formatReferenceRange(range);
  }

  flattenObsTree(
    node: ObsTreeNode,
    options?: { window?: ObsVisitWindow },
  ): Array<CaseSummaryLabResult> {
    return flattenObsTree(node, options);
  }
}

/** A reference bound, or `undefined` when absent. `0` is a legitimate bound (rule 1), so this tests presence — never truthiness. */
function referenceBound(value?: number | null): number | undefined {
  return value != null && Number.isFinite(value) ? value : undefined;
}

/**
 * Coerces an obs to a display string. Returns `undefined` for null/blank, so
 * the node is skipped. Numeric wins over coded over text: the raw schema
 * gives typed columns directly (unlike the REST `obstree` resource, which
 * stringified every value — see the note on `ObsTreeObs`), so there is no
 * ambiguity to resolve by field order the way the frontend's typeof-based
 * dispatch had to.
 */
export function readObsValue(obs: ObsTreeObs): string | undefined {
  if (obs.valueNumeric !== null && obs.valueNumeric !== undefined) {
    return Number.isFinite(obs.valueNumeric)
      ? String(obs.valueNumeric)
      : undefined;
  }
  if (obs.valueCodedName !== null && obs.valueCodedName !== undefined) {
    return obs.valueCodedName.trim() || undefined;
  }
  if (obs.valueText !== null && obs.valueText !== undefined) {
    return obs.valueText.trim() || undefined;
  }
  return undefined;
}

/**
 * Classifies a value against its reference range (rules 1-4). Tier order:
 * absolute -> critical -> normal, high side before low. Returns `'--'` — NOT
 * `NORMAL` — for a non-numeric result or a concept with no bounds at all
 * (rule 2): claiming "normal" for an analyte that was never given a range
 * would be an unsafe claim on a printed clinical document.
 *
 * Ignores any server-side interpretation (rule 5 — n/a here, since this
 * value is computed directly from `concept_numeric`, never read from a
 * precomputed column) and treats an inverted range as `NORMAL`, unflagged
 * (rule 4), so a mis-configured concept doesn't paint every row abnormal.
 */
export function assessValue(
  value: string,
  range: ObsTreeRange,
): CaseSummaryLabInterpretation {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';

  const lowAbsolute = referenceBound(range.lowAbsolute);
  const lowCritical = referenceBound(range.lowCritical);
  const lowNormal = referenceBound(range.lowNormal);
  const hiNormal = referenceBound(range.hiNormal);
  const hiCritical = referenceBound(range.hiCritical);
  const hiAbsolute = referenceBound(range.hiAbsolute);

  const bounds = [
    lowAbsolute,
    lowCritical,
    lowNormal,
    hiNormal,
    hiCritical,
    hiAbsolute,
  ];
  if (bounds.every((bound) => bound === undefined)) return '--';
  if (lowNormal !== undefined && hiNormal !== undefined && lowNormal > hiNormal)
    return 'NORMAL';

  if (hiAbsolute !== undefined && numeric > hiAbsolute) return 'OFF_SCALE_HIGH';
  if (hiCritical !== undefined && numeric > hiCritical)
    return 'CRITICALLY_HIGH';
  if (hiNormal !== undefined && numeric > hiNormal) return 'HIGH';
  if (lowAbsolute !== undefined && numeric < lowAbsolute)
    return 'OFF_SCALE_LOW';
  if (lowCritical !== undefined && numeric < lowCritical)
    return 'CRITICALLY_LOW';
  if (lowNormal !== undefined && numeric < lowNormal) return 'LOW';
  return 'NORMAL';
}

/** True when a result should be visually flagged — assessed, and not normal. Drives the wire trim: `interpretation` is only sent when this is true. */
export function isAbnormal(
  interpretation: CaseSummaryLabInterpretation,
): boolean {
  return interpretation !== 'NORMAL' && interpretation !== '--';
}

/** Formats the *normal* range for display, units excluded. */
export function formatReferenceRange(range: ObsTreeRange): string | undefined {
  const low = referenceBound(range.lowNormal);
  const high = referenceBound(range.hiNormal);
  if (low !== undefined && high !== undefined) return `${low} – ${high}`;
  if (low !== undefined) return `≥ ${low}`;
  if (high !== undefined) return `≤ ${high}`;
  return undefined;
}

/** Sortable timestamp for an obs; undated obs sort last rather than corrupting the order. */
function obsTime(obs: ObsTreeObs): number {
  const parsed = Date.parse((obs.obsDatetime ?? '').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether an observation's calendar day falls inside the visit (rule 7).
 * Day-granular on purpose: the floor is the visit's start day (a concept's
 * whole history is in scope without it), the ceiling is the visit's *stop*
 * day and is **absent while the visit is open** — an ongoing admission keeps
 * accruing results, and a lab routinely posts a result a day or more after
 * the sample was taken. Compared as ISO date strings (rule 8), never `Date`.
 */
function isObsInVisitWindow(obs: ObsTreeObs, window?: ObsVisitWindow): boolean {
  const startDay = isoDatePart(window?.startDatetime);
  if (!startDay) return true;
  const obsDay = isoDatePart(obs.obsDatetime);
  if (!obsDay || obsDay < startDay) return false;
  const stopDay = isoDatePart(window?.stopDatetime);
  return !stopDay || obsDay <= stopDay;
}

/** The latest in-window observation for a concept; where several qualify, the most recent wins. */
function latestObsInVisitWindow(
  obs: Array<ObsTreeObs> | undefined,
  window?: ObsVisitWindow,
): ObsTreeObs | undefined {
  const candidates = (obs ?? []).filter((entry) =>
    isObsInVisitWindow(entry, window),
  );
  if (!candidates.length) return undefined;
  return candidates.reduce((latest, entry) =>
    obsTime(entry) > obsTime(latest) ? entry : latest,
  );
}

type ObsTreeWalkState = {
  window?: ObsVisitWindow;
  panel?: string;
  depth: number;
  /** Shared across the whole walk — this is what actually bounds a wide tree. */
  budget: { remaining: number };
  /** Concept ids already emitted, so a concept repeated across branches yields one row (rule 9). */
  seen: Set<number>;
  results: Array<CaseSummaryLabResult>;
};

function walkObsTree(
  node: ObsTreeNode | undefined,
  state: ObsTreeWalkState,
): void {
  if (!node || typeof node !== 'object') return;
  if (state.depth > OBS_TREE_MAX_DEPTH || state.budget.remaining <= 0) return;
  state.budget.remaining -= 1;

  const latest = latestObsInVisitWindow(node.obs, state.window);
  const value = latest ? readObsValue(latest) : undefined;
  const conceptId = node.conceptId;
  const alreadySeen = conceptId !== undefined && state.seen.has(conceptId);
  if (latest && value !== undefined && !alreadySeen) {
    if (conceptId !== undefined) state.seen.add(conceptId);
    state.results.push({
      test: node.display ?? '',
      panel: state.panel,
      value,
      units: node.units || undefined,
      datetime: toOpenMrsDatetime(latest.obsDatetime),
      range: formatReferenceRange(node),
      interpretation: assessValue(value, node),
    });
  }

  // Recurse even when this node itself emitted: `obs` and `subSets` are not mutually
  // exclusive. The ROOT node's display is never used as a panel label (rule 11) — it's
  // the ordered test/panel itself, not a nested sub-panel, and would prefix every row.
  const panelForChildren =
    state.depth === 0 ? undefined : (node.display ?? state.panel);
  for (const child of node.subSets ?? []) {
    if (state.budget.remaining <= 0) break;
    walkObsTree(child, {
      ...state,
      panel: panelForChildren,
      depth: state.depth + 1,
    });
  }
}

/**
 * Flattens one concept-tree branch into display rows, depth-first, keeping
 * only nodes with a non-empty in-window `obs` (rule 10: empty `obs` means
 * "ordered but unresulted", handled by the caller leaving the order
 * `pending`, not by this function).
 *
 * Guarded by a depth cap and a shared node budget; both stop the walk
 * silently, since a malformed tree must not take down the summary.
 */
export function flattenObsTree(
  node: ObsTreeNode,
  options?: { window?: ObsVisitWindow },
): Array<CaseSummaryLabResult> {
  const results: Array<CaseSummaryLabResult> = [];
  walkObsTree(node, {
    window: options?.window,
    depth: 0,
    budget: { remaining: OBS_TREE_MAX_NODES },
    seen: new Set<number>(),
    results,
  });
  return results;
}

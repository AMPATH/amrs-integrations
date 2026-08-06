import { Injectable } from '@nestjs/common';
import { VisitRow } from '../types';

/**
 * Visit-window rules ported from `case-summary.resource.ts` in
 * `@ampath/esm-dha-workflow-app` (`isoDatePart`, `pickAnchorVisit`,
 * `sameDayVisits`, the span computation in `mergeVisitPayloads`) — see
 * docs/case-summary-endpoint.md §6, rules 7, 8, and 14. Ported verbatim: each
 * rule exists because the obvious implementation was wrong against real AMRS
 * data.
 */
@Injectable()
export class VisitWindowHelper {
  isoDatePart(value?: string | null): string | undefined {
    return isoDatePart(value);
  }

  pickAnchorVisit(visits: Array<VisitRow>): VisitRow | undefined {
    return pickAnchorVisit(visits);
  }

  sameDayVisits(visits: Array<VisitRow>, anchor: VisitRow): Array<VisitRow> {
    return sameDayVisits(visits, anchor);
  }

  visitWindow(visits: Array<VisitRow>): {
    startDatetime?: string;
    stopDatetime?: string;
  } {
    return visitWindow(visits);
  }

  toOpenMrsDatetime(raw?: string | null): string | undefined {
    return toOpenMrsDatetime(raw);
  }
}

/**
 * The calendar-date portion of a datetime, e.g. `"2026-08-03"`.
 *
 * Compared as a *string* rather than via `Date`, deliberately (rule 8). The
 * AMRS connection is configured with `dateStrings: true`
 * (`src/core/database/db.module.ts`), so every datetime column already
 * arrives as the raw MySQL string (`"2026-08-03 07:00:00"`) rather than a
 * driver-parsed `Date` — there is no Node-process timezone in the picture to
 * shift the calendar day for an early-morning or late-evening result.
 */
export function isoDatePart(value?: string | null): string | undefined {
  return /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '')?.[1];
}

/**
 * Formats a raw MySQL datetime string (`"2026-08-03 07:00:00"` or
 * `"2026-08-03 07:00:00.000000"`) as the OpenMRS wire format
 * (`"2026-08-03T07:00:00.000+0300"`), matching what the REST API this
 * endpoint replaces already sends. `+0300` is hardcoded rather than derived:
 * rule 8 notes "All timestamps are +0300 from one server" — the AMRS
 * `datetime` columns carry no timezone of their own, so the deployment's
 * fixed offset is the only correct value to stamp on the way out.
 */
export function toOpenMrsDatetime(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(raw);
  if (!match) return undefined;
  return `${match[1]}T${match[2]}.000+0300`;
}

/**
 * The visit the summary is anchored on: the most recent still-open one, else
 * simply the most recent (rule 14). Preferring an open visit stops an
 * ongoing inpatient stay being shadowed by a same-day outpatient visit that
 * merely started later. Assumes `visits` is already ordered newest-first
 * (Q1's `ORDER BY v.date_started DESC`).
 */
export function pickAnchorVisit(visits: Array<VisitRow>): VisitRow | undefined {
  return visits.find((visit) => !visit.dateStopped) ?? visits[0];
}

/**
 * Every visit that started on the same calendar day as the anchor, anchor
 * included (rule 14). Compared on the written date — see `isoDatePart`.
 */
export function sameDayVisits(
  visits: Array<VisitRow>,
  anchor: VisitRow,
): Array<VisitRow> {
  const anchorDay = isoDatePart(anchor.dateStarted);
  if (!anchorDay) return [anchor];
  return visits.filter((visit) => isoDatePart(visit.dateStarted) === anchorDay);
}

/**
 * The span of the merged visits: earliest start to latest stop, formatted
 * for the wire. Left **open (no `stopDatetime`) when any of the merged
 * visits is still open** (rule 7) — since results are still arriving against
 * it, per `isObsInVisitWindow` in `lab-result.helper.ts`.
 *
 * Ported from the span computation inside the frontend's
 * `mergeVisitPayloads`; the rest of that function (unioning encounter
 * payloads) has no equivalent here, since Q2 already scopes encounters by
 * `visit.uuid IN (?)` over every merged visit uuid — there is no per-visit
 * payload to fold together.
 */
export function visitWindow(visits: Array<VisitRow>): {
  startDatetime?: string;
  stopDatetime?: string;
} {
  const starts = visits
    .map((visit) => visit.dateStarted)
    .filter((value): value is string => !!value);
  const stops = visits.map((visit) => visit.dateStopped);
  const anyOpen = stops.some((stop) => !stop);
  const closedStops = stops.filter((value): value is string => !!value);

  return {
    startDatetime: toOpenMrsDatetime(
      starts.length
        ? starts.reduce((earliest, value) =>
            value < earliest ? value : earliest,
          )
        : undefined,
    ),
    stopDatetime:
      anyOpen || !closedStops.length
        ? undefined
        : toOpenMrsDatetime(
            closedStops.reduce((latest, value) =>
              value > latest ? value : latest,
            ),
          ),
  };
}

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KNOWN_TERMINOLOGY_DEFECT_PATTERNS } from './sha-ig.constants';
import { FhirBundle, ShaIssueSummary, ShaValidationOutcome } from './types';

/** An OperationOutcome, from the $validate operation or a failed call. */
interface OperationOutcome {
  resourceType?: string;
  issue?: Array<{
    severity?: string;
    diagnostics?: string;
    details?: { text?: string };
    location?: string[];
  }>;
}

/** True when an OperationOutcome issue matches the documented UAT terminology defect. */
export function isKnownTerminologyDefect(diagnostics?: string): boolean {
  if (!diagnostics) {
    return false;
  }
  return KNOWN_TERMINOLOGY_DEFECT_PATTERNS.some((pattern) =>
    pattern.test(diagnostics),
  );
}

/**
 * SHA FHIR client — the optional pre-submission `$validate` pass against the
 * national SHR's FHIR server (HAPI FHIR 8.4.0, R4B), the read-only operation
 * the whole IG analysis in sha-ig.constants.ts was verified with:
 *
 *   POST ${SHA_FHIR_BASE_URL}/Bundle/$validate
 *
 * Submission itself does NOT go here — it rides DHA's middleware
 * (`POST ${HIE_SHR_BASE_URL}/shr/bundles`) through `ShrService.submitBundle`,
 * with the consent token and facility headers that middleware enforces. This
 * client exists so a bundle can be IG-checked without persisting anything:
 * `$validate` never writes, which is also why it is safe to point at a live
 * SHR.
 *
 * Deliberately NOT `HieHttpRequests` (the shared DHA-middleware client): that
 * client stamps a DHA-IdP bearer token and facility headers on every call —
 * credentials for a different trust domain. The SHA FHIR server needed NO
 * auth for `$validate` on UAT (verified live), and presenting a foreign-IdP
 * bearer could turn a working call into a 401.
 *
 * Auth: none by default (the UAT-verified case), or a static
 * `SHA_FHIR_BEARER_TOKEN`. If a SHA environment ever requires OAuth2, the
 * DRY move is to generalize `HieAuthService` (today hardwired to the HIE_*
 * env keys) rather than fork a second client-credentials implementation
 * here.
 */
@Injectable()
export class ShaFhirClient {
  private readonly shaFhirBaseUrl: string;
  private readonly shaBearerToken: string;

  constructor(private readonly configService: ConfigService) {
    this.shaFhirBaseUrl =
      this.configService.get<string>('SHA_FHIR_BASE_URL') ?? '';
    this.shaBearerToken =
      this.configService.get<string>('SHA_FHIR_BEARER_TOKEN') ?? '';
  }

  /**
   * Pre-submission validation: `POST [base]/Bundle/$validate`.
   *
   * `ok` is true only when the server answered and no ERROR-severity issue
   * remains that is not the documented UAT terminology defect — in strict mode
   * (`SHA_FHIR_PREVALIDATE_STRICT=true`) even those block.
   */
  async validateBundle(bundle: FhirBundle): Promise<ShaValidationOutcome> {
    if (!this.shaFhirBaseUrl) {
      throw new Error(
        'SHA FHIR validation is not configured (SHA_FHIR_BASE_URL is unset)',
      );
    }
    let status: number;
    let body: unknown;
    try {
      const response = await fetch(`${this.shaFhirBaseUrl}/Bundle/$validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          Accept: 'application/fhir+json',
          ...this.authHeaders(),
        },
        body: JSON.stringify(bundle),
      });
      status = response.status;
      const bodyText = await response.text();
      body = bodyText ? tryParseJson(bodyText) : undefined;
    } catch (error) {
      Logger.error(
        `SHA $validate request failed: ${(error as Error)?.message ?? error}`,
      );
      throw new HttpException(
        `SHA $validate request failed: ${(error as Error)?.message ?? error}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    const issues = this.summarizeIssues(body);
    const strict = this.booleanEnv('SHA_FHIR_PREVALIDATE_STRICT', false);
    const blockingIssues = issues.filter(
      (issue) =>
        (issue.severity === 'error' || issue.severity === 'fatal') &&
        (strict || !issue.knownTerminologyDefect),
    );
    return {
      ok: status >= 200 && status < 300 && blockingIssues.length === 0,
      httpStatus: status,
      issues,
      blockingIssues,
    };
  }

  /** Authorization header: the static bearer when configured, else none. */
  private authHeaders(): Record<string, string> {
    return this.shaBearerToken
      ? { Authorization: `Bearer ${this.shaBearerToken}` }
      : {};
  }

  /** Collect an OperationOutcome's issues as summaries, defect-classified. */
  private summarizeIssues(body: unknown): ShaIssueSummary[] {
    const outcome = body as OperationOutcome | undefined;
    if (
      !outcome ||
      outcome.resourceType !== 'OperationOutcome' ||
      !Array.isArray(outcome.issue)
    ) {
      return [];
    }
    return outcome.issue.map((issue) => ({
      severity: issue.severity ?? 'unknown',
      diagnostics: issue.diagnostics ?? issue.details?.text,
      location: issue.location,
      knownTerminologyDefect: isKnownTerminologyDefect(
        issue.diagnostics ?? issue.details?.text,
      ),
    }));
  }

  /** Boolean-ish env flag: unset/false-y means `fallback`, everything else true. */
  private booleanEnv(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === '') {
      return fallback;
    }
    return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
  }
}

/** Parse JSON, returning undefined for non-JSON payloads (error pages). */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

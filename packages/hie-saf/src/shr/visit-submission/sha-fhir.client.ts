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
 * Auth: a static `SHA_FHIR_BEARER_TOKEN` when supplied, else OAuth2 client
 * credentials with a cached token refreshed 30 s before expiry (the same shape
 * `HieAuthService` uses for the middleware token).
 */
@Injectable()
export class ShaFhirClient {
  private readonly shaFhirBaseUrl: string;
  private readonly shaBearerToken: string;
  private readonly shaOAuthTokenUrl: string;
  private readonly shaOAuthClientId: string;
  private readonly shaOAuthClientSecret: string;

  /** Cached OAuth2 token, refreshed 30 s before its reported expiry. */
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {
    this.shaFhirBaseUrl =
      this.configService.get<string>('SHA_FHIR_BASE_URL') ?? '';
    this.shaBearerToken =
      this.configService.get<string>('SHA_FHIR_BEARER_TOKEN') ?? '';
    this.shaOAuthTokenUrl =
      this.configService.get<string>('SHA_FHIR_OAUTH_TOKEN_URL') ?? '';
    this.shaOAuthClientId =
      this.configService.get<string>('SHA_FHIR_OAUTH_CLIENT_ID') ?? '';
    this.shaOAuthClientSecret =
      this.configService.get<string>('SHA_FHIR_OAUTH_CLIENT_SECRET') ?? '';
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
          ...(await this.authHeaders()),
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

  /** Authorization header: static bearer, OAuth2 client credentials, or none. */
  private async authHeaders(): Promise<Record<string, string>> {
    if (this.shaBearerToken) {
      return { Authorization: `Bearer ${this.shaBearerToken}` };
    }
    if (
      this.shaOAuthTokenUrl &&
      this.shaOAuthClientId &&
      this.shaOAuthClientSecret
    ) {
      return { Authorization: `Bearer ${await this.getOAuthToken()}` };
    }
    return {};
  }

  private async getOAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.token;
    }
    const response = await fetch(this.shaOAuthTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.shaOAuthClientId,
        client_secret: this.shaOAuthClientSecret,
      }).toString(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `SHA OAuth2 token request failed (${response.status})${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }
    const parsed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!parsed.access_token) {
      throw new Error('SHA OAuth2 token response had no access_token');
    }
    this.cachedToken = {
      token: parsed.access_token,
      // `expires_in` is seconds; default to 5 min when the server omits it.
      expiresAt: now + (parsed.expires_in ?? 300) * 1000,
    };
    return parsed.access_token;
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

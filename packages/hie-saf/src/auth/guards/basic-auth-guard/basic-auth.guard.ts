import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

interface CachedSession {
  cookie: string;
  expiresAt: number;
}

/**
 * Sessions are minted from the caller's Basic credentials and reused for 15
 * minutes — the same TTL the ETL uses for its OpenMRS session cache.
 */
const SESSION_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, CachedSession>();

interface GuardRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  dhaEtlCookie?: string;
  dhaEtlUser?: string;
}

/**
 * DHA gateway guard. Two ways in, cookie preferred:
 *
 *  1. OpenMRS session cookie (ESM apps — same-origin, no Basic): when a
 *     JSESSIONID cookie is present it is validated against the OpenMRS
 *     session endpoint and used as-is. A present-but-invalid cookie is a 401
 *     — there is no fallback to Basic, so the identity is never ambiguous.
 *  2. HTTP Basic: the credentials are validated against the OpenMRS session
 *     endpoint and the returned JSESSIONID is cached for 15 minutes.
 *
 * Either way the session cookie lands on `request.dhaEtlCookie` so the
 * gateway can call the cookie-auth ETL / FHIR2 on the caller's behalf.
 *
 * Unlike OpenMrsAuthGuard there is no APP_ENV bypass — authorization is the
 * whole point of this facade.
 */
@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();

    const sessionId = request.cookies?.['JSESSIONID'];
    if (sessionId) {
      return this.authenticateWithCookie(request, sessionId);
    }

    const rawHeader = request.headers['authorization'];
    const header = typeof rawHeader === 'string' ? rawHeader : '';
    if (!header.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'An OpenMRS session cookie or Basic credentials are required on the DHA gateway.',
      );
    }

    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString(
      'utf8',
    );
    const separator = decoded.indexOf(':');
    if (separator < 0) {
      throw new UnauthorizedException('Malformed Basic credentials.');
    }
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const cacheKey = createHash('sha256')
      .update(`${user}:${password}`)
      .digest('hex');

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      request.dhaEtlCookie = cached.cookie;
      request.dhaEtlUser = user;
      return true;
    }

    try {
      const resp = await fetch(
        `${this.openmrsBaseUrl()}/openmrs/ws/rest/v1/session`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: header },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await resp.json()) as { authenticated?: boolean };
      if (!(body && body.authenticated === true)) {
        throw new UnauthorizedException('Invalid OpenMRS credentials.');
      }

      const setCookies =
        typeof resp.headers.getSetCookie === 'function'
          ? resp.headers.getSetCookie()
          : [resp.headers.get('set-cookie') ?? ''];
      const match = setCookies.join(';').match(/JSESSIONID=([^;]+)/);
      if (!match) {
        throw new UnauthorizedException(
          'OpenMRS did not issue a session cookie.',
        );
      }

      const cookie = `JSESSIONID=${match[1]}`;
      cache.set(cacheKey, { cookie, expiresAt: Date.now() + SESSION_TTL_MS });
      request.dhaEtlCookie = cookie;
      request.dhaEtlUser = user;
      return true;
    } catch (error) {
      throw this.toUnauthorized(error);
    }
  }

  /**
   * Cookie path: validate the caller's own JSESSIONID against OpenMRS. Any
   * Authorization header is dropped so downstream calls run strictly as the
   * cookie's user (OpenMRS would otherwise re-authenticate from Basic).
   */
  private async authenticateWithCookie(
    request: GuardRequest,
    sessionId: string,
  ): Promise<boolean> {
    const cookie = `JSESSIONID=${sessionId}`;
    try {
      const resp = await fetch(
        `${this.openmrsBaseUrl()}/openmrs/ws/rest/v1/session`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', cookie },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await resp.json()) as {
        authenticated?: boolean;
        user?: { username?: string; display?: string };
      };
      if (!(body && body.authenticated === true)) {
        throw new UnauthorizedException('Invalid or expired OpenMRS session.');
      }
      delete request.headers['authorization'];
      request.dhaEtlCookie = cookie;
      request.dhaEtlUser = body.user?.username ?? body.user?.display;
      return true;
    } catch (error) {
      throw this.toUnauthorized(error);
    }
  }

  private toUnauthorized(error: unknown): UnauthorizedException {
    if (error instanceof UnauthorizedException) {
      return error;
    }
    // Surface the real cause (connect timeout, DNS, TLS, dead origin …) —
    // a bare message made container-side outages indistinguishable from
    // bad credentials (staging incident 2026-11-12).
    const cause =
      error instanceof Error
        ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
        : String(error);
    return new UnauthorizedException(`OpenMRS authentication failed: ${cause}`);
  }

  private openmrsBaseUrl(): string {
    const base = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
    return withScheme.replace(/\/+$/, '');
  }
}

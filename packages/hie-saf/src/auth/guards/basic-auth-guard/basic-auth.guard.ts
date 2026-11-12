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

/**
 * DHA gateway guard: the caller authenticates with HTTP Basic, the guard
 * validates the credentials against the OpenMRS session endpoint, and stores
 * the returned JSESSIONID on the request (`request.dhaEtlCookie`) so the
 * gateway can call the cookie-auth ETL on the caller's behalf.
 *
 * Unlike OpenMrsAuthGuard there is no APP_ENV bypass — authorization is the
 * whole point of this facade.
 */
@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string = request.headers['authorization'] ?? '';
    if (!header.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'Basic credentials are required on the DHA gateway.',
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
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Surface the real cause (connect timeout, DNS, TLS, dead origin …) —
      // a bare message made container-side outages indistinguishable from
      // bad credentials (staging incident 2026-11-12).
      const cause =
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
          : String(error);
      throw new UnauthorizedException(
        `OpenMRS authentication failed: ${cause}`,
      );
    }
  }

  private openmrsBaseUrl(): string {
    const base = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
    return withScheme.replace(/\/+$/, '');
  }
}

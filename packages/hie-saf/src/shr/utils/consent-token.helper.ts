/**
 * DHA's per-visit `consent_token` is a JWT. Nothing here verifies its
 * signature — that is DHA's job on every read — this only reads the public
 * claims so a stored session can tell whether its token is worth reusing.
 *
 * The documented example tokens decode to `{ "jti": ..., "sub": ... }` with no
 * `exp`, so every claim below is treated as optional. A missing `exp` means
 * "expiry unknown", never "does not expire": callers refresh instead of
 * guessing a lifetime.
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */

/** Claims this middleware reads off a consent token. All optional. */
export type ConsentTokenClaims = {
  /** Standard `exp`, seconds since the epoch. */
  exp?: number;
  /** The example tokens carry the patient's CR id here. */
  sub?: string;
  jti?: string;
};

/** Clock skew allowed before a token is treated as still usable. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * Decodes the JWT payload. Returns `null` for anything that is not a
 * three-or-more-part JWT with a JSON payload — an opaque token is not an error,
 * it just means no claims are available.
 */
export function decodeConsentTokenClaims(
  token: string | undefined | null,
): ConsentTokenClaims | null {
  if (!token) {
    return null;
  }
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const claims: unknown = JSON.parse(decoded);
    if (!claims || typeof claims !== 'object') {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/**
 * The token's own expiry, or `null` when it carries no usable `exp` claim.
 */
export function consentTokenExpiry(
  token: string | undefined | null,
): Date | null {
  const exp = decodeConsentTokenClaims(token)?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return null;
  }
  return new Date(exp * 1000);
}

/**
 * The patient CR id the token was issued for, when it carries one. Used only as
 * a fallback for callers that did not send `crId` — a supplied value wins.
 */
export function consentTokenSubject(
  token: string | undefined | null,
): string | undefined {
  const sub = decodeConsentTokenClaims(token)?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
}

/**
 * Whether a stored token can still be handed out as-is. Unknown expiry counts
 * as stale, so the only tokens reused without a refresh are the ones that
 * actually say they are still valid.
 */
export function isConsentTokenUsable(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() - EXPIRY_SKEW_MS > now.getTime();
}

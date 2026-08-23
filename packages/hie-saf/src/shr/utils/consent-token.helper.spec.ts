import {
  consentTokenExpiry,
  consentTokenSubject,
  decodeConsentTokenClaims,
  isConsentTokenUsable,
} from './consent-token.helper';

/** Unsigned stand-in — nothing here verifies signatures, only reads claims. */
const jwtWith = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');

describe('consent-token.helper', () => {
  it('decodes the claims a DHA consent token actually carries', () => {
    // Shape of the tokens in DHA's own docs: jti + sub, no exp.
    const token = jwtWith({
      jti: 'f9279c78-e55e-4500-a0e5-a8de141337b7',
      sub: 'CR0824441219329-5',
    });

    expect(decodeConsentTokenClaims(token)).toEqual({
      jti: 'f9279c78-e55e-4500-a0e5-a8de141337b7',
      sub: 'CR0824441219329-5',
    });
    expect(consentTokenSubject(token)).toBe('CR0824441219329-5');
    expect(consentTokenExpiry(token)).toBeNull();
  });

  it('returns the exp claim as a date when the token carries one', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;

    expect(consentTokenExpiry(jwtWith({ exp }))?.getTime()).toBe(exp * 1000);
  });

  const unreadableTokens: { label: string; token: string }[] = [
    { label: 'an opaque token', token: 'not-a-jwt' },
    { label: 'a payload that is not JSON', token: 'header.bm90LWpzb24.sig' },
    { label: 'an empty token', token: '' },
  ];
  unreadableTokens.forEach(({ label, token }) => {
    it(`returns no claims for ${label}`, () => {
      expect(decodeConsentTokenClaims(token)).toBeNull();
      expect(consentTokenExpiry(token)).toBeNull();
      expect(consentTokenSubject(token)).toBeUndefined();
    });
  });

  it('treats an unknown expiry as stale rather than as never expiring', () => {
    expect(isConsentTokenUsable(null)).toBe(false);
    expect(isConsentTokenUsable(undefined)).toBe(false);
  });

  it('reuses a token that says it is still valid and rejects one that does not', () => {
    const now = new Date('2026-08-23T10:00:00.000Z');

    expect(
      isConsentTokenUsable(new Date('2026-08-23T11:00:00.000Z'), now),
    ).toBe(true);
    expect(
      isConsentTokenUsable(new Date('2026-08-23T09:59:00.000Z'), now),
    ).toBe(false);
    // Inside the skew margin, so not worth handing out.
    expect(
      isConsentTokenUsable(new Date('2026-08-23T10:00:20.000Z'), now),
    ).toBe(false);
  });
});

/**
 * Shapes for the Livia partner SSO passthrough.
 *
 * Livia answers `POST /api/partner/sso/token` with an HTTP 200 whose body
 * carries an application-level `code` — 200 means a token was minted — plus
 * the lifetime of the minted token in seconds and the ready-to-use URL the
 * caller embeds. The names are Livia's; they pass through untouched so this
 * service stays a thin broker.
 */
export interface LiviaSsoTokenResponse {
  code?: number;
  expires_in?: number;
  redirect_url?: string;
  message?: string;
}

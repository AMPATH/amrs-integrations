import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShrConsentSessionStatus } from '../../../shr/types';

/**
 * An SHR consent that is currently open for a patient at a facility, so a
 * "check or refresh my token" call does not need the caller to already be
 * holding `visit_id`/`consent_id`.
 *
 * `(cr_id, location_uuid)` is the practical lookup key — it matches how DHA
 * scopes `GET /shr/open-visits` itself. `visit_id` is unique: a visit has one
 * active session.
 *
 * Written whenever DHA actually issues a usable `consent_token` (OTP approval,
 * or an emergency consent approved on the spot), updated on refresh, and closed
 * once a closure really completes. See `ShrConsentSessionStore`.
 *
 * `synchronize` is off and this repo has no migrations, so the table is created
 * by hand:
 *
 * ```sql
 * CREATE TABLE shr_consent_session (
 *   id              INT AUTO_INCREMENT PRIMARY KEY,
 *   cr_id           VARCHAR(100) NOT NULL,
 *   location_uuid   VARCHAR(255) NOT NULL,
 *   consent_id      VARCHAR(100) NULL,
 *   visit_id        VARCHAR(255) NOT NULL,
 *   consent_token   TEXT NOT NULL,
 *   status          VARCHAR(20)  NOT NULL DEFAULT 'open',
 *   token_issued_at DATETIME     NOT NULL,
 *   token_expires_at DATETIME    NULL,
 *   date_created    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE KEY shr_consent_session_visit_id (visit_id),
 *   KEY shr_consent_session_cr_id (cr_id),
 *   KEY shr_consent_session_location_uuid (location_uuid)
 * );
 * ```
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
@Entity({ name: 'shr_consent_session' })
export class ShrConsentSession {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 100, name: 'cr_id', nullable: false })
  @Index('shr_consent_session_cr_id')
  crId!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'location_uuid',
    nullable: false,
  })
  @Index('shr_consent_session_location_uuid')
  locationUuid!: string;

  /**
   * Null only when the session was reconstructed from `GET /shr/open-visits`,
   * which returns visit ids and nothing else.
   */
  @Column({ type: 'varchar', length: 100, name: 'consent_id', nullable: true })
  consentId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'visit_id', nullable: false })
  @Index('shr_consent_session_visit_id', { unique: true })
  visitId!: string;

  /** DHA's per-visit JWT. Long enough that `varchar` is not safe. */
  @Column({ type: 'text', name: 'consent_token', nullable: false })
  consentToken!: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    nullable: false,
    default: ShrConsentSessionStatus.Open,
  })
  status!: ShrConsentSessionStatus;

  @Column({ type: 'datetime', name: 'token_issued_at', nullable: false })
  tokenIssuedAt!: Date;

  /**
   * The token's own `exp` claim, decoded — not a locally invented expiry. Null
   * when the token carries no `exp`, which means staleness cannot be judged
   * locally and the token has to be refreshed before use.
   */
  @Column({ type: 'datetime', name: 'token_expires_at', nullable: true })
  tokenExpiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  dateCreated!: Date;
}

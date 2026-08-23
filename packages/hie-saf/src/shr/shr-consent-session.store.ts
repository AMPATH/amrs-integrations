import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShrConsentSession } from '../core/database/entities/shr-consent-session.entity';
import { ShrConsentSessionStatus } from './types';
import { consentTokenExpiry } from './utils/consent-token.helper';

/** What a caller has to supply to record a newly issued consent token. */
export type RecordedConsentSession = {
  crId: string;
  locationUuid: string;
  visitId: string;
  consentToken: string;
  /** Unknown when the session was reconstructed from `GET /shr/open-visits`. */
  consentId?: string | null;
};

/**
 * Server side record of which `(crId, locationUuid)` pairs currently hold an
 * open, usable SHR consent — see `ShrConsentSession`.
 *
 * Every method here is *bookkeeping*: a DHA call has already succeeded by the
 * time it runs, so a failure to write must never turn a successful consent into
 * an error for the caller. Writes are therefore best effort and log instead of
 * throwing. Reads are the exception — `findOpenSession` is load bearing for
 * `GET /shr/consents/active` and lets its errors surface.
 */
@Injectable()
export class ShrConsentSessionStore {
  constructor(
    @InjectRepository(ShrConsentSession)
    private readonly sessionRepository: Repository<ShrConsentSession>,
  ) {}

  /** The open session for a patient at a facility, if there is one. */
  async findOpenSession(
    crId: string,
    locationUuid: string,
  ): Promise<ShrConsentSession | null> {
    return this.sessionRepository.findOne({
      where: { crId, locationUuid, status: ShrConsentSessionStatus.Open },
      order: { id: 'DESC' },
    });
  }

  /**
   * Records a token DHA has just issued — an OTP approval, or an emergency
   * consent approved on the spot. Re-issuing for a visit we already track
   * updates that row rather than inserting a second one, since `visit_id` is
   * unique.
   */
  async recordIssuedToken(
    session: RecordedConsentSession,
  ): Promise<ShrConsentSession | null> {
    try {
      const existing = await this.sessionRepository.findOneBy({
        visitId: session.visitId,
      });
      const issuedAt = new Date();
      const entity = this.sessionRepository.merge(
        existing ?? this.sessionRepository.create(),
        {
          crId: session.crId,
          locationUuid: session.locationUuid,
          consentId: session.consentId ?? existing?.consentId ?? null,
          visitId: session.visitId,
          consentToken: session.consentToken,
          status: ShrConsentSessionStatus.Open,
          tokenIssuedAt: issuedAt,
          tokenExpiresAt: consentTokenExpiry(session.consentToken),
        },
      );
      return await this.sessionRepository.save(entity);
    } catch (error) {
      Logger.error(
        `Could not record the SHR consent session for visit ${session.visitId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Stores a token that came back from `POST /shr/visits/{visit_id}/refresh`.
   * A visit we never recorded is not an error — the consent may have been
   * granted before this table existed, or by another instance — there is just
   * nothing to update.
   */
  async recordRefreshedToken(
    visitId: string,
    consentToken: string,
  ): Promise<ShrConsentSession | null> {
    try {
      const existing = await this.sessionRepository.findOneBy({ visitId });
      if (!existing) {
        return null;
      }
      existing.consentToken = consentToken;
      existing.tokenIssuedAt = new Date();
      existing.tokenExpiresAt = consentTokenExpiry(consentToken);
      existing.status = ShrConsentSessionStatus.Open;
      return await this.sessionRepository.save(existing);
    } catch (error) {
      Logger.error(
        `Could not update the SHR consent session for visit ${visitId}: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Closes the local record. Only call this once a closure has actually
   * completed — DHA returning `end_date`, from either `closeVisit` (immediate
   * closure) or `verifyConsent` (OTP-gated closure completed). An OTP-gated
   * `closeVisit` returns `otp_record` and leaves the visit open, so it must not
   * land here.
   */
  async markClosedByVisit(visitId: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { visitId },
        { status: ShrConsentSessionStatus.Closed },
      );
    } catch (error) {
      Logger.error(
        `Could not close the SHR consent session for visit ${visitId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  /**
   * Same, for a closure completed through `verifyConsent`, where the response
   * may identify the consent rather than the visit.
   */
  async markClosedByConsent(consentId: string): Promise<void> {
    try {
      await this.sessionRepository.update(
        { consentId },
        { status: ShrConsentSessionStatus.Closed },
      );
    } catch (error) {
      Logger.error(
        `Could not close the SHR consent session for consent ${consentId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}

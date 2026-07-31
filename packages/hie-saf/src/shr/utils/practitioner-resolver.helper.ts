import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HwrSync } from '../../core/database/entities/hwr_sync.entity';
import { HealthWorkerRegistryService } from '../../health-worker-registry/health-worker-registry.service';
import {
  HealthWokerApiResponse,
  Regulators,
} from '../../health-worker-registry/types';
import { IdentifierTypes } from '../../shared/types';
import {
  OpenMrsProviderSearchResponse,
  OpenMrsSessionWithProvider,
} from '../types';

/**
 * Resolves `practitioner_id` for SHR reads from the logged in provider, the way
 * `LocationFacilityHelper` resolves `facility_id` from a location.
 *
 * Chain: JSESSIONID -> OpenMRS session (`currentProvider`, else the provider
 * linked to the session user) -> `hwr_sync.national_id` for that provider ->
 * Health Worker Registry record.
 *
 * Assumptions to confirm in UAT:
 *  - `OpenMrsAuthGuard` does not expose the session user, so the session is
 *    fetched again here with the caller's cookie (no shared code changed).
 *  - the provider must already be in `hwr_sync`, i.e. the facility's HWR sync
 *    has run (see `HwrSyncService`).
 *  - DHA's "Health Worker Registry identifier" is read as the HWR record id,
 *    falling back to the regulator registration number.
 */
@Injectable()
export class PractitionerResolver {
  private readonly baseOpenMrsUrl: string;

  constructor(
    @InjectRepository(HwrSync)
    private readonly hwrSyncRepository: Repository<HwrSync>,
    private readonly healthWorkerRegistryService: HealthWorkerRegistryService,
    private readonly configService: ConfigService,
  ) {
    this.baseOpenMrsUrl = this.configService.get<string>('AMRS_BASE_URL') ?? '';
  }

  public async resolveLoggedInPractitionerId(
    sessionCookie: string | undefined,
    locationUuid: string,
  ): Promise<string> {
    if (!sessionCookie) {
      throw new HttpException(
        'Cannot resolve the logged in practitioner: OpenMRS session cookie (JSESSIONID) is missing',
        HttpStatus.BAD_REQUEST,
      );
    }
    const providerUuid = await this.getLoggedInProviderUuid(sessionCookie);
    const nationalId = await this.getProviderNationalId(providerUuid);
    return this.getRegistryPractitionerId(nationalId, locationUuid);
  }

  private async getLoggedInProviderUuid(
    sessionCookie: string,
  ): Promise<string> {
    const sessionUrl = `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(uuid,display),currentProvider:(uuid,identifier))`;
    const session = await this.getFromOpenMrs<OpenMrsSessionWithProvider>(
      sessionUrl,
      sessionCookie,
      'session',
    );
    if (!session.authenticated) {
      throw new HttpException(
        'OpenMRS session is not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (session.currentProvider?.uuid) {
      return session.currentProvider.uuid;
    }
    const userUuid = session.user?.uuid;
    if (!userUuid) {
      throw new HttpException(
        'OpenMRS session did not return the logged in user',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const providerUrl = `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1/provider?user=${encodeURIComponent(userUuid)}&v=custom:(uuid,identifier)`;
    const search = await this.getFromOpenMrs<OpenMrsProviderSearchResponse>(
      providerUrl,
      sessionCookie,
      'provider',
    );
    const providerUuid = search.results?.[0]?.uuid;
    if (!providerUuid) {
      throw new HttpException(
        `OpenMRS user ${userUuid} has no linked provider record, so the practitioner cannot be resolved`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return providerUuid;
  }

  private async getProviderNationalId(providerUuid: string): Promise<string> {
    const hwr = await this.hwrSyncRepository.findOneBy({
      provider_uuid: providerUuid,
    });
    if (!hwr?.national_id) {
      throw new HttpException(
        `No national id on file for provider ${providerUuid}; run the HWR sync for this facility first`,
        HttpStatus.NOT_FOUND,
      );
    }
    return hwr.national_id;
  }

  private async getRegistryPractitionerId(
    nationalId: string,
    locationUuid: string,
  ): Promise<string> {
    const response: HealthWokerApiResponse =
      await this.healthWorkerRegistryService.fetchHealthWorkerFromRegistry({
        identifierNumber: nationalId,
        identifierType: IdentifierTypes.NationalID,
        regulator: Regulators.Kmpdc,
        locationUuid,
      });
    const healthWorker = response?.message;
    if (!healthWorker || healthWorker['error']) {
      Logger.error(
        `HWR lookup failed for the logged in practitioner: ${JSON.stringify(healthWorker?.['error'] ?? healthWorker)}`,
      );
      throw new HttpException(
        'Could not find the logged in practitioner in the Health Worker Registry',
        HttpStatus.NOT_FOUND,
      );
    }
    const practitionerId =
      healthWorker.membership?.id || healthWorker.membership?.registration_id;
    if (!practitionerId) {
      throw new HttpException(
        'Health Worker Registry record has no practitioner identifier',
        HttpStatus.NOT_FOUND,
      );
    }
    return practitionerId;
  }

  private async getFromOpenMrs<T>(
    url: string,
    sessionCookie: string,
    context: string,
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          cookie: `JSESSIONID=${sessionCookie}`,
        },
      });
      if (!response.ok) {
        Logger.error(`OpenMRS ${context} lookup ${response.status}`);
        throw new HttpException(
          `OpenMRS ${context} lookup failed (${response.status})`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error reading the OpenMRS ${context}: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

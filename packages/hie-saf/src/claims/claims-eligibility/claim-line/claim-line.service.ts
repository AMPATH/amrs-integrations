import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimLineDto, ClaimLineActions, RemoveClaimLineDto } from './types';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimLine } from '../../../core/database/entities/claime-line.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ClaimLineService {
  constructor(
    @InjectRepository(ClaimLine)
    private claimLineRepository: Repository<ClaimLine>,
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addClaimLine(
    addClaimLineDto: Partial<AddClaimLineDto>,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimLineUrl = `${baseUrl}/api/v1/claims/lines`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addClaimLineUrl,
        addClaimLineDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const addClaimLineEntity = this.claimLineRepository.create({
            locationUuid: locationUuid,
            claimLineAction: ClaimLineActions.Add,
            consentToken: addClaimLineDto.consent_token,
            interventionCode: addClaimLineDto.intervention_code,
            claimLineResponse: data,
          });
          await this.claimLineRepository.save(addClaimLineEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding claim line',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async removeClaimLine(
    removeClaimLineDto: RemoveClaimLineDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const removeClaimLineUrl = `${baseUrl}/api/v1/claims/lines`;
    try {
      const response = await this.hieHttpRequests.sendPatchRequest(
        removeClaimLineUrl,
        removeClaimLineDto,
        locationUuid,
      );
      const data = await response.json();
      if (data) {
        try {
          const addClaimLineEntity = this.claimLineRepository.create({
            locationUuid: locationUuid,
            claimLineAction: ClaimLineActions.Remove,
            consentToken: removeClaimLineDto.consent_token,
            lineGuid: removeClaimLineDto.line_guid,
            claimLineResponse: data,
          });
          await this.claimLineRepository.save(addClaimLineEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Removing claim line',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

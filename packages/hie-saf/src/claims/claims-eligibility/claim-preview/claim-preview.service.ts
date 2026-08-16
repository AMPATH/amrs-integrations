import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import {
  PayerClaimPreviewResponse,
  PreviewPayerClaimDto,
  PreviewProviderClaimDto,
  ProviderClaimPreviewResponse,
} from './types';
import { ClaimsVisitService } from '../visit/visit.service';
import { QueryClaimVisitDto } from '../visit/dto/query-claim-visit.dto';
import { UpdateClaimVisitDto } from '../visit/dto/update-claim-visit.dto';

@Injectable()
export class ClaimPreviewService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    private readonly claimVisitService: ClaimsVisitService,
  ) {}
  async previewProviderClaim(
    previewProviderClaimDto: PreviewProviderClaimDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const previewProviderClaimUrl = `${baseUrl}/api/v1/claims/preview`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        previewProviderClaimUrl,
        previewProviderClaimDto,
        locationUuid,
      );
      const data = (await response.json()) as ProviderClaimPreviewResponse;
      console.log({ data });
      try {
        const queryClaimBy: QueryClaimVisitDto = {
          authorizationCode: previewProviderClaimDto.consent_token,
        };
        const updateClaimVisitDto: UpdateClaimVisitDto = {
          providerStatus: data.workflow_state,
          providerAuthStatus: data.claim_auth_status,
          invoiceNo: data.invoices[0]?.invoice_number ?? '',
        };
        await this.claimVisitService.updateVisit(
          queryClaimBy,
          updateClaimVisitDto,
        );
      } catch (error) {
        Logger.error(error);
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error previewing provider claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async previewPayerClaim(
    previewPayerClaimDto: PreviewPayerClaimDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const queryString = new URLSearchParams(previewPayerClaimDto).toString();
    const previewPayerClaimUrl = `${baseUrl}/api/v1/claims/preview/payer?${queryString}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        previewPayerClaimUrl,
        locationUuid,
      );
      const data = (await response.json()) as PayerClaimPreviewResponse;

      try {
        const results = data.results ?? null;
        if (results && results.length > 0) {
          const queryClaimBy: QueryClaimVisitDto = {
            invoiceNo: previewPayerClaimDto.provider_claim_no,
          };
          console.log({queryClaimBy});
          const updateClaimVisitDto: UpdateClaimVisitDto = {
            payerStatus: results[0]?.workflowState ?? '',
            payerAuthStatus: results[0].authorization.status,
          };
          console.log({updateClaimVisitDto});
          await this.claimVisitService.updateVisit(
            queryClaimBy,
            updateClaimVisitDto,
          );
        }
      } catch (error) {
        Logger.error(error);
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error previewing payer claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { CreateOtpAuthorizationDto } from './dto/create-otp-authorization.dto';

@Injectable()
export class ClaimsAuthorizeService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Pre-visit / elective OTP authorize → HIE POST /api/v1/claims/authorize.
   * Returns authorization with token (AUTHORIZED_PENDING_VISIT) and optional guid.
   */
  async authorizeWithOtp(dto: CreateOtpAuthorizationDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const url = `${baseUrl}/api/v1/claims/authorize`;
    const payload: Record<string, unknown> = {
      patient_id: dto.patient_id,
      otp: dto.otp,
      interventions: dto.interventions,
      service_type: dto.service_type,
    };
    if (dto.beneficiary_contact_id) {
      payload.beneficiary_contact_id = dto.beneficiary_contact_id;
    }

    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        url,
        payload,
        dto.locationUuid,
      );
      const text = await response.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        Logger.error(
          `HIE claims/authorize ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
        throw new HttpException(
          typeof data === 'object' && data && 'message' in data
            ? (data as { message: string }).message
            : `HIE authorize failed (${response.status})`,
          response.status >= 400 && response.status < 600
            ? response.status
            : HttpStatus.BAD_GATEWAY,
        );
      }
      return data ?? {};
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error authorizing claim OTP: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../hie-http-request/hie-http-requests';
import { ClientsOtpWhitelistDto, CreateOtpWhitelistReponse } from './types';
import { CreateOtpWhitelistRequestDto } from './dto/create-otp-whitelist.dto';
import { LocationFacilityHelper } from '../../shared/utils/location-facility.helper';

@Injectable()
export class OtpWhitelistService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
  ) {}
  async createOtpWhitelistRequest(
    createOtpWhitelistRequestDto: CreateOtpWhitelistRequestDto,
    locationUuid: string,
    file: any,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const createOtpWhitelistUrl = `${baseUrl}/api/v1/patients/otp-whitelists`;
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        locationUuid,
      );
    if (!facility) {
      throw new InternalServerErrorException(`Facility not found`);
    }
    if (!facility.frCode) {
      throw new InternalServerErrorException(`Facility code not configured`);
    }

    const externalFormData = new FormData();

    try {
      if (file) {
        if (!file.originalname) {
          return false;
        }
        const originalname = (file?.originalname as unknown as string) ?? '';
        const fileBlob = new Blob([file.buffer], { type: file.mimetype });
        externalFormData.append(
          'attachments_file_blob',
          fileBlob,
          originalname,
        );
      }

      // map the data
      externalFormData.append(
        'reason_type',
        createOtpWhitelistRequestDto.reasonType,
      );
      externalFormData.append('reason', createOtpWhitelistRequestDto.reason);
      externalFormData.append(
        'beneficiary_cr_id',
        createOtpWhitelistRequestDto.beneficiaryCrId,
      );
      externalFormData.append(
        'attachments',
        createOtpWhitelistRequestDto.attachments,
      );
      externalFormData.append(
        'biometric_attempts',
        createOtpWhitelistRequestDto.biometricAttempts,
      );
      externalFormData.append('facility_fr_code', facility.frCode ?? '');
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to forward form data: ${error.message}`,
      );
    }
    try {
      const response = await this.hieHttpRequests.sendFormDataPostRequest(
        createOtpWhitelistUrl,
        externalFormData,
        locationUuid,
      );
      const data = (await response.json()) as CreateOtpWhitelistReponse;
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error creating OTP Whitelist request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async fetchClientsOtpWhitelist(
    clientsOtpWhitelistDto: ClientsOtpWhitelistDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const fetchOtpWhitelistUrl = `${baseUrl}/api/v1/patients/otp-whitelists/callback?beneficiary_cr_id=${clientsOtpWhitelistDto.beneficiary_cr_id}&facility_fr_code=${clientsOtpWhitelistDto.facility_fr_code}`;

    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        fetchOtpWhitelistUrl,
        locationUuid,
      );
      const data = await response.json();
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error fetching Otp whitelist',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

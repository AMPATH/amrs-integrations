import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientRegistryService } from './client-registry.service';
import { type SearchClientDto } from './dto/search-client-dto';
import { SendCustomOtpParamsDto } from './dto/send-custom-otp-params.dto';
import { ConsentService } from '../consent/consent.service';
import { ConsentScope } from './types';
import { ValidateCustomOtpParamsDto } from './dto/validate-custom-otp.dto';
import { ValidateConsentDto } from '../shared/dto/validate-consent.dto';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ConsentDto } from '../shared/types';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { ContactsService } from '../consent/contacts/contacts.service';
import { SearchPatientContactsDto } from '../consent/contacts/dto/search-patient-contact.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateOtpWhitelistRequestDto } from '../consent/otp-whitelist/dto/create-otp-whitelist.dto';
import { OtpWhitelistService } from '../consent/otp-whitelist/otp-whitelist.service';

@UseGuards(OpenMrsAuthGuard)
@Controller('client')
export class ClientRegistryController {
  constructor(
    private clientRegistryService: ClientRegistryService,
    private consentService: ConsentService,
    private locationFacilityHelper: LocationFacilityHelper,
    private contactsService: ContactsService,
    private otpWhitelistService: OtpWhitelistService,
  ) {}
  @Post('search')
  public searchClient(@Body() searchClientRequestParams: SearchClientDto) {
    return this.clientRegistryService.fetchClientFromClientRegistry(
      searchClientRequestParams,
    );
  }
  @Post('send-custom-otp')
  public async sendCustomOtp(@Body() body: SendCustomOtpParamsDto) {
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        body.locationUuid,
      );
    if (!facility) {
      throw new HttpException('Missing facility', HttpStatus.BAD_REQUEST);
    }
    if (!facility.frCode) {
      throw new HttpException('Missing facility code', HttpStatus.BAD_REQUEST);
    }
    const consentDto: ConsentDto = {
      identifierType: body.identificationType,
      identifierNumber: body.identificationNumber,
      phoneNumber: body.phoneNumber,
      scope: [ConsentScope.ClientRegistry, ConsentScope.SharedHealthRecords],
      facility: facility.frCode,
    };
    return this.consentService.requestClientConsent(
      consentDto,
      body.locationUuid,
    );
  }
  @Post('validate-custom-otp')
  public validateCustomOtp(@Body() body: ValidateCustomOtpParamsDto) {
    const validateConsentDto: ValidateConsentDto = {
      id: body.sessionId,
      otp: body.otp,
    };
    return this.consentService.validateClientConsent(
      validateConsentDto,
      body.locationUuid,
    );
  }
  @Post('contacts')
  public getClientContacts(@Body() body: SearchPatientContactsDto) {
    return this.contactsService.fetchPatientContacts(body, body.locationUuid);
  }
  @Post('otp-whitelist')
  @UseInterceptors(FileInterceptor('attachmentsFileBlob'))
  public createOtpWhitelistRequest(
    @UploadedFile() file: any,
    @Body() body: CreateOtpWhitelistRequestDto,
  ) {
    return this.otpWhitelistService.createOtpWhitelistRequest(
      body,
      body.locationUuid,
      file,
    );
  }
}

import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ClientRegistryService } from './client-registry.service';
import { type SearchClientDto } from './dto/search-client-dto';
import { SendCustomOtpParamsDto } from './dto/send-custom-otp-params.dto';
import { ConsentService } from '../consent/consent.service';
import { type RequestConsentDto } from '../shared/dto/request-consent.dto';
import { ConsentScope } from './types';

@Controller('client')
export class ClientRegistryController {
  constructor(
    private clientRegistryService: ClientRegistryService,
    private consentService: ConsentService,
  ) {}
  @Post('search')
  public searchClient(@Body() searchClientRequestParams: SearchClientDto) {
    if (
      !searchClientRequestParams.identificationNumber ||
      !searchClientRequestParams.identificationType
    ) {
      return HttpStatus.BAD_REQUEST;
    }
    const searchClientDto: SearchClientDto = {
      identificationNumber: searchClientRequestParams.identificationNumber,
      identificationType: searchClientRequestParams.identificationType,
    };
    return this.clientRegistryService.fetchClientFromClientRegistry(
      searchClientDto,
    );
  }
  @Post('send-custom-otp')
  public sendCustomOtp(@Body() body: SendCustomOtpParamsDto) {
    const requestConsentDto: RequestConsentDto = {
      identifierType: body.identificationType,
      identifierNumber: body.identificationNumber,
      phoneNumber: body.phoneNumber,
      facility: body.facility,
      scope: [ConsentScope.ClientRegistry, ConsentScope.SharedHealthRecords],
    };
    return this.consentService.requestClientConsent(requestConsentDto);
  }
}

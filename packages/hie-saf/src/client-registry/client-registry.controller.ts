import { Body, Controller, HttpStatus, Post, Query } from '@nestjs/common';
import { ClientRegistryService } from './client-registry.service';
import { type SearchClientDto } from './dto/search-client-dto';

@Controller('client')
export class ClientRegistryController {
  constructor(private clientRegistryService: ClientRegistryService) {}
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
}

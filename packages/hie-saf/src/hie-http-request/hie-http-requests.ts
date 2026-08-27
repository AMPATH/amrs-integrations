import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { HieAuthService } from '../auth/hie-auth/hie-auth.service';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';

@Injectable()
export class HieHttpRequests {
  constructor(
    private readonly hieAuthService: HieAuthService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
  ) {}

  private async getHeaders(locationUuid: string) {
    const token = await this.hieAuthService.getToken();
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        locationUuid,
      );
    if (!facility) {
      throw new HttpException('Facility not found', HttpStatus.NOT_FOUND);
    }
    const { frCode } = facility;
    if (!frCode) {
      throw new HttpException('Facility code found', HttpStatus.NOT_FOUND);
    }
    return {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-facility-id': frCode,
      'x-facility-id-type': 'fr-code',
    };
  }
  async sendGetRequest(
    url: string,
    locationUuid: string,
    extraHeaders?: Record<string, string>,
  ) {
    const headers = await this.getHeaders(locationUuid);
    if (!headers) {
      throw new HttpException('Missing header params', HttpStatus.BAD_REQUEST);
    }
    const options = {
      method: 'GET',
      headers: {
        ...headers,
        ...extraHeaders,
      },
    };
    return await fetch(url, options);
  }
  async sendPostRequest(
    url: string,
    payload: any,
    locationUuid: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const headers = await this.getHeaders(locationUuid);
    const options = {
      method: 'POST',
      headers: {
        ...headers,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    };
    return await fetch(url, options);
  }

  async sendFormDataPostRequest(
    url: string,
    payload: any,
    locationUuid: string,
  ): Promise<any> {
    const headers = await this.getHeaders(locationUuid);
    // Do not set content-type — fetch must set multipart boundary automatically.
    // Still forward facility headers so HIE ties the preauth to the same facility
    // as the claim (JSON posts already send these).
    const options = {
      method: 'POST',
      headers: {
        authorization: headers['authorization'],
        'x-facility-id': headers['x-facility-id'],
        'x-facility-id-type': headers['x-facility-id-type'],
      },
      body: payload,
    };
    return await fetch(url, options);
  }

  async sendPatchRequest(
    url: string,
    payload: any,
    locationUuid: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const headers = await this.getHeaders(locationUuid);
    const options = {
      method: 'PATCH',
      headers: {
        ...headers,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    };
    return await fetch(url, options);
  }
  async sendDeleteRequest(
    url: string,
    payload: any,
    locationUuid: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const headers = await this.getHeaders(locationUuid);
    const options = {
      method: 'DELETE',
      headers: {
        ...headers,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    };
    return await fetch(url, options);
  }
}

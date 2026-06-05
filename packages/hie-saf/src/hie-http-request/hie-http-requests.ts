import { Injectable } from '@nestjs/common';
import { HieAuthService } from 'src/auth/hie-auth/hie-auth.service';

@Injectable()
export class HieHttpRequests {
  constructor(private readonly hieAuthService: HieAuthService) {}

  private async getHeaders() {
    const token = await this.hieAuthService.getToken();
    return {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-facility-id': 'FID-27-114387-5',
      'x-facility-id-type': 'fr-code',
    };
  }
  async sendGetRequest(url: string) {
    const headers = await this.getHeaders();
    const options = {
      method: 'GET',
      headers: headers,
    };
    return await fetch(url, options);
  }
  async sendPostRequest(url: string, payload: any): Promise<any> {
    const headers = await this.getHeaders();
    const options = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    };
    return await fetch(url, options);
  }
}

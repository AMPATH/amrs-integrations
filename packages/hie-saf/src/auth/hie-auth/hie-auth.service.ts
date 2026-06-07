import { Injectable } from '@nestjs/common';
import { TokenApiResponse } from '../types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HieAuthService {
  private token!: string;
  private tokenExpiry!: number;

  constructor(private configService: ConfigService) {}
  async getToken(): Promise<string> {
    if (!this.token || this.isTokenExpired()) {
      await this.fetchToken();
    }
    return this.token;
  }
  private async fetchToken(): Promise<void | Error> {
    const authUrl = this.configService.get<string>('HIE_AUTH_URL') ?? '';
    const clientId = this.configService.get<string>('HIE_CLIENT_ID') ?? '';
    const clientSecret =
      this.configService.get<string>('HIE_CLIENT_SECRET') ?? '';
    const grantType = this.configService.get<string>('HIE_GRANT_TYPE') ?? '';
    if (!clientId || !clientSecret || !grantType) {
      throw new Error('Missing Credentials');
    }
    const encodedParams = new URLSearchParams();
    encodedParams.set('client_id', clientId);
    encodedParams.set('client_secret', clientSecret);
    encodedParams.set('grant_type', grantType);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: encodedParams,
    };

    try {
      const resp = await fetch(authUrl, options);
      const data = (await resp.json()) as TokenApiResponse;
      this.token = data.access_token;
      this.setTokenExpiry(data.expires_in);
    } catch (e) {
      console.log('ERROR', e);
    }
  }
  private setToken(token: string) {
    this.token = token;
  }
  private setTokenExpiry(expiresInMs: number) {
    this.tokenExpiry = this.getTokenExpiryTime(expiresInMs);
  }
  private getTokenExpiry() {
    return this.tokenExpiry;
  }
  private getTokenExpiryTime(expiresInMs: number): number {
    const now = new Date();
    const expiry = now.setSeconds(now.getSeconds() + expiresInMs);
    return expiry;
  }
  private isTokenExpired(): boolean {
    const now = new Date();
    const timeInS = now.setSeconds(now.getSeconds());
    return timeInS > this.getTokenExpiry();
  }
}

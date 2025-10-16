import { cache } from "../../utils/cache.util";
import { logger } from "../../utils/logger";
import axios from "axios";
import config from "../../config/env";
import {
  FacilityCredentials,
  HieMappingService,
} from "../amrs/hie-mapping-service";

const TOKEN_CACHE_PREFIX = "hie_access_token";
const TOKEN_TTL = 15; // 15 seconds
const CREDENTIALS_CACHE_PREFIX = "facility_credentials";
const CREDENTIALS_TTL = 30 * 60;

interface TokenRequestQueue {
  resolve: (token: string) => void;
  reject: (error: any) => void;
}

export class TokenService {
  private hieMappingService: HieMappingService;
  private refreshQueues: Map<string, TokenRequestQueue[]> = new Map();
  private refreshingFlags: Map<string, boolean> = new Map();

  constructor() {
    this.hieMappingService = new HieMappingService();
  }

  private getTokenCacheKey(facilityCode: string): string {
    return `${TOKEN_CACHE_PREFIX}_${facilityCode}`;
  }

  private getCredentialsCacheKey(facilityCode: string): string {
    return `${CREDENTIALS_CACHE_PREFIX}_${facilityCode}`;
  }

  async getAccessToken(locationUuid: string): Promise<string> {
    // get facility code from location uuid
    const facilityCode = await this.hieMappingService.getFacilityCodeUsingLocationUuid(
      locationUuid
    );
    console.log({ facilityCode });
    if (!facilityCode) {
      throw new Error(`Facility code for location ${locationUuid} not found`);
    }
    const cacheKey = this.getTokenCacheKey(facilityCode);

    const cachedToken = cache.get<string>(cacheKey);
    if (cachedToken) {
      logger.debug(`Using cached token for facility: ${facilityCode}`);
      return cachedToken;
    }

    if (this.refreshingFlags.get(facilityCode)) {
      return new Promise((resolve, reject) => {
        const queue = this.refreshQueues.get(facilityCode) || [];
        queue.push({ resolve, reject });
        this.refreshQueues.set(facilityCode, queue);
      });
    }

    this.refreshingFlags.set(facilityCode, true);

    try {
      const credentials = await this.getCachedFacilityCredentials(facilityCode);
      if (!credentials) {
        throw new Error(
          `No active credentials found for facility: ${facilityCode}`
        );
      }

      const token = await this.fetchNewToken(credentials);

      cache.set(cacheKey, token, TOKEN_TTL);

      const queue = this.refreshQueues.get(facilityCode) || [];
      queue.forEach(({ resolve }) => resolve(token));

      this.refreshQueues.delete(facilityCode);
      this.refreshingFlags.set(facilityCode, false);

      logger.info(`Successfully obtained token for facility: ${facilityCode}`);
      return token;
    } catch (error: any) {
      const queue = this.refreshQueues.get(facilityCode) || [];
      queue.forEach(({ reject }) => reject(error));

      this.refreshQueues.delete(facilityCode);
      this.refreshingFlags.set(facilityCode, false);

      logger.error(
        `HIE authentication failed for facility ${facilityCode}: ${error.message}`
      );
      throw new Error(
        `HIE authentication failed for facility ${facilityCode}: ${
          error.response?.data || error.message
        }`
      );
    }
  }

  private async getCachedFacilityCredentials(
    locationUuid: string
  ): Promise<FacilityCredentials | null> {
    const cacheKey = this.getCredentialsCacheKey(locationUuid);

    const cached = cache.get<FacilityCredentials>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from HieMappingService
    const credentials = await this.hieMappingService.getFacilityCredentials(
      locationUuid
    );
    if (credentials) {
      cache.set(cacheKey, credentials, CREDENTIALS_TTL);
    }

    return credentials;
  }

  private async fetchNewToken(
    credentials: FacilityCredentials
  ): Promise<string> {
    const authCredentials = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");

    const response = await axios.get(
      `${config.HIE.BASE_URL}${config.HIE.AUTH_URL}`,
      {
        params: {
          key: credentials.consumer_key,
        },
        headers: {
          Authorization: `Basic ${authCredentials}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    return response.data;
  }

  clearToken(facilityCode: string): void {
    const cacheKey = this.getTokenCacheKey(facilityCode);
    cache.del(cacheKey);
    logger.debug(`Cleared token for facility: ${facilityCode}`);
  }

  clearCredentialsCache(facilityCode: string): void {
    const cacheKey = this.getCredentialsCacheKey(facilityCode);
    cache.del(cacheKey);
    logger.debug(`Cleared credentials cache for facility: ${facilityCode}`);
  }
}

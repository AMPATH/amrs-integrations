import { cache } from "../../utils/cache.util";
import { logger } from "../../utils/logger";
import axios from "axios";
import config from "../../config/env";
import { FacilityCredentials, HieMappingService } from "../amrs/hie-mapping-service";

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

  private getTokenCacheKey(locationUuid: string): string {
    return `${TOKEN_CACHE_PREFIX}_${locationUuid}`;
  }

  private getCredentialsCacheKey(locationUuid: string): string {
    return `${CREDENTIALS_CACHE_PREFIX}_${locationUuid}`;
  }

  async getAccessToken(locationUuid: string): Promise<string> {
    const cacheKey = this.getTokenCacheKey(locationUuid);

    const cachedToken = cache.get<string>(cacheKey);
    if (cachedToken) {
      logger.debug(`Using cached token for facility: ${locationUuid}`);
      return cachedToken;
    }

    if (this.refreshingFlags.get(locationUuid)) {
      return new Promise((resolve, reject) => {
        const queue = this.refreshQueues.get(locationUuid) || [];
        queue.push({ resolve, reject });
        this.refreshQueues.set(locationUuid, queue);
      });
    }

    this.refreshingFlags.set(locationUuid, true);

    try {
      const credentials = await this.getCachedFacilityCredentials(locationUuid);
      if (!credentials) {
        throw new Error(`No active credentials found for facility: ${locationUuid}`);
      }

      const token = await this.fetchNewToken(credentials);

      cache.set(cacheKey, token, TOKEN_TTL);

      const queue = this.refreshQueues.get(locationUuid) || [];
      queue.forEach(({ resolve }) => resolve(token));

      this.refreshQueues.delete(locationUuid);
      this.refreshingFlags.set(locationUuid, false);

      logger.info(`Successfully obtained token for facility: ${locationUuid}`);
      return token;

    } catch (error: any) {
      const queue = this.refreshQueues.get(locationUuid) || [];
      queue.forEach(({ reject }) => reject(error));

      this.refreshQueues.delete(locationUuid);
      this.refreshingFlags.set(locationUuid, false);

      logger.error(`HIE authentication failed for facility ${locationUuid}: ${error.message}`);
      throw new Error(
        `HIE authentication failed for facility ${locationUuid}: ${error.response?.data || error.message
        }`
      );
    }
  }

  private async getCachedFacilityCredentials(locationUuid: string): Promise<FacilityCredentials | null> {
    const cacheKey = this.getCredentialsCacheKey(locationUuid);

    const cached = cache.get<FacilityCredentials>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from HieMappingService
    const credentials = await this.hieMappingService.getFacilityCredentials(locationUuid);
    if (credentials) {
      cache.set(cacheKey, credentials, CREDENTIALS_TTL);
    }

    return credentials;
  }

  private async fetchNewToken(credentials: FacilityCredentials): Promise<string> {
    const authCredentials = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");

    const response = await axios.get(
      `${config.HIE.BASE_URL}${config.HIE.AUTH_URL}`,
      {
        params: {
          key: credentials.consumer_key
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

  clearToken(locationUuid: string): void {
    const cacheKey = this.getTokenCacheKey(locationUuid);
    cache.del(cacheKey);
    logger.debug(`Cleared token for facility: ${locationUuid}`);
  }

  clearCredentialsCache(locationUuid: string): void {
    const cacheKey = this.getCredentialsCacheKey(locationUuid);
    cache.del(cacheKey);
    logger.debug(`Cleared credentials cache for facility: ${locationUuid}`);
  }
}
import axios from "axios";
import config from "../../config/env";
import { cache } from "../../utils/cache.util";
import { logger } from "../../utils/logger";

const TOKEN_CACHE_KEY = "hie_access_token";

export class TokenService {
  private isRefreshing = false;
  private refreshQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

  async getAccessToken(): Promise<string> {
    const cachedToken = cache.get<string>(TOKEN_CACHE_KEY);
    if (cachedToken) {
      console.log(`Using cached token: ${cachedToken}`);
      return cachedToken;
    }

    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;
    
    try {
      const credentials = Buffer.from(
        `${config.HIE.USERNAME}:${config.HIE.PASSWORD}`
      ).toString("base64");

      const response = await axios.get(
        `${config.HIE.BASE_URL}${config.HIE.AUTH_URL}`,
        {
          params: {
            key: config.HIE.CONSUMER_KEY
          },
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }
      );

      const token = response.data;
      
      cache.set(TOKEN_CACHE_KEY, token, 15);

      this.refreshQueue.forEach(({ resolve }) => resolve(token));
      this.refreshQueue = [];
      this.isRefreshing = false;

      return token;
    } catch (error: any) {
      this.refreshQueue.forEach(({ reject }) => reject(error));
      this.refreshQueue = [];
      this.isRefreshing = false;

      logger.error(`HIE authentication failed: ${error.message}`);
      throw new Error(
        `HIE authentication failed: ${
          error.response?.data || error.message
        }`
      );
    }
  }

  clearToken(): void {
    cache.del(TOKEN_CACHE_KEY);
  }
}
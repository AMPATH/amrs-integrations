import axios from "axios";
import config from "../../config/env";
import { cache } from "../../utils/cache.util";

const TOKEN_CACHE_KEY = "hie_access_token";

export class TokenService {
  async getAccessToken(): Promise<string> {
    // Check cache first
    const cachedToken = cache.get<string>(TOKEN_CACHE_KEY);
    if (cachedToken) return cachedToken;

    // Fetch new token
    const credentials = Buffer.from(
      `${config.HIE.CLIENT_ID}:${config.HIE.CLIENT_SECRET}`
    ).toString("base64");

    try {
      const response = await axios.post(
        config.HIE.AUTH_URL,
        new URLSearchParams({ grant_type: "client_credentials" }),
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const token = response.data.access_token;
      const expiresIn = response.data.expires_in;

      // Cache token with 5-minute buffer
      cache.set(TOKEN_CACHE_KEY, token, expiresIn - 300);

      return token;
    } catch (error: any) {
      // console.error('HIE Authentication Error:', error);
      throw new Error(
        `HIE authentication failed: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }
}

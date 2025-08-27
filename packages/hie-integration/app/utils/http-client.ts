import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";
import { TokenService } from "../services/auth/token.service";
import { logger } from "./logger";
import config from "../config/env";

export class HieHttpClient {
  private axiosInstance: AxiosInstance;
  private tokenService: TokenService;

  constructor() {
    this.tokenService = new TokenService();
    this.axiosInstance = axios.create();

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const token = await this.tokenService.getAccessToken();
          config.headers.Authorization = `Bearer ${token}`;
          config.headers["Content-Type"] = "application/json";
          return config;
        } catch (error) {
          return Promise.reject(error);
        }
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          this.tokenService.clearToken();

          try {
            const token = await this.tokenService.getAccessToken();
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return this.axiosInstance(originalRequest);
          } catch (retryError) {
            return Promise.reject(retryError);
          }
        }

        // Handle other errors
        if (error.response) {
          if (error.response.status >= 400) {
            logger.error(
              `HIE API Error: ${error.response.status} - ${JSON.stringify(
                error.response.data
              )}`
            );
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, {
      baseURL: config.HIE.BASE_URL,
      params,
      timeout: 10000, // 10 second timeout for API requests
    });
  }

  async post<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, {
      baseURL: config.HIE.BASE_URL,
      timeout: 10000, // 10 second timeout for API requests
    });
  }
}

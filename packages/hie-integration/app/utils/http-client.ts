import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";
import { TokenService } from "../services/auth/token.service";
import { logger } from "./logger";

export class HieHttpClient {
  private axiosInstance: AxiosInstance;
  private tokenService: TokenService;
  private baseURL: string;
  private facilityUuid: string;

  constructor(baseURL: string, facilityUuid: string) {
    logger.debug('HieHttpClient initialized', { facilityUuid, baseURL });
    this.tokenService = new TokenService();
    this.axiosInstance = axios.create();
    this.baseURL = baseURL;
    this.facilityUuid = facilityUuid;

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const token = await this.tokenService.getAccessToken(
            this.facilityUuid
          );
          config.headers.Authorization = `Bearer ${token}`;
          config.headers["Content-Type"] = "application/json";
          return config;
        } catch (error) {
          logger.error(
            `Failed to get token for facility ${this.facilityUuid}:`,
            error
          );
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
          this.tokenService.clearToken(this.facilityUuid);

          try {
            const token = await this.tokenService.getAccessToken(
              this.facilityUuid
            );
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return this.axiosInstance(originalRequest);
          } catch (retryError) {
            logger.error(
              `Token refresh failed for facility ${this.facilityUuid}:`,
              retryError
            );
            return Promise.reject(retryError);
          }
        }

        if (error.response) {
          if (error.response.status >= 400) {
            logger.error(
              `HIE API Error for facility ${this.facilityUuid}: ${
                error.response.status
              } - ${JSON.stringify(error.response.data)}`
            );
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, {
      baseURL: this.baseURL,
      params,
      timeout: 10000,
    });
  }

  async post<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, {
      baseURL: this.baseURL,
      timeout: 10000,
    });
  }

  async put<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, {
      baseURL: this.baseURL,
      timeout: 10000,
    });
  }

  setFacility(facilityUuid: string): void {
    this.facilityUuid = facilityUuid;
  }

  getCurrentFacility(): string {
    return this.facilityUuid;
  }

  getBaseURL(): string {
    return this.baseURL;
  }
}

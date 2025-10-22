import axios, { AxiosInstance, AxiosResponse } from "axios";

export class BasicHttpClient {
  private axiosInstance: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string, username?: string, password?: string) {
    const config: any = {
      baseURL,
      headers: { "Content-Type": "application/json" },
    };
    
    // Only add auth if username and password are provided
    if (username && password) {
      config.auth = { username, password };
    }
    
    this.axiosInstance = axios.create(config);
    this.baseURL = baseURL;
  }

  get<T>(url: string, params?: any) {
    return this.axiosInstance.get<T>(url, { params });
  }

  post<T>(url: string, data?: any) {
    return this.axiosInstance.post<T>(url, data);
  }
  
  getBaseURL(): string {
    return this.baseURL;
  }
}

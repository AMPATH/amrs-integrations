import axios, { AxiosInstance, AxiosResponse } from "axios";

export class BasicHttpClient {
  private axiosInstance: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string, username: string, password: string) {
    this.axiosInstance = axios.create({
      baseURL,
      auth: { username, password },
      headers: { "Content-Type": "application/json" },
    });
    this.baseURL = baseURL;
  }

  get<T>(url: string, params?: any) {
    return this.axiosInstance.get<T>(url, { params });
  }

  post<T>(url: string, data?: any) {
    return this.axiosInstance.post<T>(url, data);
  }
}

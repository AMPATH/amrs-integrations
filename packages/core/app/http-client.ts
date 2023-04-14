import axios, { AxiosInstance } from "axios";
import config from "@amrs-integrations/core";

export default abstract class HttpClient {
  protected readonly axios: AxiosInstance;

  constructor(baseURL: any, requestType: any) {
    const adtProtocol = config.adt.https ? "https" : "http";
    const adtBaseUrl = adtProtocol + "://" + config.adt.host;
    const amrsUrl = config.amrsUrl;
    if (requestType === "amrs") {
      baseURL = amrsUrl;
    } else if (requestType === "adt") {
      baseURL = adtBaseUrl;
    }
    this.axios = axios.create({
      baseURL: baseURL,
    });
  }

  protected handleError = (error: any[]): Promise<string> =>
    Promise.reject(error);
}

import dotenv from "dotenv";

dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export default {
  SERVER: {
    PORT: parseInt(getEnv("PORT", "3000")),
    ENV: getEnv("NODE_ENV", "development"),
  },
  HIE: {
    OPENHIM_BASE_URL: getEnv("HIE_OPENHIM_BASE_URL", "localhost:5001"),
    BASE_URL: getEnv("HIE_BASE_URL", "https://uat.dha.go.ke"),
    AUTH_URL: getEnv("HIE_AUTH_URL", "/v1/hie-auth"),
    CLIENT_REGISTRY_URL: getEnv(
      "HIE_CLIENT_REGISTRY_URL",
      "/v3/client-registry/fetch-client"
    ),
    SHR_FETCH_URL: getEnv("HIE_SHR_FETCH_URL", "/v1/shr/summary"),
    SHR_POST_BUNDLE_URL: getEnv(
      "HIE_SHR_POST_BUNDLE_URL",
      "/v1/shr-med/bundle"
    ),
    AGENT: process.env.HIE_AGENT,
    PRACTITIONER_REGISTRY_URL: getEnv("HIE_HWR_URL", "/v1/practitioner-search"),
    FACILITY_SEARCH_URL: getEnv(
      "HIE_FACILITY_SEARCH_URL",
      "/v2/facility-search"
    ),
    CONSUMER_KEY: getEnv("HIE_CONSUMER_KEY"),
    USERNAME: getEnv("HIE_USERNAME"),
    PASSWORD: getEnv("HIE_PASSWORD"),
  },
  AMRS_FHIR: {
    BASE_URL: getEnv(
      "AMRS_FHIR_BASE_URL",
      "https://ngx.ampath.or.ke/amrs/ws/fhir2/R4"
    ),
  },
  AMRS: {
    BASE_URL: getEnv(
      "AMRS_BASE_URL",
      "https://ngx.ampath.or.ke/amrs/ws/fhir2/R4"
    ),
    USERNAME: getEnv("AMRS_USERNAME"),
    PASSWORD: getEnv("AMRS_PASSWORD"),
  },
  KAFKA: {
    BROKERS: getEnv("KAFKA_BROKERS", "localhost:9092").split(","),
    CLIENT_ID: getEnv("KAFKA_CLIENT_ID", "  "),
    GROUP_ID: getEnv("KAFKA_GROUP_ID", "hie-integration-group"),
    TOPICS: {
      FHIR_EVENTS: getEnv("KAFKA_FHIR_EVENTS_TOPIC", "fhir-events"),
    },
  },
};

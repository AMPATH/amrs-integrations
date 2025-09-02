import dotenv from 'dotenv';

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
    PORT:  parseInt(getEnv('PORT', '3000')),
    ENV: getEnv('NODE_ENV', 'development')
  },
  HIE: {
    BASE_URL: getEnv('HIE_BASE_URL', 'https://uat.dha.go.ke'),
    AUTH_URL: getEnv('HIE_AUTH_URL', '/v1/hie-auth'),
    CLIENT_REGISTRY_URL: getEnv('HIE_CLIENT_REGISTRY_URL', '/v3/client-registry/fetch-client'),
    AGENT: process.env.HIE_AGENT,
    PRACTITIONER_REGISTRY_URL: getEnv('HIE_HWR_URL', '/v1/practitioner-search'),
    FACILITY_SEARCH_URL: getEnv('HIE_FACILITY_SEARCH_URL', '/v1/facility-search'),
    CONSUMER_KEY: getEnv('HIE_CONSUMER_KEY'),
    USERNAME: getEnv('HIE_USERNAME'),
    PASSWORD: getEnv('HIE_PASSWORD')
  },
  AMRS: {
    BASE_URL: getEnv('AMRS_BASE_URL'),
    USERNAME: getEnv('AMRS_USERNAME'),
    PASSWORD: getEnv('AMRS_PASSWORD'),
    NATIONAL_ID_TYPE_UUID: getEnv('AMRS_NATIONAL_ID_TYPE_UUID'),
    SHA_ID_TYPE_UUID: getEnv('AMRS_SHA_ID_TYPE_UUID'),
    HOUSEHOLD_ID_TYPE_UUID: getEnv('AMRS_HOUSEHOLD_ID_TYPE_UUID')
  }
};
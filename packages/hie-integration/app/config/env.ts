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
  HIE: {
    AUTH_URL: getEnv('HIE_AUTH_URL', 'https://apistg.safaricom.co.ke/oauth2/v1/generate?grant_type=client_credentials'),
    CLIENT_ID: getEnv('HIE_CLIENT_ID'),
    CLIENT_SECRET: getEnv('HIE_CLIENT_SECRET'),
    CLIENT_REGISTRY_URL: getEnv('HIE_CLIENT_REGISTRY_URL', 'https://apistg.safaricom.co.ke/hie/v1/Patient'),
    HWR_URL: getEnv('HIE_HWR_URL', 'https://apistg.safaricom.co.ke/v2/fhir/Practitioner')
  },
  AMRS: {
    BASE_URL: getEnv('AMRS_BASE_URL'),
    USERNAME: getEnv('AMRS_USERNAME'),
    PASSWORD: getEnv('AMRS_PASSWORD'),
    NATIONAL_ID_TYPE_UUID: getEnv('AMRS_NATIONAL_ID_TYPE_UUID'),
    SHA_ID_TYPE_UUID: getEnv('AMRS_SHA_ID_TYPE_UUID'),
    HOUSEHOLD_ID_TYPE_UUID: getEnv('AMRS_HOUSEHOLD_ID_TYPE_UUID')
  },
  SERVER: {
    PORT: parseInt(getEnv('PORT', '3000')),
    ENV: getEnv('NODE_ENV', 'development')
  }
};
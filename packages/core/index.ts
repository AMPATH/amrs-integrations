import dotenv from "dotenv";
import HTTPInterceptor from "./app/http-interceptor";
import ConnectionManager from "./app/mysql";
const envFound = dotenv.config();
if (envFound.error) {
  // This error should crash whole process

  throw new Error("⚠️  Couldn't find .env file  ⚠️");
}
export default {
  devPort:process.env.devPort,
  databaseURL: process.env.mysqlHost,
  user: process.env.user,
  password: process.env.password,
  database: process.env.database,
  port: process.env.port,
  amrsUrl: process.env.amrsUrl,
  amrsUsername: process.env.amrsUsername,
  amrsPassword: process.env.amrsPassword,
  connectionLimit: process.env.connectionLimit,
  server: process.env.devServer,
  accessToken: process.env.accessToken,
  slackWebHook: process.env.slackWebHook,
  adt: {
    username: process.env.amrsUsername,
    password: process.env.amrsPassword,
    https: false,
    host: process.env.adtHost,
    port: process.env.adtPort
  },
  amrsProd:{
    databaseURL: process.env.prodDbURL,
    user: process.env.user,
    password: process.env.password,
    database: process.env.prodDb,
    port: process.env.prodDbPort,
    connectionLimit: process.env.connectionLimit
  },
  amrsSlave:{
    databaseURL: process.env.mysqlHost,
    user: process.env.user,
    password: process.env.password,
    database: process.env.database,
    port: process.env.port,
    connectionLimit: process.env.connectionLimit
  },
  prodDbURL: process.env.prodDbURL,
  prodDbPort: process.env.prodDbPort,
  prodDb: process.env.prodDb,
  HTTPInterceptor:HTTPInterceptor,
  ConnectionManager:ConnectionManager,
  sms: {
    apiKey:process.env.advantaApiKey,
    url:process.env.advantaURL,
    partnerID:process.env.advantaPartnerID,
    shortCode:process.env.advantaShortCode
  },
  redis:{
    namespace: 'amrs-integrations',
    redis: {
        client: 'redis',
        options: {
            host: process.env.redisHost,
            port: 6379,
            connect_timeout: 3600000,
        },
    },
    logger: {
        enabled: true,
        options: {
            level: 'debug',
            /*
            streams: [
                {
                    path: path.normalize(`${__dirname}/../logs/redis-smq.log`)
                },
            ],
            */
        },
    },
    monitor: {
        enabled: true,
        host: '0.0.0.0',
        port: 3333,
    },
    message: {
        consumeTimeout:600000,
        retryThreshold: 10,
        retryDelay: 60000,
        ttl: 120000,
    },
    storeMessages: false,
},
dhp:{
  clientId:process.env.dhpClientID,
  clientSecret:process.env.dhpClientSecret,
  grantType:process.env.dhpGrantType,
  scope:process.env.dhpScope,
  url:process.env.dhpURL,
  authUrl:process.env.dhpTokenURL
}
};


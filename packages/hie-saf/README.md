## HIE Integration (Safaricom)
This project is for HIE intergration using Safaricom provided API's.


## Requirements

1. NodeJs v24+
2. Yarn v1.22+
3. NestJs v11.0.21
4. Mariadb

## Set up

```sh
yarn
```

## Set up
Copy `.env.example` to `.env` at the package root and fill in values.

```sh
cp .env.example .env
```

### Local development — HIE endpoint override

Preauth and claims traffic has two hops:

1. **ESM app** → this service via OpenMRS config `hieBaseUrl` (e.g. `http://localhost:3000` when running `yarn start:dev` here).
2. **This service** → DHA eClaims via `HIE_CLIAMS_BASE_URL` (UAT middleware or a local mock).

Do not hardcode localhost into production ESM config defaults. Override only in your local spa/config:

```json
{
  "@ampath/esm-dha-workflow-app": {
    "hieBaseUrl": "http://localhost:3000"
  }
}
```

Keep `HIE_CLIAMS_BASE_URL` in `.env` pointed at DHA UAT (or your mock), for example:

```env
HIE_CLIAMS_BASE_URL=https://ilm-dev.dha.go.ke/uat-middleware
```

Required env keys (see `.env.example`):

```env
HIE_AUTH_URL=<HIE_AUTH_URL>
HIE_CLIENT_ID=<HIE_CLIENT_ID>
HIE_CLIENT_SECRET=<HIE_CLIENT_SECRET>
HIE_GRANT_TYPE=<HIE_GRANT_TYPE>
HIE_BASE_URL=<HIE_BASE_URL>
HIE_CLIAMS_BASE_URL=<HIE_CLIAMS_BASE_URL>
AMRS_BASE_URL=<AMRS_BASE_URL>

DATABASE_HOST=<DATABASE_HOST>
DATABASE_PORT=<DATABASE_PORT>
DATABASE_USER=<DATABASE_USER>
DATABASE_PASSWORD=<DATABASE_PASSWORD>
DATABASE_NAME=<DATABASE_NAME>
DATABASE_POOL_SIZE=<DATABASE_POOL_SIZE>

APP_ENV=<APP_ENV>
BASIC_AUTH=<BASIC_AUTH>
```

To run the dev server for your app, use:

```sh
yarn run start:dev
```


To create production bundle

```sh
yarn run build
```

## Docker

To create a docker image

```sh
docker build --platform linux/amd64 -f Dockerfile -t ampathke/hie-saf-integration:<version> .

```

To deploy the image

```sh
sudo docker run -d --name <CONTAINER_NAME> -p <HOST_PORT>:3000 --env-file=<ENV_PATH> ampathke/hie-saf-integration:<version>
```
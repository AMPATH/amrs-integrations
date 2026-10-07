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
HIE_SHR_BASE_URL=<HIE_SHR_BASE_URL>
AMRS_BASE_URL=<AMRS_BASE_URL>

DATABASE_HOST=<DATABASE_HOST>
DATABASE_PORT=<DATABASE_PORT>
DATABASE_USER=<DATABASE_USER>
DATABASE_PASSWORD=<DATABASE_PASSWORD>
DATABASE_NAME=<DATABASE_NAME>
DATABASE_POOL_SIZE=<DATABASE_POOL_SIZE>

# Read-only AMRS OpenMRS connection for GET /case-summary — prefer a read replica.
AMRS_DATABASE_HOST=<AMRS_DATABASE_HOST>
AMRS_DATABASE_PORT=<AMRS_DATABASE_PORT>
AMRS_DATABASE_USER=<AMRS_DATABASE_USER>
AMRS_DATABASE_PASSWORD=<AMRS_DATABASE_PASSWORD>
AMRS_DATABASE_NAME=<AMRS_DATABASE_NAME>
AMRS_DATABASE_POOL_SIZE=<AMRS_DATABASE_POOL_SIZE>

APP_ENV=<APP_ENV>
BASIC_AUTH=<BASIC_AUTH>
SYNC_CLAIMS= true | false
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

### Image builds (CI)

Merges to `main` build and push the image to Docker Hub automatically via
[.github/workflows/hie-saf-docker.yml](../../.github/workflows/hie-saf-docker.yml):

- `ampathke/hie-saf-integration:latest` — tracks `main`
- `ampathke/hie-saf-integration:sha-<commit>` — pinned to a commit

To cut a release, tag the merge commit and push the tag:

```sh
git tag v4.7 && git push origin v4.7
```

That publishes `ampathke/hie-saf-integration:v4.7` (a `sha-` tag is pushed alongside it). You can also run the workflow manually from the Actions tab and pass an extra version tag (e.g. `4.7` publishes `v4.7`).

The workflow requires the repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker Hub access token).

### Server deployment (docker compose)

Copy `docker-compose.yml` from this folder to the server directory that holds `.env.kibana`. One-time migration off the old manually-created container:

```sh
sudo docker container stop hie-saf-integration-kibana
sudo docker container rm hie-saf-integration-kibana
```

From then on, deploying a version is two commands:

```sh
# pin the image version in .env (compose interpolation file, separate from .env.kibana)
echo 'HIE_SAF_IMAGE_TAG=v4.7' > .env

sudo docker compose pull
sudo docker compose up -d
```

`docker compose up -d` recreates the container whenever the pinned image changed — no manual stop/rm needed. To roll back, point `HIE_SAF_IMAGE_TAG` at an older tag and re-run `up -d`.

### Local build (fallback)

```sh
docker build --platform linux/amd64 -f Dockerfile -t ampathke/hie-saf-integration:<version> .
```
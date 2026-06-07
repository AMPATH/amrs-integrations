## HIE Integration (Safaricom)
This project is for HIE intergration using Safaricom provided API's.


## Requirements

1. NodeJs v24+
2. Yarn v1.22+
3. NestJs v11.0.21

## Set up

```sh
yarn
```

## Set up
Create a .env file at the root of the project with the following variables

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
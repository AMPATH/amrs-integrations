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
```

To run the dev server for your app, use:

```sh
yarn run start:dev
```


To create production bundle

```sh
yarn run build
```
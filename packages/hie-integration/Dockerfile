FROM node:16-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++ bash

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY packages/hie-integration ./packages/hie-integration

WORKDIR /app/packages/hie-integration
RUN yarn install --frozen-lockfile


RUN yarn build

FROM node:16-alpine AS runtime

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/hie-integration/dist ./dist
COPY --from=build /app/packages/hie-integration/package.json ./package.json
COPY --from=build /app/packages/hie-integration/app/config ./dist/config

EXPOSE 9000

CMD ["node", "dist/index.js"]

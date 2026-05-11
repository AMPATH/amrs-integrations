FROM node:alpine AS development

WORKDIR /usr/src/app

COPY package.json ./

RUN npm i -g @nestjs/cli

RUN npm install


COPY . .

RUN npm run build


FROM node:alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install --prod

RUN pwd

COPY --from=development /usr/src/app/dist ./dist

EXPOSE 3000

CMD [ "node","dist/main" ]
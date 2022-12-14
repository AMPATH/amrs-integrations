FROM ampathke/amrs-integrations-base
WORKDIR /packages/patient-registry
COPY  . ./

WORKDIR /packages/patient-registry
RUN touch token.txt
RUN npm i --production
RUN tsc -v
RUN npm run build

CMD ["node", "/packages/patient-registry/dist/app.js"]

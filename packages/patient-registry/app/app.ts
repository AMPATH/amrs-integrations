import { Server } from "@hapi/hapi";
import { apiRoutes } from "./api/routes";
import config from "@amrs-integrations/core";
import { setConfiguration } from "redis-smq";
import PatientService from "./services/patient.service";
import { processBatchUpdates } from "./models/batch-update";
let redisConfig: any = config.redis;
setConfiguration(redisConfig);
const init = async () => {
  const server = new Server({
    port: config.devPort,
    host: config.server,
  });
  const patientService = new PatientService();
  server.route(apiRoutes);
  await server.start();
  console.log("Server running on %s", server.info.uri);
  await patientService.retryQueuedClients();
  // await processBatchUpdates(); CONSUMER FOR BATCH UPDATE
};

process.on("unhandledRejection", (err) => {
  console.log(err);
  process.exit(1);
});

init();

import { Server } from "@hapi/hapi";
import { apiRoutes } from "./api/routes";
import config from "@amrs-integrations/core";

const init = async () => {
  const server = new Server({
    port: config.devPort,
    host: config.server
  });
  server.route(apiRoutes);
  await server.start();
  console.log("Server running on %s", server.info.uri);
};

process.on("unhandledRejection", (err) => {
  console.log(err);
  process.exit(1);
});

init();

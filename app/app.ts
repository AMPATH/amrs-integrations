import "./loaders/events";

//Consume person ids from queue and prepare payload

//publish an search event for all persons in the queue
import { Server } from "@hapi/hapi";
import { adtRoutes } from "./api/adt-routes";
import config from "./config";
const init = async () => {
  const server: Server = new Server({
    port: config.port,
    host: config.server,
  });
  server.route(adtRoutes);
  await server.start();
  console.log("Server running on %s", server.info.uri);
};
process.on("unhandledRejection", (err) => {
  console.log(err);
  process.exit(1);
});
init();

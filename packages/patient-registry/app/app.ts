import { Server } from "@hapi/hapi";
import { apiRoutes } from "./api/routes";

const init = async () => {
  const server = new Server({
    port: 3000,
    host: "localhost",
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

import config from "@amrs-integrations/core";
import { Consumer, Message, Producer } from "redis-smq";
import { getBatchUpdateData } from "./queries";
import { validateToken } from "../helpers/auth";

export async function scheduleBatchUpdate() {
  const toQueue = await getBatchUpdateData();
  console.log("UPDATING CCC FOR", toQueue.length, " CLIENTS");

  let count = 0;
  const producer = new Producer();

  if (toQueue.length > 0) {
    toQueue.forEach((payload: any) => {
      const message = new Message();
      count++;
      message
        .setBody(JSON.stringify(payload))
        .setTTL(3600000)
        .setQueue("batch_update_queue_testi");
      producer.produce(message, (err) => {
        if (err) console.log(err);
        else {
          const msgId = message.getId();
          console.log("Successfully produced. Message ID is ", msgId);
        }
      });
    });
  }
  // if (count == toQueue.length) {
  //   producer.shutdown(process.exit(0));
  // }
}

export async function processBatchUpdates() {
  console.log("STARTED REDIS CONSUMER FOR UPDATING CCC");
  const consumer = new Consumer();

  const messageHandler = async (msg: any, cb: any) => {
    const redisPayload = msg.getBody();
    const accessToken = await validateToken();
    const httpClient = new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      accessToken
    );

    const res = JSON.parse(redisPayload);

    const url = `/search/upi/${res.identifier}`;
    httpClient.axios(url, { method: "get" }).then(async (dhpResponse: any) => {
      if (
        dhpResponse.clientExists &&
        dhpResponse.client.nascopCCCNumber == null
      ) {
        const url = `/${res.identifier}/update-ccc`;
        httpClient.axios
          .put(url, {
            nascopCCCNumber: res.ccc,
          })
          .then((r: any) => {
            console.log("Updated ccc for ", res.identifier);
            cb();
          })
          .catch((e: any) => {
            console.log("Could not assign ccc to ", res.identifier);
          });
      } else {
        cb();
      }
    });
  };

  consumer.consume(
    "batch_update_queue_testi",
    false,
    messageHandler,
    (err, isRunning) => {
      if (err) {
        console.error(err);
      } else {
        console.log(
          `Message handler has been registered. Running status: ${isRunning}`
        );
      }
    }
  );

  consumer.run();
}
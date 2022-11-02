const axios = require("axios");
import config from "@amrs-integrations/core";

export default class SlackService {
  constructor() { }
  public async postErrorMessage(errors: any) {
    return new Promise((resolve, reject) => {
      if (errors === "" || errors === null) {
        reject("Cannot send Empty Message");
      }
      const payload = { text: JSON.stringify(errors) };
      const options = {
        method: "post",
        url: config.slackWebHook,
        headers: {
          "Content-Type": "application/json",
        },
        data: payload,
      };

      axios(options)
        .then((response: any) => {
          console.log("Error occurred for patient ", response.options.data);
          resolve(response.data);
        })
        .catch((error: any) => {
          console.error(error);
          reject(error);
        });
    });
  }
}

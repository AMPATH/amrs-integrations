const axios = require("axios");

export default class SlackService {
  constructor() {}
  public async postErrorMessage(errors: any) {
    return new Promise((resolve, reject) => {
      if (errors === "" || errors === null) {
        reject("Cannot send Empty Message");
      }
      const payload = { text: JSON.stringify(errors) };
      const config = {
        method: "post",
        url:
          "",
        headers: {
          "Content-Type": "application/json",
        },
        data: payload,
      };

      axios(config)
        .then((response: any) => {
          console.log("Error occurred for patient ", response.config.data);
          resolve(response.data);
        })
        .catch((error: any) => {
          console.error(error);
          reject(error);
        });
    });
  }
}

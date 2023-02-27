import qs from "qs";
import * as fs from "fs";

import config from "@amrs-integrations/core";

export default async function getAccessToken() {
  // Validate token in file
  const data = qs.stringify({
    client_id: config.dhp.clientId,
    client_secret: config.dhp.clientSecret,
    grant_type: config.dhp.grantType,
    scope: config.dhp.scope,
  });
  console.log(data);
  const httpClient = new config.HTTPInterceptor(
    config.dhp.authUrl || "",
    "",
    "",
    "oauth2"
  );
  let response = await httpClient.axios("/connect/token", {
    method: "post",
    data: data,
  });
  // write response to file
  fs.writeFile(
    config.accessToken || "token.txt",
    response.access_token,
    (err: any) => {
      if (err) {
        console.error(err);
      }
    }
  );
  return response;
}

export async function validateToken() {
  let isValid = false;
  try {
    const data = fs.readFileSync(config.accessToken || "token.txt", "utf8");
    if (data !== "") {
      let expirationTime = parseJwt(data).exp;
      expirationTime < (new Date().getTime() + 1) / 1000
        ? (isValid = false)
        : (isValid = true);
      if (isValid) {
        console.info("Valid Accesstoken: ", data);
        return data;
      } else {
        let response = await getAccessToken();
        console.log("Getting new accesstoken", response);
        return response.access_token;
      }
    } else {
      let response = await getAccessToken();
      console.log("Getting new accesstoken", response);
      return response.access_token;
    }
  } catch (err) {
    console.error(err);
  }
}

const parseJwt = (token: string) => {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("ascii"));
}

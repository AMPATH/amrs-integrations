import qs from "qs";
import * as fs from "fs";
import config from "@amrs-integrations/core";
import HttpClient from "@amrs-integrations/core/dist/app/http-client";
export default async function getAccessToken() {
  // Validate token in file
  var data = qs.stringify({
    client_id: config.dhp.clientId,
    client_secret: config.dhp.clientSecret,
    grant_type: config.dhp.grantType,
    scope: config.dhp.scope,
  });
  console.log(data);
  let httpClient = new config.HTTPInterceptor(
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
export async function client(implementation: string) {
  let httpClient: any;
  if (implementation === "dhp") {
    let access_token = await validateToken();
    new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      access_token
    );
  }else{
    httpClient=new config.HTTPInterceptor(
      config.amrsUrl || "",
      config.amrsUsername || "",
      config.amrsPassword || "",
      "amrs"
    );
  }
  return httpClient;
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
        console.log("Fetch old accesstoken", data);
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
function parseJwt(token: string) {
  var base64Url = token.split(".")[1];
  var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const buff = new Buffer(base64, "base64");
  const payloadinit = buff.toString("ascii");
  const payload = JSON.parse(payloadinit);
  return payload;
}

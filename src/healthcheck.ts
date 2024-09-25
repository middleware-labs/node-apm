import axios from "axios";
import { structuredLog } from "./utils";

const HEALTHCHECK_FAILED_MESSAGE = `MW Agent Healthcheck is failing ... This could be due to incorrect value of MW_AGENT_SERVICE
Ignore the warning if you are using MW Agent older than 1.7.7 (You can confirm by running mw-agent version`;

export const performHealthCheck = (host: string): Promise<void> => {
  let endpoint = `${host}:13133/health`;
  if (!endpoint.startsWith("http")) {
    endpoint = "http://" + endpoint;
  }
  return axios
    .get(endpoint)
    .then((response) => {
      if (response.status === 200) {
        structuredLog("INFO", "Health check to MW Agent passed", {
          status: response.status,
        });
      } else {
        structuredLog("WARN", HEALTHCHECK_FAILED_MESSAGE, {
          status: response.status,
        });
      }
    })
    .catch((error) => {
      structuredLog("WARN", HEALTHCHECK_FAILED_MESSAGE);
    });
};

import axios from "axios";
import { Config } from "./config";

// Safely try to require Pyroscope
let Pyroscope: any = null;
try {
  // Synchronous import
  Pyroscope = require("@pyroscope/nodejs");
} catch {
  console.log("Pyroscope profiling is not available");
}

export const init = async (config: Config): Promise<Config> => {
  if (Pyroscope && config.enableProfiling && config.accessToken !== "") {
    try {
      const authUrl = process.env.MW_AUTH_URL || config.mwAuthURL; // Update with the correct auth URL

      const response = await axios.post(authUrl, null, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Bearer " + config.accessToken,
        },
      });

      if (response.status === 200) {
        const data = response.data;

        if (data.success === true) {
          const account = data.data.project_uid;

          if (typeof account === "string") {
            const TenantID = account;

            config.profilingServerUrl = `https://${account}.middleware.io/profiling`;

            const profilingServerUrl =
              process.env.MW_PROFILING_SERVER_URL || config.profilingServerUrl;

            Pyroscope.init({
              serverAddress: profilingServerUrl,
              appName: config.serviceName,
              tenantID: TenantID,
            });

            Pyroscope.start();
          } else {
            console.log("Failed to retrieve TenantID from API response");
          }
        } else {
          console.log(
            "Failed to authenticate with Middleware API, kindly check your access token"
          );
        }
      } else {
        console.log("Error making auth request");
      }
    } catch (error: any) {
      console.log("Error:", error.message);
    }
  }

  return config;
};

import { log } from "./logger";
import axios from "axios";

// ANSI escape codes for colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const colorLog = (
  level: string,
  message: string,
  attributes: Record<string, any> = {}
) => {
  let color = colors.reset;
  switch (level) {
    case "INFO":
      color = colors.green;
      break;
    case "WARN":
      color = colors.yellow;
      break;
    case "ERROR":
      color = colors.red;
      break;
  }
  console.log(`${color}${level}: ${message}${colors.reset}`, attributes);
  log(level, message, attributes);
};

export const performHealthCheck = (host: string): Promise<void> => {
  //const endpoint = `${host}:13133/health`;
  const endpoint = `http://localhost:13133/health`;
  return axios
    .get(endpoint)
    .then((response) => {
      if (response.status === 200) {
        colorLog("INFO", "Health check to MW Agent passed", {
          status: response.status,
        });
      } else {
        colorLog("WARN", "Health check to MW Agent returned non-200 status", {
          status: response.status,
        });
      }
    })
    .catch((error) => {
      colorLog("ERROR", "Health check o MW Agent failed", {
        error: error.message,
      });
    });
};

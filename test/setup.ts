import { beforeEach, afterEach } from "@jest/globals"; // Import Jest globals

// Define the environment variables to clean up
const ENV_VARS = [
  "MW_AGENT_SERVICE",
  "MW_TARGET",
  "MW_ACCESS_TOKEN",
  "MW_PROJECT_NAME",
  "MW_SERVICE_NAME",
  "MW_APM_TRACES_ENABLED",
  "MW_APM_METRICS_ENABLED",
  "MW_CONSOLE_EXPORTER",
];

// Function to clean up environment variables
const cleanUpEnvVars = () => {
  ENV_VARS.forEach((key) => {
    delete process.env[key];
  });
};

// Run after each test to clean up environment variables
afterEach(() => {
  cleanUpEnvVars();
});

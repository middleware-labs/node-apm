const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require('https')

const API_URI = 'api/v1/apm/tracking'
const configPath = path.join("/etc", "mw-agent", "agent-config.yaml");

function readAgentConfig(configPath) {
  try {
    // Read the file content

    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, "utf8");

      // Split into lines and process
      const lines = fileContent.split("\n");

      let apiKey = "";
      let target = "";

      for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith("#") || !line.trim()) {
          continue;
        }

        // Look for api-key
        if (line.includes("api-key:")) {
          apiKey = line.split("api-key:")[1].trim();
        }

        // Look for target
        if (line.includes("target:")) {
          target = line
            .split("target:")[1]
            .trim();
        }
      }

      return {
        apiKey,
        target,
      };
    } else {
      console.error(`Config file not found `);
    }
  } catch (error) {
    console.error("Error reading config file:", error);
    //throw error;
  }

  return null;
}

async function trackPreInstall(config) {

  const payload = {
    status: "apm_tried",
    metadata: {
      host_id: os.hostname(),
      os_type: os.platform(),
      apm_type: "Node",
      apm_data: {
        script: 'npm-install',
        os_version: os.release(),
        node_version: process.version,
        package_name: process.env.npm_package_name,
        package_version: process.env.npm_package_version,
        npm_lifecycle_event: process.env.npm_lifecycle_event,
        reason: 'PreInstall tracking'
      }
    }
  };

  const data = JSON.stringify(payload);
  const baseUrl = new URL(config.target);
  const pathSuffix = `${API_URI}/${config.apiKey}`;
  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname += '/';
  }
  baseUrl.pathname += pathSuffix;

  const options = {
    method: 'POST',
    hostname: baseUrl.hostname,
    path: baseUrl.pathname,
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    },
    rejectUnauthorized: false,
  };

  await makeRequest(options, data);
  console.log(`Successfully tracked event`);
}

async function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => resolve(responseData));
    });

    req.on('error', (error) => {
      console.log(error)
      console.log('Warning: Request failed', error.message);
      resolve();
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve();
    });

    req.write(data);
    req.end();
  });
}
try {
  (async () => {
    try {
      const config = readAgentConfig(configPath);

      if (!config || !config.apiKey || !config.target) {
        console.error("Invalid configuration: Missing API key or URL");
        return; // Return instead of throw
      }
      await trackPreInstall(config);
    } catch (error) {
      console.error("Pre-install script failed", error);
    } finally {
      process.exit(0);
    }
  })();
} catch (error) {
  console.error("Fatal error:", error);
  process.exit(0); // Still exit with 0 to not break npm install
}


// Ensure we always exit safely, even if there's an uncaught error
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(0);
});

// Ensure we always exit safely, even if there's an unhandled rejection
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(0);
});

// Set a timeout to ensure the script doesn't hang
setTimeout(() => {
  console.log('Script timeout reached, exiting safely');
  process.exit(0);
}, 10000);




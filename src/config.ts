import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import process from "process";
import { init as tracerInit } from "./tracer-collector";
import { init as metricInit } from "./metrics-collector";
import { loggerInitializer } from "./logger";
import { ResourceAttributes } from "@opentelemetry/resources";
import { getPackageVersion, parseBoolean, structuredLog } from "./utils";

export interface Config {
  pauseMetrics: Boolean | number;
  pauseTraces: Boolean | number;
  DEBUG: Boolean | number;
  host: string;
  projectName: string;
  serviceName: string;
  port: {
    grpc: number;
    fluent: number;
  };
  target: string;
  profilingServerUrl: string;
  enableProfiling: boolean;
  accessToken: string;
  tenantID: string;
  mwAuthURL: string;
  consoleLog: boolean;
  consoleError: boolean;
  meterProvider: any;
  isServerless: boolean;
  customResourceAttributes: ResourceAttributes;
  disabledInstrumentations: string;
  consoleExporter: boolean;
  enableSelfInstrumentation: boolean;
  sdkVersion?: string;
  excludeHttpTraces?: {
    incoming?: {
      urls?: string[];
      methods?: string[];
    };
    outgoing?: {
      urls?: string[];
      methods?: string[];
    };
  };
}

const WARNINGS = {
  MISSING_ACCESS_TOKEN:
    "Missing access token. Specify either MW_ACCESS_TOKEN environment variable or accessToken in the options parameter.",
  MISSING_SERVICE_NAME:
    "Missing service name. Specify either MW_SERVICE_NAME environment variable or serviceName in the options parameter.",
};

let customResourceAttributes: ResourceAttributes = {};

export let configDefault: Config = {
  DEBUG: false,
  host: "localhost",
  projectName: "Project-" + process.pid,
  serviceName: "nodejs-" + process.pid,
  port: {
    grpc: 9319,
    fluent: 8006,
  },
  target: "http://localhost:9319",
  profilingServerUrl: "",
  enableProfiling: true,
  accessToken: "",
  tenantID: "",
  mwAuthURL: "https://app.middleware.io/api/v1/auth",
  consoleLog: false,
  consoleError: true,
  pauseTraces: false,
  pauseMetrics: false,
  meterProvider: false,
  isServerless: false,
  customResourceAttributes: customResourceAttributes,
  disabledInstrumentations: "",
  consoleExporter: false,
  enableSelfInstrumentation: false,
  excludeHttpTraces: {
    incoming: {
      urls: [],
      methods: []
    },
    outgoing: {
      urls: [],
      methods: []
    }
  }
};

export const init = (config: Partial<Config> = {}): Config => {
  if (config.hasOwnProperty("target")) {
    configDefault["isServerless"] = true;
  }
  Object.keys(configDefault).forEach((key) => {
    // @ts-ignore
    configDefault[key] = config[key] ?? configDefault[key];
  });
  computeOptions(configDefault);

  // IF USING MW AGENT
  const isHostExist =
    process.env.MW_AGENT_SERVICE && process.env.MW_AGENT_SERVICE !== ""
      ? true
      : false;
  if (isHostExist) {
    // @ts-ignore
    configDefault.host = "http://" + process.env.MW_AGENT_SERVICE;
    configDefault.target =
      "http://" + process.env.MW_AGENT_SERVICE + ":" + configDefault.port.grpc;
  }
  diag.setLogger(
    new DiagConsoleLogger(),
    configDefault.DEBUG ? DiagLogLevel.DEBUG : DiagLogLevel.NONE
  );
  metricInit(configDefault);
  loggerInitializer(configDefault);
  tracerInit(configDefault);
  return <Config>configDefault;
};

export function computeOptions(config: Partial<Config> = {}) {
  // Merge environment variables (Higher Priority)
  config.target = process.env.MW_TARGET ?? config.target;
  config.accessToken = process.env.MW_API_KEY ?? config.accessToken;
  config.projectName = process.env.MW_PROJECT_NAME ?? config.projectName;
  config.serviceName = process.env.MW_SERVICE_NAME ?? config.serviceName;
  config.pauseTraces =
    parseBoolean(process.env.MW_APM_TRACES_ENABLED) ?? config.pauseTraces;
  config.pauseMetrics =
    parseBoolean(process.env.MW_APM_METRICS_ENABLED) ?? config.pauseMetrics;
  config.consoleExporter =
    parseBoolean(process.env.MW_CONSOLE_EXPORTER) ?? config.consoleExporter;
  config.enableSelfInstrumentation =
    parseBoolean(process.env.MW_SELF_INSTRUMENTATION) ??
    config.enableSelfInstrumentation;
  
  // Handle HTTP trace exclusions with environment variable precedence
  const incomingExcludedMethods = process.env.MW_EXCLUDE_INCOMING_HTTP_METHODS;
  const incomingExcludedUrls = process.env.MW_EXCLUDE_INCOMING_HTTP_URLS;
  const outgoingExcludedMethods = process.env.MW_EXCLUDE_OUTGOING_HTTP_METHODS;
  const outgoingExcludedUrls = process.env.MW_EXCLUDE_OUTGOING_HTTP_URLS;
  
  // Initialize excludeHttpTraces if not present
  if (!config.excludeHttpTraces) {
    config.excludeHttpTraces = { incoming: {}, outgoing: {} };
  }
  
  // Ensure incoming and outgoing objects exist
  if (!config.excludeHttpTraces.incoming) {
    config.excludeHttpTraces.incoming = {};
  }
  if (!config.excludeHttpTraces.outgoing) {
    config.excludeHttpTraces.outgoing = {};
  }
  
  // Apply environment variables with precedence (env overrides programmatic config)
  config.excludeHttpTraces.incoming.methods = incomingExcludedMethods 
    ? incomingExcludedMethods.split(",").map(m => m.trim().toUpperCase()).filter(Boolean)
    : config.excludeHttpTraces.incoming.methods ?? [];
    
  config.excludeHttpTraces.incoming.urls = incomingExcludedUrls
    ? incomingExcludedUrls.split(",").map(u => u.trim()).filter(Boolean)
    : config.excludeHttpTraces.incoming.urls ?? [];
    
  config.excludeHttpTraces.outgoing.methods = outgoingExcludedMethods
    ? outgoingExcludedMethods.split(",").map(m => m.trim().toUpperCase()).filter(Boolean)
    : config.excludeHttpTraces.outgoing.methods ?? [];
    
  config.excludeHttpTraces.outgoing.urls = outgoingExcludedUrls
    ? outgoingExcludedUrls.split(",").map(u => u.trim()).filter(Boolean)
    : config.excludeHttpTraces.outgoing.urls ?? [];
  
  config.sdkVersion = getPackageVersion();
  // Validate and warn
  if (!config.accessToken) {
    if (config.isServerless || config.enableProfiling) {
      structuredLog("WARN", WARNINGS.MISSING_ACCESS_TOKEN);
    }
  }

  if (!config.serviceName) {
    structuredLog("WARN", WARNINGS.MISSING_SERVICE_NAME);
  }

  return config;
}

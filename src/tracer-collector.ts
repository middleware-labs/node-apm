import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  InstrumentationConfigMap,
  getNodeAutoInstrumentations,
} from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { CompositePropagator } from "@opentelemetry/core";
import { B3Propagator, B3InjectEncoding } from "@opentelemetry/propagator-b3";
import { Config } from "./config";
import { Resource } from "@opentelemetry/resources";
import { resourceDetectors } from "./mwresourceDetector";
import {
  ConsoleSpanExporter,
  SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import { addVCSMetadata } from "./helper";

let sdk: NodeSDK | null = null;

// Debug logging wrapper function
const debugLog = (config: Config, message: string) => {
  if (config.DEBUG) {
    console.log(message);
  }
};

export const init = async (config: Config) => {
  const apm_pause_traces = config.pauseTraces === true;

  let resourceAttributes: Record<string, any> = {
    [ATTR_SERVICE_NAME]: config.serviceName,
    ["mw_agent"]: true,
    ["project.name"]: config.projectName,
    ["mw.account_key"]: config.accessToken,
    ["mw_serverless"]: config.isServerless ? 1 : 0,
    ["mw.sdk.version"]: config.sdkVersion,
    ...config.customResourceAttributes,
  };

  await addVCSMetadata(resourceAttributes);

  if (!apm_pause_traces) {
    sdk = new NodeSDK({
      textMapPropagator: new CompositePropagator({
        propagators: [
          new B3Propagator(),
          new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
        ],
      }),
      resourceDetectors: resourceDetectors(),
      resource: new Resource(resourceAttributes),
      traceExporter: getTraceExporter(config),
      instrumentations: [
        getNodeAutoInstrumentations(createInstrumentationConfig(config)),
        new GrpcInstrumentation({
          ignoreGrpcMethods: ["Export"],
        }),
      ],
    });
    
    sdk.start();
  }
};

function createInstrumentationConfig(config: Config): InstrumentationConfigMap {
  const instrumentationConfig: InstrumentationConfigMap = {};
  // DISABLING IT AS IT HAS SEVERE IMPACT ON PERFORMANCE
  instrumentationConfig["@opentelemetry/instrumentation-fs"] = {
    enabled: false,
  };
  const instrumentations: { [key: string]: keyof InstrumentationConfigMap } = {
    dns: "@opentelemetry/instrumentation-dns",
    net: "@opentelemetry/instrumentation-net",
  };

  config.disabledInstrumentations.split(",").forEach((item) => {
    const name = item.trim();
    if (name !== "" && name in instrumentations) {
      instrumentationConfig[instrumentations[name]] = { enabled: false };
    }
  });

  // By Default Ignoring Pyroscope Instrumented spans
  let pyroscopeIgnoreHook: ((request: any) => boolean) | undefined;
  if (!config.enableSelfInstrumentation) {
    debugLog(config, "[node-apm] Pyroscope self-instrumentation is disabled");
    pyroscopeIgnoreHook = (request): boolean => {
      if (request?.path && request.path.includes("/profiling/ingest")) return true;
      return false;
    };
  }

  // Get configuration for incoming and outgoing request exclusions
  const excludeConfig = config.excludeHttpTraces;
  const incomingConfig = excludeConfig?.incoming || {};
  const outgoingConfig = excludeConfig?.outgoing || {};
  
  const incomingExcludedMethods = incomingConfig.methods || [];
  const incomingExcludedUrls = incomingConfig.urls || [];
  const outgoingExcludedMethods = outgoingConfig.methods || [];
  const outgoingExcludedUrls = outgoingConfig.urls || [];

  debugLog(config, `[node-apm] Incoming excluded HTTP methods: ${incomingExcludedMethods}`);
  debugLog(config, `[node-apm] Incoming excluded HTTP URLs: ${incomingExcludedUrls}`);
  debugLog(config, `[node-apm] Outgoing excluded HTTP methods: ${outgoingExcludedMethods}`);
  debugLog(config, `[node-apm] Outgoing excluded HTTP URLs: ${outgoingExcludedUrls}`);

  // Apply exclusion rules if any are configured
  const hasExclusions = incomingExcludedMethods.length > 0 || incomingExcludedUrls.length > 0 ||
                        outgoingExcludedMethods.length > 0 || outgoingExcludedUrls.length > 0;

  // Set up HTTP instrumentation if we have exclusions OR need to apply pyroscope hook
  if (hasExclusions || pyroscopeIgnoreHook) {
    instrumentationConfig["@opentelemetry/instrumentation-http"] = {
      ignoreOutgoingRequestHook: (request): boolean => {
        // Exclude by URL
        debugLog(config, `[node-apm] Checking outgoing request: ${request?.path}`);
        if (request?.path && outgoingExcludedUrls.length > 0 && outgoingExcludedUrls.some((url) => request.path && request.path.includes(url))) {
          debugLog(config, `[node-apm] Dropping span for excluded outgoing URL: ${request.path}`);
          return true;
        }
        // Exclude by method
        if (request?.method && outgoingExcludedMethods.length > 0) {
          if (outgoingExcludedMethods.includes(request.method.toUpperCase())) {
            debugLog(config, `[node-apm] Dropping span for excluded outgoing HTTP method: ${request.method} ${request.path || ''}`);
            return true;
          }
        }
        // Calling pyroscope   ignore hook
        if (typeof pyroscopeIgnoreHook === 'function') {
          return pyroscopeIgnoreHook(request);
        }
        return false;
      },
      ignoreIncomingRequestHook: (request): boolean => {
        // Exclude by URL
        debugLog(config, `[node-apm] Checking incoming request: ${request?.url}`);
        if (request?.url && incomingExcludedUrls.length > 0 && incomingExcludedUrls.some((url) => request.url && request.url.includes(url))) {
          debugLog(config, `[node-apm] Dropping span for excluded incoming URL: ${request.url}`);
          return true;
        }
        // Exclude by method
        if (request?.method && incomingExcludedMethods.length > 0) {
          if (incomingExcludedMethods.includes(request.method.toUpperCase())) {
            debugLog(config, `[node-apm] Dropping span for excluded incoming HTTP method: ${request.method} ${request.url || ''}`);
            return true;
          }
        }
        return false;
      },
    };
  }

  return instrumentationConfig;
}

export const shutdown = async (): Promise<void> => {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log("OpenTelemetry SDK shut down successfully");
    } catch (err) {
      console.log("OpenTelemetry SDK shut down failed");
    }
  } else {
    console.log("OpenTelemetry SDK was not initialized, nothing to shut down");
  }
};

function getTraceExporter(config: Config): SpanExporter {
  if (config.consoleExporter) {
    return new ConsoleSpanExporter();
  }
  return new OTLPTraceExporter({
    url: config.target,
    compression: CompressionAlgorithm.GZIP,
  });
}
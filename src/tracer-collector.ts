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

let sdk: NodeSDK | null = null;

export const init = (config: Config) => {
  const apm_pause_traces = config.pauseTraces === true;

  if (!apm_pause_traces) {
    sdk = new NodeSDK({
      textMapPropagator: new CompositePropagator({
        propagators: [
          new B3Propagator(),
          new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
        ],
      }),
      resourceDetectors: resourceDetectors(),
      resource: new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
        ["mw_agent"]: true,
        ["project.name"]: config.projectName,
        ["mw.account_key"]: config.accessToken,
        ["mw_serverless"]: config.isServerless ? 1 : 0,
        ["mw.sdk.version"]: config.sdkVersion,
        ...config.customResourceAttributes,
      }),
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
  if (!config.enableSelfInstrumentation) {
    instrumentationConfig["@opentelemetry/instrumentation-http"] = {
      ignoreOutgoingRequestHook: (request): boolean => {
        if (request?.path) {
          return request.path.includes("/profiling/ingest");
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
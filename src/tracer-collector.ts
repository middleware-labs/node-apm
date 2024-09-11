const opentelemetry = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-grpc");
const { GrpcInstrumentation } = require("@opentelemetry/instrumentation-grpc");
const { Resource } = require("@opentelemetry/resources");
let {
  SEMRESATTRS_SERVICE_NAME,
} = require("@opentelemetry/semantic-conventions");
const api = require("@opentelemetry/api");
const { CompositePropagator } = require("@opentelemetry/core");
const {
  B3Propagator,
  B3InjectEncoding,
} = require("@opentelemetry/propagator-b3");
import { Config } from "./config";
const {
  MongooseInstrumentation,
} = require("@opentelemetry/instrumentation-mongoose");
export const init = (config: Config) => {
  const apm_pause_traces = config.pauseTraces === true;

  if (!apm_pause_traces) {
    const sdk = new opentelemetry.NodeSDK({
      CompositePropagator: new CompositePropagator({
        propagators: [
          new B3Propagator(),
          new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
        ],
      }),
      traceExporter: new OTLPTraceExporter({
        url: config.target,
      }),
      instrumentations: [
        getNodeAutoInstrumentations(createInstrumentationConfig(config)),
        new GrpcInstrumentation({
          ignoreGrpcMethods: ["Export"],
        }),
        new MongooseInstrumentation(),
      ],
    });

    if (
      SEMRESATTRS_SERVICE_NAME === "undefined" ||
      SEMRESATTRS_SERVICE_NAME === undefined
    ) {
      SEMRESATTRS_SERVICE_NAME = "service.name";
    }

    sdk.addResource(
      new Resource({
        [SEMRESATTRS_SERVICE_NAME]:
          process.env.OTEL_SERVICE_NAME ||
          process.env.MW_SERVICE_NAME ||
          config.serviceName,
        ["mw_agent"]: true,
        ["project.name"]: config.projectName,
        ["mw.account_key"]: config.accessToken,
        ["mw_serverless"]: config.isServerless ? 1 : 0,
        ...config.customResourceAttributes,
      })
    );

    sdk.start();
  }
};

function createInstrumentationConfig(config: Config): any {
  const instrumentationConfig: any = {};
  const instrumentations: Record<string, string> = {
    dns: "@opentelemetry/instrumentation-dns",
    net: "@opentelemetry/instrumentation-net",
  };
  const disabledInstrumentations =
    process.env.MW_NODE_DISABLED_INSTRUMENTATIONS ||
    config.disabledInstrumentations;
    
  disabledInstrumentations.split(",").forEach((item: string) => {
    const name = item.trim();
    if (name !== "" && name in instrumentations) {
      instrumentationConfig[instrumentations[name]] = { enabled: false };
    }
  });

  return instrumentationConfig;
}

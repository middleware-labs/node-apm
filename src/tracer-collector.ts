import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import api from "@opentelemetry/api";
import { CompositePropagator } from "@opentelemetry/core";
import { B3Propagator, B3InjectEncoding } from "@opentelemetry/propagator-b3";
import { Config } from "./config";
import { MongooseInstrumentation } from "@opentelemetry/instrumentation-mongoose";
export const init = (config: Config) => {
  const apm_pause_traces = config.pauseTraces === true;

  if (!apm_pause_traces) {
    const sdk = new NodeSDK({
      textMapPropagator: new CompositePropagator({
        propagators: [
          new B3Propagator(),
          new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
        ],
      }),
      resource: new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
        ["mw_agent"]: true,
        ["project.name"]: config.projectName,
        ["mw.account_key"]: config.accessToken,
        ["mw_serverless"]: config.isServerless ? 1 : 0,
        ...config.customResourceAttributes,
      }),
      traceExporter: new OTLPTraceExporter({
        url: config.target,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": {
            enabled: false,
          },
        }),
        new GrpcInstrumentation({
          ignoreGrpcMethods: ["Export"],
        }),
        new MongooseInstrumentation(),
      ],
    });

    // sdk.addResource(

    // );

    sdk.start();
  }
};

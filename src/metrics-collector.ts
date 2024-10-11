import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
// @ts-ignore
import setupNodeMetrics from "opentelemetry-node-metrics";
import { Config } from "./config";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";

export const init = (config: Config): void => {
  let SERVICE_NAME = ATTR_SERVICE_NAME;
  const metricsExporter = getMetricExporter(config);
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricsExporter,
    exportIntervalMillis: 10000,
  });
  const serviceName = config.serviceName;
  const projectName = config.projectName;
  if (SERVICE_NAME === undefined) {
    SERVICE_NAME = "service.name";
  }
  const meterProvider = new MeterProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      ["mw_agent"]: true,
      ["project.name"]: projectName,
      ["mw.account_key"]: config.accessToken,
      ["runtime.metrics.nodejs"]: true,
      ["mw.app.lang"]: "nodejs",
      ["mw_serverless"]: config.isServerless ? 1 : 0,
      ["mw.sdk.version"]: config.sdkVersion,
      ...config.customResourceAttributes,
    }),
    readers: [metricReader],
  });
  config.meterProvider = meterProvider;
  const apmPauseMetrics = config.pauseMetrics && config.pauseMetrics === 1;
  if (!apmPauseMetrics) {
    setupNodeMetrics(meterProvider);
  }
};

function getMetricExporter(config: Config): PushMetricExporter {
  if (config.consoleExporter) {
    return new ConsoleMetricExporter();
  }
  return new OTLPMetricExporter({
    url: config.target,
    compression: CompressionAlgorithm.GZIP,
  });
}

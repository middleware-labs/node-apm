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
import { EventLoopUtilization, performance } from "perf_hooks";

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

  const mwVCSCommitSha = process.env.MW_VCS_COMMIT_SHA;
  const mwVCSRepositoryUrl = process.env.MW_VCS_REPOSITORY_URL;

  const resourceAttributes: Record<string, any> = {
    [ATTR_SERVICE_NAME]: config.serviceName,
    ["mw_agent"]: true,
    ["project.name"]: config.projectName,
    ["mw.account_key"]: config.accessToken,
    ["mw_serverless"]: config.isServerless ? 1 : 0,
    ["mw.sdk.version"]: config.sdkVersion,
    ...config.customResourceAttributes,
  };

  if (mwVCSCommitSha) {
    resourceAttributes["vcs.commit_sha"] = mwVCSCommitSha;
  }

  if (mwVCSRepositoryUrl) {
    resourceAttributes["vcs.repository_url"] = mwVCSRepositoryUrl;
  }

  const meterProvider = new MeterProvider({
    resource: new Resource(resourceAttributes),
    readers: [metricReader],
  });
  config.meterProvider = meterProvider;
  const apmPauseMetrics = config.pauseMetrics && config.pauseMetrics === 1;
  if (!apmPauseMetrics) {
    setupNodeMetrics(meterProvider);
    // Setup ELU monitoring if available
    setupEventLoopUtilizationMonitoring(meterProvider);
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

/**
 * Sets up monitoring for Event Loop Utilization when available.
 * This creates an observable gauge to track how busy the Node.js event loop is.
 *
 * @param meterProvider The OpenTelemetry meter provider
 */
function setupEventLoopUtilizationMonitoring(meterProvider: MeterProvider) {

  if (!("eventLoopUtilization" in performance)) {
    return;
  }
  let elu: EventLoopUtilization;
  const meter = meterProvider.getMeter("node-runtime-metrics");

  meter
    .createObservableGauge("runtime.node.event_loop.utilization", {
      description: "Node.js event loop utilization (0-1)",
    })
    .addCallback((observable) => {
      // If elu is undefined (first run), measurement is from start of process
      elu = performance.eventLoopUtilization(elu);
      if (elu?.utilization) {
        observable.observe(elu.utilization);
      }
    });
}

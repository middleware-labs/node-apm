const otel = require("@opentelemetry/api");
import { context, SpanStatusCode } from "@opentelemetry/api";
import { log } from "./logger";
import { init as configInit } from "./config";
import { init as profilerInit } from "./profiler";
import { Config, configDefault } from "./config";
import {
  Meter as IMeter,
  MeterOptions,
  TracerOptions,
  Tracer,
  trace
} from "@opentelemetry/api";
import { performHealthCheck } from "./healthcheck";
import { shutdown } from "./tracer-collector";
export const track = (newConfig: Partial<Config> | undefined = {}): void => {
  const config = configInit(newConfig);
  profilerInit(config).then((r) => {});
  // Perform Health check to MW Agent
  if (!configDefault["isServerless"]) {
    // Perform in async way as (synchronous import)
    performHealthCheck(config?.host).then((r) => {});
  }
};
export const sdkShutdown = (): Promise<void> => {
  return shutdown();
};
export const info = (
  message: string,
  attributes: Record<string, any> = {}
): void => {
  log("INFO", message, attributes);
};

export const warn = (
  message: string,
  attributes: Record<string, any> = {}
): void => {
  log("WARN", message, attributes);
};

export const debug = (
  message: string,
  attributes: Record<string, any> = {}
): void => {
  log("DEBUG", message, attributes);
};

export const error = (
  message: string,
  attributes: Record<string, any> = {}
): void => {
  log("ERROR", message, attributes);
};

export const errorRecord = (e: Error): void => {
  if (otel?.context) {
    const span = otel.trace.getSpan(otel.context.active());
    if (span) {
      span.recordException(e);
      span.setStatus({ code: otel.SpanStatusCode.ERROR, message: String(e) });
    }
  }
};

export const setAttribute = (name: string, value: any): void => {
  if (otel?.context) {
    const span = otel.trace.getSpan(otel.context.active());
    if (span) {
      span.setAttribute(name, value);
    }
  }
};

export const getMeter = (
  name: string,
  version?: string,
  options?: MeterOptions
): IMeter => {
  if (configDefault.meterProvider) {
    return configDefault.meterProvider.getMeter(configDefault.serviceName);
  }
  return otel.meter.getMeter(configDefault.serviceName);
};

export const getTracer = (
  name: string,
  version?: string,
  options?: TracerOptions
): Tracer => {
  return otel.trace.getTracer(configDefault.serviceName);
};

// Function to capture global exceptions and associate with active spans
function setupGlobalExceptionHandler() {
  /**
 * Handles uncaught exceptions.
 */
process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  recordException(error);
  process.exit(1); // Exit process (optional)
});

/**
* Handles unhandled promise rejections.
*/
process.on("unhandledRejection", (reason: unknown) => {
  console.error("Unhandled Rejection:", reason);

  if (reason instanceof Error) {
      recordException(reason);
  } else {
      recordException(new Error(String(reason))); // Convert non-errors to error objects
  }

  process.exit(1); // Exit process (optional)
});
}

function recordException(error: Error): void {
  const span = trace.getSpan(context.active());
  if (span) {
      span.addEvent("exception", {
          "exception.type": error.name,
          "exception.message": error.message,
          "exception.stacktrace": error.stack || "No stack trace available",
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

// Enable global exception tracking
setupGlobalExceptionHandler();
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  LogRecordExporter,
} from "@opentelemetry/sdk-logs";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import fs from "fs";
import path from "path";
import { format } from "logform";
const { errors } = format;
const errorsFormat = errors({ stack: true });
let transformError = errorsFormat.transform;
import { Config } from "./config";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import api from "@opentelemetry/api";

const DEFAULT_LOG_KEYS = {
  traceId: "trace_id",
  spanId: "span_id",
  traceFlags: "trace_flags",
};

let logPackageName;
let logPackageVersion;
try {
  // Check for Package json in root project context
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  logPackageName = packageJson.name;
  logPackageVersion = packageJson.version;
} catch (e) {
  // Reverting to default values
  logPackageName = "unknown-package";
  logPackageVersion = "0.0.0";
}

/* Need this as maybe in client side ATTR_SERVICE_NAME results undefined due to version issues*/
let SERVICE_NAME = ATTR_SERVICE_NAME;
if (SERVICE_NAME === undefined) {
  SERVICE_NAME = "service.name";
}

const log = (
  level: string,
  message: string,
  attributes: Record<string, any> = {}
): void => {
  if (level === "ERROR") {
    // @ts-ignore
    let stack = transformError(message, { stack: true });
    // @ts-ignore
    message = typeof stack === "string" ? stack : stack.message;
    // @ts-ignore
    attributes["stack"] = stack && stack.stack ? stack.stack : "";
  }
  const logger = logs.getLogger(logPackageName, logPackageVersion);

  let trace_id = null;
  let span_id = null;
  let trace_flags = null;
  let current_span = api.trace.getSpan(api.context.active());
  if (current_span) {
    trace_id = current_span.spanContext().traceId;
    span_id = current_span.spanContext().spanId;
    trace_flags = current_span.spanContext().traceFlags;
  }

  // @ts-ignore
  const severityNumber = SeverityNumber[level];

  if (trace_id && span_id && trace_flags) {
    logger.emit({
      severityNumber,
      severityText: level,
      body: message,
      attributes: {
        "mw.app.lang": "nodejs",
        level: level.toLowerCase(),
        ...(typeof attributes === "object" && Object.keys(attributes).length
          ? attributes
          : {}),
      },
      [DEFAULT_LOG_KEYS.traceId]: trace_id,
      [DEFAULT_LOG_KEYS.spanId]: span_id,
      [DEFAULT_LOG_KEYS.traceFlags]: `0${trace_flags.toString(16)}`,
    });
  } else {
    logger.emit({
      severityNumber,
      severityText: level,
      body: message,
      attributes: {
        "mw.app.lang": "nodejs",
        level: level.toLowerCase(),
        ...(typeof attributes === "object" && Object.keys(attributes).length
          ? attributes
          : {}),
      },
    });
  }
};

export const loggerInitializer = (config: Config): void => {
  const loggerProvider = new LoggerProvider({
    resource: new Resource({
      [SERVICE_NAME]: config.serviceName,
      ["mw_agent"]: true,
      ["project.name"]: config.projectName,
      ["mw.account_key"]: config.accessToken,
      ["mw_serverless"]: config.isServerless ? 1 : 0,
      ["mw.sdk.version"]: config.sdkVersion,
      ...config.customResourceAttributes,
    }),
  });

  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(getLogsExporter(config))
  );

  logs.setGlobalLoggerProvider(loggerProvider);

  /**
   * Bootstrap Logger Initialization
   * This section initializes the logger for the application's bootstrap process.
   * It creates a logger instance and emits the first log message indicating
   * that the logger has been successfully initialized.
   */
  const logger = loggerProvider.getLogger("init-logger");
  logger.emit({
    body: "Bootstrap: Logger initialized",
    attributes: {
      "mw.app.lang": "nodejs",
    },
  });

  if (config.consoleLog) {
    const originalConsoleLog = console.log;
    console.log = (...args: any[]): void => {
      log("INFO", args.join(" "), {});
      originalConsoleLog(...args);
    };
  }
  if (config.consoleError) {
    const originalConsoleError = console.error;
    console.error = (...args: any[]): void => {
      log("ERROR", args.join(" "), {});
      originalConsoleError(...args);
    };
  }
};

function getLogsExporter(config: Config): LogRecordExporter {
  if (config.consoleExporter) {
    return new ConsoleLogRecordExporter();
  }
  return new OTLPLogExporter({
    url: config.target,
    compression: CompressionAlgorithm.GZIP,
  });
}

export { log };

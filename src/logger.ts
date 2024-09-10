import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import fs from "fs";
import path from "path";
const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
import { format } from "logform";
const { errors } = format;
const errorsFormat = errors({ stack: true });
let transformError = errorsFormat.transform;
import { Config } from "./config";

// const log = (
//   level: string,
//   message: string | Error,
//   attributes: Record<string, any> = {}
// ): void => {
//   let msgbody = "";
//   let body: string;
//   if (message instanceof Error) {
//     body = message.stack || message.message;
//     attributes.stack = message.stack;
//   } else {
//     body = message;
//   }
//   const logger = logs.getLogger(packageJson.name, packageJson.version);
//   const severityNumber = SeverityNumber[level as keyof typeof SeverityNumber];
//   logger.emit({
//     severityNumber,
//     severityText: level,
//     body: msgbody,
//     attributes: {
//       "mw.app.lang": "nodejs",
//       level: level.toLowerCase(),
//       ...(typeof attributes === "object" && Object.keys(attributes).length
//         ? attributes
//         : {}),
//     },
//   });
// };

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
  const logger = logs.getLogger(packageJson.name, packageJson.version);
  // @ts-ignore
  const severityNumber = SeverityNumber[level];
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
};

export const loggerInitializer = (config: Config): void => {
  const loggerProvider = new LoggerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      ["mw_agent"]: true,
      ["project.name"]: config.projectName,
      ["mw.account_key"]: config.accessToken,
      ["mw_serverless"]: config.isServerless ? 1 : 0,
      ...config.customResourceAttributes,
    }),
  });

  console.log("logger config.target", config.target);
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: config.target }))
  );

  logs.setGlobalLoggerProvider(loggerProvider);

  const logger = loggerProvider.getLogger("example-logger");
  logger.emit({
    body: "example-log",
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

export { log };

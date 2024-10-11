import { Config, init, configDefault } from "../src/config"; // Update this import path
import { structuredLog } from "../src/utils"; // Import parseBoolean normally
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { init as metricInit } from "../src/metrics-collector";
import { init as tracerInit } from "../src/tracer-collector";
import { loggerInitializer } from "../src/logger";

// Mock only structuredLog function
jest.mock("../src/utils", () => ({
  structuredLog: jest.fn(),
  getPackageVersion: jest.fn(),
  parseBoolean: jest.requireActual("./../src/utils").parseBoolean,
}));

// Mock dependencies
jest.mock("@opentelemetry/api", () => ({
  diag: {
    setLogger: jest.fn(),
  },
  DiagConsoleLogger: jest.fn(),
  DiagLogLevel: {
    DEBUG: "DEBUG",
    NONE: "NONE",
  },
}));
jest.mock("../src/metrics-collector", () => ({ init: jest.fn() }));
jest.mock("../src/tracer-collector", () => ({ init: jest.fn() }));
jest.mock("../src/logger", () => ({ loggerInitializer: jest.fn() }));

describe("Config Initialization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    jest.clearAllMocks();
    process.env = originalEnv;
  });

  it("should initialize with default values when no config is provided", () => {
    const result = init();
    expect(result).toEqual(expect.objectContaining(configDefault));
    expect(diag.setLogger).toHaveBeenCalledWith(
      expect.any(DiagConsoleLogger),
      DiagLogLevel.NONE
    );
    expect(metricInit).toHaveBeenCalledWith(
      expect.objectContaining(configDefault)
    );
    expect(loggerInitializer).toHaveBeenCalledWith(
      expect.objectContaining(configDefault)
    );
    expect(tracerInit).toHaveBeenCalledWith(
      expect.objectContaining(configDefault)
    );
  });

  it("should override default values with provided config", () => {
    const customConfig: Partial<Config> = {
      DEBUG: true,
      serviceName: "custom-service",
      accessToken: "custom-token",
    };
    const result = init(customConfig);
    expect(result).toEqual(
      expect.objectContaining({
        ...configDefault,
        ...customConfig,
      })
    );
    expect(diag.setLogger).toHaveBeenCalledWith(
      expect.any(DiagConsoleLogger),
      DiagLogLevel.DEBUG
    );
  });

  it("should set isServerless to true when target is provided", () => {
    const result = init({ target: "http://custom-target.com" });
    expect(result.isServerless).toBe(true);
  });

  it("should handle MW_AGENT_SERVICE environment variable", () => {
    process.env.MW_AGENT_SERVICE = "agent.example.com";
    const result = init();
    expect(result.host).toBe("http://agent.example.com");
    expect(result.target).toBe(
      `http://agent.example.com:${configDefault.port.grpc}`
    );
  });

  it("should handle empty MW_AGENT_SERVICE", () => {
    process.env.MW_AGENT_SERVICE = "";
    const result = init({
      target: "http://custom-target.com",
    });
    expect(result.target).toBe("http://custom-target.com");
    expect(result.isServerless).toBe(true);
  });

  it("should correctly parse boolean environment variables", () => {
    process.env.MW_APM_TRACES_ENABLED = "false";
    process.env.MW_APM_METRICS_ENABLED = "true";
    process.env.MW_CONSOLE_EXPORTER = "true";
    const result = init();
    expect(result.pauseTraces).toBe(false);
    expect(result.pauseMetrics).toBe(true);
    expect(result.consoleExporter).toBe(true);
  });

  it("should handle invalid boolean environment variables", () => {
    process.env.MW_APM_TRACES_ENABLED = "invalid";
    const result = init();
    expect(result.pauseTraces).toBe(configDefault.pauseTraces);
  });

  it("should warn about missing access token for serverless environments", () => {
    init({ target: "http://custom-target.com", accessToken: "" });
    expect(structuredLog).toHaveBeenCalledWith(
      "WARN",
      expect.stringContaining("Missing access token")
    );
  });

  it("should warn about missing service name", () => {
    init({ serviceName: "" });
    expect(structuredLog).toHaveBeenCalledWith(
      "WARN",
      expect.stringContaining("Missing service name")
    );
  });

  // Edge case: Conflicting configuration
  // MW_AGENT_SERVICE takes priority and will be over written
  it("should handle conflicting isServerless and MW_AGENT_SERVICE", () => {
    process.env.MW_AGENT_SERVICE = "agent.example.com";
    const result = init({
      target: "http://custom-target.com",
    });
    expect(result.isServerless).toBe(true);
    expect(result.host).toBe("http://agent.example.com");
    expect(result.target).toBe(
      `http://agent.example.com:${configDefault.port.grpc}`
    );
  });

  it("should handle profiling as true by default", () => {
    const result = init({ target: "http://custom-target.com" });
    expect(result.enableProfiling).toBe(true);
  });

  it("should disable profiling if specified explicitly", () => {
    const result = init({ enableProfiling: false });
    expect(result.enableProfiling).toBe(false);
  });

  it("should handle customResourceAttributes", () => {
    const customAttributes = { key1: "value1", key2: "value2" };
    const result = init({ customResourceAttributes: customAttributes });
    expect(result.customResourceAttributes).toEqual(customAttributes);
    expect(metricInit).toHaveBeenCalledWith(
      expect.objectContaining({ customResourceAttributes: customAttributes })
    );
    expect(tracerInit).toHaveBeenCalledWith(
      expect.objectContaining({ customResourceAttributes: customAttributes })
    );
  });

  it("should handle consoleExporter configuration", () => {
    const result = init({ consoleExporter: true });
    expect(result.consoleExporter).toBe(true);
    expect(metricInit).toHaveBeenCalledWith(
      expect.objectContaining({ consoleExporter: true })
    );
    expect(tracerInit).toHaveBeenCalledWith(
      expect.objectContaining({ consoleExporter: true })
    );
  });

  it("should handle disabledInstrumentations as comma-separated string", () => {
    const disabledInstrumentations = "net,dns";
    const result = init({ disabledInstrumentations });
    expect(result.disabledInstrumentations).toEqual("net,dns");
  });

  // Test for empty disabledInstrumentations
  it("should handle empty disabledInstrumentations", () => {
    const result = init({ disabledInstrumentations: "" });
    expect(result.disabledInstrumentations).toEqual("");
  });
});

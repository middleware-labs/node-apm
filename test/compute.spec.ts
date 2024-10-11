// Mock the structuredLog function
jest.mock("./../src/utils", () => ({
  structuredLog: jest.fn(),
  getPackageVersion: jest.fn(),
  parseBoolean: jest.requireActual("./../src/utils").parseBoolean,
}));
import { structuredLog, parseBoolean } from "../src/utils";
import { computeOptions, Config } from "../src/config";

describe("Config Functions", () => {
  // Store the original process.env
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Clear all mocks after each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original process.env after all tests
    process.env = originalEnv;
  });

  describe("computeOptions", () => {
    it("should use environment variables when available", () => {
      process.env.MW_TARGET = "http://test-target.com";
      process.env.MW_API_KEY = "test-api-key";
      process.env.MW_PROJECT_NAME = "test-project";
      process.env.MW_SERVICE_NAME = "test-service";
      process.env.MW_APM_TRACES_ENABLED = "false";
      process.env.MW_APM_METRICS_ENABLED = "true";
      process.env.MW_CONSOLE_EXPORTER = "true";

      const config: Partial<Config> = {};
      computeOptions(config);

      expect(config.target).toBe("http://test-target.com");
      expect(config.accessToken).toBe("test-api-key");
      expect(config.projectName).toBe("test-project");
      expect(config.serviceName).toBe("test-service");
      expect(config.pauseTraces).toBe(false);
      expect(config.pauseMetrics).toBe(true);
      expect(config.consoleExporter).toBe(true);
    });

    it("should use config values when environment variables are not set", () => {
      const config: Partial<Config> = {
        target: "http://default-target.com",
        accessToken: "default-api-key",
        projectName: "default-project",
        serviceName: "default-service",
        pauseTraces: true,
        pauseMetrics: false,
        consoleExporter: false,
      };

      computeOptions(config);

      expect(config.target).toBe("http://default-target.com");
      expect(config.accessToken).toBe("default-api-key");
      expect(config.projectName).toBe("default-project");
      expect(config.serviceName).toBe("default-service");
      expect(config.pauseTraces).toBe(true);
      expect(config.pauseMetrics).toBe(false);
      expect(config.consoleExporter).toBe(false);
    });

    it("should log a warning when access token is missing for serverless or profiling", () => {
      const config: Partial<Config> = {
        isServerless: true,
        enableProfiling: true,
      };

      computeOptions(config);

      expect(structuredLog).toHaveBeenCalledWith(
        "WARN",
        expect.stringContaining("Missing access token")
      );
    });

    it("should log a warning when service name is missing", () => {
      const config: Partial<Config> = {};

      computeOptions(config);

      expect(structuredLog).toHaveBeenCalledWith(
        "WARN",
        expect.stringContaining("Missing service name")
      );
    });
  });

  describe("parseBoolean", () => {
    it('should return true for "true"', () => {
      expect(parseBoolean("true")).toBe(true);
    });

    it('should return false for "false"', () => {
      expect(parseBoolean("false")).toBe(false);
    });

    it("should return undefined for any other string", () => {
      expect(parseBoolean("yes")).toBeUndefined();
      expect(parseBoolean("no")).toBeUndefined();
      expect(parseBoolean("1")).toBeUndefined();
      expect(parseBoolean("0")).toBeUndefined();
    });

    it("should return undefined for undefined input", () => {
      expect(parseBoolean(undefined)).toBeUndefined();
    });
  });
});

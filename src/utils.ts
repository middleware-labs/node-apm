import { join } from "path";
import { readFileSync } from "fs";

export const structuredLog = (
  level: string,
  message: string,
  attributes: Record<string, any> = {}
) => {
  console.log(`${level}: ${message}`, attributes);
};

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function getPackageVersion(fallbackVersion: string = "0.0.0"): string {
  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || fallbackVersion;
  } catch (error) {
    return fallbackVersion;
  }
}

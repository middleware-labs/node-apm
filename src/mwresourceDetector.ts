import {
  ResourceDetector,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
  serviceInstanceIdDetector,
} from "@opentelemetry/resources";
import {
  awsBeanstalkDetector,
  awsEcsDetector,
  awsEksDetector,
  awsEc2Detector,
  awsLambdaDetector,
} from "@opentelemetry/resource-detector-aws";
import {
  azureAppServiceDetector,
  azureFunctionsDetector,
  azureVmDetector,
} from "@opentelemetry/resource-detector-azure";
import { gcpDetector } from "@opentelemetry/resource-detector-gcp";
import { containerDetector } from "@opentelemetry/resource-detector-container";

const defaultDetectors: Record<string, ResourceDetector | ResourceDetector[]> = {
  env: envDetector,
  process: processDetector,
  serviceinstance: serviceInstanceIdDetector,
  os: osDetector,
  host: hostDetector,
  container: containerDetector,
  aws: [
    awsBeanstalkDetector,
    awsEc2Detector,
    awsEcsDetector,
    awsEksDetector,
    awsLambdaDetector,
  ],
  azure: [azureAppServiceDetector, azureFunctionsDetector, azureVmDetector],
  gcp: gcpDetector,
};

export const resourceDetectors = (): ResourceDetector[] => {
  // Get detectors from the environment variable
  const detectorsFromEnv =
    process.env.OTEL_NODE_RESOURCE_DETECTORS || "default";
  let detectorKeys = detectorsFromEnv
    .split(",")
    .map((s) => s.trim().toLowerCase());

  if (detectorKeys.includes("default")) {
    return [
      envDetector,
      processDetector,
      osDetector,
      containerDetector,
      serviceInstanceIdDetector,
      hostDetector
    ];
  }

  // Handle the "all" and "none" cases
  if (detectorKeys.includes("none")) return [];
  if (detectorKeys.includes("all")) {
    // Flatten nested arrays for AWS and Azure
    return [...Object.values(defaultDetectors).flat()];
  }

  // Filter detectors based on the provided keys in the environment variable
  const resolvedDetectors: ResourceDetector[] = [];
  for (const key of detectorKeys) {
    const detector = defaultDetectors[key];
    if (detector) {
      // Check if the detector is an array
      if (Array.isArray(detector)) {
        // If it's an array, spread its contents into resolvedDetectors
        resolvedDetectors.push(...detector);
      } else {
        // If it's not an array, push the single detector
        resolvedDetectors.push(detector);
      }
    } else {
      console.warn(
        `Invalid resource detector "${key}" specified in the environment variable OTEL_NODE_RESOURCE_DETECTORS`
      );
    }
  }

  return resolvedDetectors.flat();
};

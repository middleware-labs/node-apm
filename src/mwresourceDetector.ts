import {
  Detector,
  DetectorSync,
  envDetectorSync,
  hostDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from "@opentelemetry/resources";
import {
  awsBeanstalkDetectorSync,
  awsEcsDetectorSync,
  awsEksDetectorSync,
  awsEc2DetectorSync,
  awsLambdaDetectorSync,
} from "@opentelemetry/resource-detector-aws";
import {
  azureAppServiceDetector,
  azureFunctionsDetector,
  azureVmDetector,
} from "@opentelemetry/resource-detector-azure";
import { gcpDetector } from "@opentelemetry/resource-detector-gcp";
import { containerDetector } from "@opentelemetry/resource-detector-container";

const defaultDetectors: Record<
  string,
  DetectorSync | DetectorSync[] | Detector | Detector[]
> = {
  env: envDetectorSync,
  process: processDetectorSync,
  serviceinstance: serviceInstanceIdDetectorSync,
  os: osDetectorSync,
  host: hostDetectorSync,
  container: containerDetector,
  aws: [
    awsBeanstalkDetectorSync,
    awsEc2DetectorSync,
    awsEcsDetectorSync,
    awsEksDetectorSync,
    awsLambdaDetectorSync,
  ],
  azure: [azureAppServiceDetector, azureFunctionsDetector, azureVmDetector],
  gcp: gcpDetector,
};

export const resourceDetectors = (): (Detector | DetectorSync)[] => {
  // Get detectors from the environment variable
  const detectorsFromEnv =
    process.env.OTEL_NODE_RESOURCE_DETECTORS || "default";
  let detectorKeys = detectorsFromEnv
    .split(",")
    .map((s) => s.trim().toLowerCase());

  if (detectorKeys.includes("default")) {
    return [
      envDetectorSync,
      processDetectorSync,
      osDetectorSync,
      containerDetector,
      serviceInstanceIdDetectorSync,
      hostDetectorSync
    ];
  }

  // Handle the "all" and "none" cases
  if (detectorKeys.includes("none")) return [];
  if (detectorKeys.includes("all")) {
    // Flatten nested arrays for AWS and Azure
    return [...Object.values(defaultDetectors).flat()];
  }

  // Filter detectors based on the provided keys in the environment variable
  const resolvedDetectors: (Detector | DetectorSync)[] = [];
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

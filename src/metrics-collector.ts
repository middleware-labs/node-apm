import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
let {SEMRESATTRS_SERVICE_NAME} = require("@opentelemetry/semantic-conventions");
import { Resource } from '@opentelemetry/resources';
import {
    MeterProvider,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
// @ts-ignore
import setupNodeMetrics  from 'opentelemetry-node-metrics';
import {Config} from './config';

export const init = (config: Config): void => {
    const metricsExporter = new OTLPMetricExporter({ 
        url: config.target 
    });
    const metricReader =  new PeriodicExportingMetricReader({
        exporter: metricsExporter,
        exportIntervalMillis: 10000,
    });
    const serviceName = config.serviceName;
    const projectName = config.projectName;
    if (SEMRESATTRS_SERVICE_NAME === "undefined" || SEMRESATTRS_SERVICE_NAME === undefined) {
        SEMRESATTRS_SERVICE_NAME = "service.name"
    }
    const meterProvider = new MeterProvider({
        resource: new Resource({
            [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || process.env.MW_SERVICE_NAME || serviceName,
            ['mw_agent']: true,
            ['project.name']: projectName,
            ['mw.account_key']: config.accessToken,
            ['runtime.metrics.nodejs']: true,
            ['mw.app.lang']: 'nodejs',
            ['mw_serverless']:config.isServerless ? 1 : 0,
            ...config.customResourceAttributes
        }),
        readers : [metricReader]
    });
    config.meterProvider = meterProvider;
    const apmPauseMetrics = config.pauseMetrics && config.pauseMetrics === 1;
    if (!apmPauseMetrics) {
        setupNodeMetrics(meterProvider);
    }
};

const opentelemetry = require('@opentelemetry/sdk-node');
const {getNodeAutoInstrumentations} = require('@opentelemetry/auto-instrumentations-node');
const {OTLPTraceExporter} = require('@opentelemetry/exporter-trace-otlp-grpc');
const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');
const {Resource} = require("@opentelemetry/resources");
const {SEMRESATTRS_SERVICE_NAME} = require("@opentelemetry/semantic-conventions");
const api = require('@opentelemetry/api');
const { CompositePropagator } = require('@opentelemetry/core');
const { B3Propagator, B3InjectEncoding } = require('@opentelemetry/propagator-b3');
import {Config} from './config';
const { MongooseInstrumentation } = require('@opentelemetry/instrumentation-mongoose');
import { SpanExporter, type ReadableSpan, SimpleSpanProcessor, BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
export const init = (config: Config) => {
    const apm_pause_traces = config.pauseTraces === true;

    if (!apm_pause_traces) {

        // Custom Span Processor to filter spans by service name
        class FilterSpanProcessor extends SimpleSpanProcessor {
            private excludedServices: string[];
            constructor(exporter: SpanExporter, excludedServices: string[]) {
                super(exporter);
                this.excludedServices = excludedServices;
            }

            onEnd(span: ReadableSpan) {
                const serviceName = span.resource.attributes[SEMRESATTRS_SERVICE_NAME] || "";
                
                // Only export spans that don't match the excluded service name
                if (typeof serviceName === "string" && !this.excludedServices.includes(serviceName)) {   
                    super.onEnd(span);
                }
            }
        }

        const traceExporter = new OTLPTraceExporter({
            url: config.target,
        });
        const excludedServices = process.env.MW_APM_EXCLUDED_SERVICES || "";
        const excludedServicesArray: string[] = excludedServices.split(',').map(item => item.trim());

        const sdk = new opentelemetry.NodeSDK({
            CompositePropagator: new CompositePropagator({
                propagators: [
                    new B3Propagator(),
                    new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
                ],
            }),
            spanProcessor: new FilterSpanProcessor(traceExporter, excludedServicesArray),
            traceExporter: traceExporter,
            instrumentations: [
                getNodeAutoInstrumentations({}),
                new GrpcInstrumentation({
                    ignoreGrpcMethods: ['Export'],
                }),
                new MongooseInstrumentation(),
            ],
        });

        sdk.addResource(
            new Resource({
                [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
                ['mw_agent']: true,
                ['project.name']: config.projectName,
                ['mw.account_key']: config.accessToken,
                ['mw_serverless']:config.isServerless ? 1 : 0,
                ...config.customResourceAttributes
            })
        );

        sdk.start();
    }
};

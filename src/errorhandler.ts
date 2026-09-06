// errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { context, trace, Span, SpanStatusCode } from "@opentelemetry/api";

/**
 * Records the error on the span and lets the SDK's
 * ExceptionStackDetailsSpanProcessor expand it: the processor parses
 * `exception.stacktrace` off the recorded event and attaches
 * `exception.stack_details` -- per-frame file/line/column/function metadata
 * plus the enclosing function's source -- before the span is exported.
 *
 * This handler is still needed for Express because
 * `@opentelemetry/instrumentation-express` 0.42 ends a route handler's layer
 * span *before* invoking the handler, so its own `recordException` lands on an
 * ended span and is dropped. Errors reaching here are recorded on the HTTP
 * span, which is still open.
 */
function recordException(span: Span, error: Error) {
    if (!span.isRecording()) return;

    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}


const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {

    const tracer = trace.getTracer("mw-tracer");
    const span = trace.getSpan(context.active());

    if (span) {
        recordException(span, err);
    } else {
        // If no active span, create a new one
        tracer.startActiveSpan(err.name, (span: any) => {
            recordException(span, err);
            span.end();
        });
    }
  
    // Determine status code
    const statusCode = err.statusCode || 
        (err.name === "ValidationError" ? 400 :
        err.name === "UnauthorizedError" ? 401 :
        err.name === "ForbiddenError" ? 403 :
        err.name === "NotFoundError" ? 404 :
        err.name === "ConflictError" ? 409 :
        err.name === "ServiceUnavailable" ? 503 : 500);
    
    res.status(statusCode).json({
        message: err.message || "An unexpected error occurred",
        status: statusCode,
    });
  };

export default errorHandler;

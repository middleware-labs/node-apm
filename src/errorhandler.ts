// errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import fs from "fs";
import path from "path";
import { context, trace, Span, SpanStatusCode } from "@opentelemetry/api";


// Extract function code from a stack trace file
function extractFunctionCode(filePath: string, lineNumber: number): { functionCode: string; startLine?: number; endLine?: number } {
    try {
        if (!fs.existsSync(filePath)) {
            return { functionCode: "Source file not found." };
        }

        const sourceLines = fs.readFileSync(filePath, "utf-8").split("\n");
        const totalLines = sourceLines.length;
        
        const startLine = Math.max(0, lineNumber - 10);
        const endLine = Math.min(totalLines, lineNumber + 10);

        const functionCode = sourceLines.slice(startLine, endLine).join("\n");

        return { functionCode, startLine, endLine };
    } catch (error) {
        return { functionCode: `Error extracting function code: ${error}` };
    }
}

// Custom function to record an exception
function customRecordException(span: Span, error: Error) {
    if (!span.isRecording()) return;

    const stackTrace = error.stack ? error.stack.split("\n").slice(1) : [];
    const stackInfo: any[] = [];

    stackTrace.forEach((line) => {
        let match = line.match(/\s*at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?/);
        if (match) {
            const [, functionName, filePath, lineNumber, columnNumber] = match;
            
            // Normalize filePath (resolve relative paths if necessary)
            const resolvedPath = filePath.startsWith("/") ? filePath : require.resolve(filePath);
    
            if (fs.existsSync(resolvedPath)) {
                const functionDetails = extractFunctionCode(resolvedPath, parseInt(lineNumber));
    
                stackInfo.push({
                    "exception.file": resolvedPath,
                    "exception.line": parseInt(lineNumber),
                    "exception.column_number": parseInt(columnNumber),
                    "exception.function_name": functionName || "anonymous",
                    "exception.function_body": functionDetails.functionCode,
                    "exception.start_line": functionDetails.startLine,
                    "exception.end_line": functionDetails.endLine,
                    "exception.is_file_internal": resolvedPath.includes("node_modules")
                });
            }
        }
    });

    const mwVCSCommitSha = process.env.MW_VCS_COMMIT_SHA || "";
    const mwVCSRepositoryUrl = process.env.MW_VCS_REPOSITORY_URL || "";

    // Add exception event to the span
    span.addEvent("exception", {
        "exception.type": error.name,
        "exception.message": error.message,
        "exception.stacktrace": error.stack || "",
        "exception.language": "nodejs",
        "exception.vcs.commit_sha": mwVCSCommitSha,
        "exception.vcs.repository_url": mwVCSRepositoryUrl,
        "exception.stack_details": JSON.stringify(stackInfo, null, 2),
    });

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}


const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {

    const tracer = trace.getTracer("mw-tracer");
    const span = trace.getSpan(context.active());

    if (span) {
        customRecordException(span, err);
    } else {
        // If no active span, create a new one
        tracer.startActiveSpan(err.name, (span: any) => {
            customRecordException(span, err);
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

import { Instrumentation } from "@opentelemetry/instrumentation";
import { Options } from "../payloadOptions";

import { isSpanContextValid } from "@opentelemetry/api";
import {
  HttpInstrumentationConfig,
  HttpRequestCustomAttributeFunction,
  HttpResponseCustomAttributeFunction,
} from "@opentelemetry/instrumentation-http";
import { ClientRequest, IncomingMessage, ServerResponse } from "http";
import { PayloadHandler } from "../payloadHandler";
import {
  addFlattenedObj,
  PayloadAttributes,
  SemanticAttributes,
} from "../payloadOptions";

export type ResponseEndArgs =
  | [((() => void) | undefined)?]
  | [unknown, ((() => void) | undefined)?]
  | [unknown, string, ((() => void) | undefined)?];

export function configureHttpInstrumentation(
  instrumentation: Instrumentation,
  options: Options
) {
  if (
    typeof instrumentation["setConfig"] !== "function" ||
    typeof instrumentation["getConfig"] !== "function"
  ) {
    return;
  }
  let config = instrumentation.getConfig() as HttpInstrumentationConfig;

  if (config === undefined) {
    config = {};
  }

  const responseHook = createHttpResponseHook(options);

  if (config.responseHook === undefined) {
    config.responseHook = responseHook;
  } else {
    const original = config.responseHook;
    config.responseHook = function (this: unknown, span, response) {
      responseHook(span, response);
      original.call(this, span, response);
    };
  }

  const requestHook = createHttpRequestHook(options);
  if (config.requestHook === undefined) {
    config.requestHook = requestHook;
  } else {
    const original = config.requestHook;
    config.requestHook = function (this: unknown, span, request) {
      requestHook(span, request);
      original.call(this, span, request);
    };
  }
  instrumentation.setConfig(config);
}

export function createHttpRequestHook(
  options: Options
): HttpRequestCustomAttributeFunction {
  return (span, request) => {
    const spanContext = span.spanContext();

    if (!isSpanContextValid(spanContext)) {
      return;
    }

    const headers =
      request instanceof IncomingMessage
        ? request.headers
        : request.getHeaders();

    addFlattenedObj(
      span,
      SemanticAttributes.HTTP_REQUEST_HEADER,
      headers,
      options
    );

    const bodyHandler = new PayloadHandler(
      options,
      headers["content-encoding"] as string
    );

    if (request.constructor.name === "ClientRequest") {
      const clientRequest = request as ClientRequest;
      //replace write function
      const originalWrite = clientRequest.write;
      clientRequest.write = function (chunk: any, callback) {
        bodyHandler.addChunk(chunk);
        // @ts-ignore
        return originalWrite.call(this, chunk, callback);
      };
      //replace end function
      const originalEnd = clientRequest.end;
      clientRequest.end = function (..._args: ResponseEndArgs) {
        //rollback 'write()' only after the end() function is called.
        clientRequest.write = originalWrite;
        clientRequest.end = originalEnd;
        // add the 'body' in case end(body) was called
        bodyHandler.addChunk(_args[0]);
        bodyHandler.setPayload(span, SemanticAttributes.HTTP_REQUEST_BODY);
        return clientRequest.end.apply(this, arguments as never);
      };
    } else if (request.constructor.name === "IncomingMessage") {
      // request body capture
      const listener = (chunk: any) => {
        bodyHandler.addChunk(chunk);
      };
      request.on("data", listener);

      request.prependOnceListener("end", () => {
        bodyHandler.setPayload(span, SemanticAttributes.HTTP_REQUEST_BODY);
        request.removeListener("data", listener);
      });
    }
  };
}

export function createHttpResponseHook(
  options: Options
): HttpResponseCustomAttributeFunction {
  return (span, response) => {
    const spanContext = span.spanContext();

    if (!isSpanContextValid(spanContext)) {
      return;
    }

    const headers =
      response instanceof IncomingMessage
        ? response.headers
        : response.getHeaders();

    addFlattenedObj(
      span,
      SemanticAttributes.HTTP_RESPONSE_HEADER,
      headers,
      options
    );

    const bodyHandler = new PayloadHandler(
      options,
      headers["content-encoding"] as string
    );

    //add http.response.body for the server response msg
    if (response.constructor.name === "ServerResponse") {
      const serverResponse = response as ServerResponse;
      const originalWrite = serverResponse.write;
      serverResponse.write = function (chunk: any, callback) {
        bodyHandler.addChunk(chunk);
        // @ts-ignore
        return originalWrite.call(this, chunk, callback);
      };

      const originalEnd = serverResponse.end;
      serverResponse.end = function (..._args: ResponseEndArgs) {
        //rollback 'write()' only after the end() function is called.
        serverResponse.write = originalWrite;
        serverResponse.end = originalEnd;
        // add the 'body' in case end(body) was called
        bodyHandler.addChunk(_args[0]);
        bodyHandler.setPayload(span, SemanticAttributes.HTTP_RESPONSE_BODY);
        return serverResponse.end.apply(this, arguments as never);
      };
    }

    //add http.response.body for the client incoming msg
    if (response.constructor.name === "IncomingMessage") {
      const listener = (chunk: any) => {
        bodyHandler.addChunk(chunk);
      };
      response.on("data", listener);

      response.prependOnceListener("end", () => {
        bodyHandler.setPayload(span, SemanticAttributes.HTTP_RESPONSE_BODY);
        response.removeListener("data", listener);
      });
    }
  };
}

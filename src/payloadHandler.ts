import { diag, Span } from "@opentelemetry/api";
import { addAttribute, Options } from "./payloadOptions";

export class PayloadHandler {
  private maxPayloadSize: number; // The size in bytes of the maximum payload capturing
  private currentBodySize: number; // The size in bytes of the current stream capture size
  // TODO: maybe add content encoding parsing in the future
  private totalChunks: any[];
  private isBufferString: boolean;
  public configoptions: Options;

  constructor(options: Options, contentEncoding?: string) {
    this.maxPayloadSize = options.maxPayloadSize;
    this.currentBodySize = 0;
    this.totalChunks = [];
    this.isBufferString = false;
    this.configoptions = options;
  }

  addChunk(chunk: any) {
    if (!chunk) {
      return;
    }
    try {
      this.isBufferString = typeof chunk === "string";

      const chunkSize = chunk.length;
      if (this.currentBodySize + chunkSize <= this.maxPayloadSize) {
        this.totalChunks.push(chunk);
      } else {
        this.totalChunks.push(chunk.slice(0, this.maxPayloadSize - chunkSize));
      }
    } catch (error) {
      diag.warn(`Could not add chunk ${chunk}, An error occurred: ${error}`);
    }
  }

  setPayload(span: Span, attrPrefix: string) {
    const options = this.configoptions
    if (this.isBufferString) {
      const body = this.totalChunks.join("");
      PayloadHandler.addPayloadToSpan(span, attrPrefix, body , options);
    } else {
      try {
        const buf = Buffer.concat(this.totalChunks);
        PayloadHandler.addPayloadToSpan(span, attrPrefix, buf , options);
      } catch (error) {
        diag.warn(
          `Could not concat the chunk array: ${this.totalChunks}, An error occurred: ${error}`
        );
      }
    }
  }

  static setPayload(
    span: Span,
    attrPrefix: string,
    payload: any,
    maxPayloadSize: number,
    options: Options
  ) {
    if (!payload) {
      return;
    }
    if (payload.length > maxPayloadSize) {
      PayloadHandler.addPayloadToSpan(
        span,
        attrPrefix,
        payload.slice(0, maxPayloadSize - payload.length),
        options
      );
    } else {
      PayloadHandler.addPayloadToSpan(span, attrPrefix, payload , options);
    }
  }

  private static addPayloadToSpan(span: Span, attrPrefix: string, chunk: any , options: Options) {
    try {
      addAttribute(span, attrPrefix, chunk.toString() , options);
    } catch (e) {
      diag.debug("Failed to parse the payload data");
      return;
    }
  }
}

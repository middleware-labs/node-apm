import { Span, Attributes, AttributeValue } from "@opentelemetry/api";

export interface Options {
  maxPayloadSize: number;
  payloadsEnabled: boolean;
}

let innerOptions: Partial<Options>;

export function setInnerOptions(options: Partial<Options>) {
  innerOptions = options;
}

export function getInnerOptions(): Partial<Options> {
  return innerOptions;
}

export function addAttributes(
  span: Span,
  attributes: Attributes,
  options: Options
) {
  for (const att in attributes) {
    addAttribute(span, att, JSON.stringify(attributes[att]), options);
  }
}

/** Wrapper for native setAttribute */
export function addAttribute(
  span: Span,
  attrPrefix: string,
  value: AttributeValue,
  options: Options
) {
  //const options = getInnerOptions();
  if (!options.payloadsEnabled && PayloadAttributes.has(attrPrefix)) return;
  span.setAttribute(attrPrefix, value);
}

export const SemanticAttributes = {
  /**
   * HTTP request header. This describes the prefix to HTTP headers capturing.
   */
  HTTP_REQUEST_HEADER: "http.request.header",

  /**
   * HTTP response header. This describes the prefix to HTTP headers capturing.
   */
  HTTP_RESPONSE_HEADER: "http.response.header",

  /**
   * HTTP message request body.
   */
  HTTP_REQUEST_BODY: "http.request.body",

  /**
   * HTTP message response body.
   */
  HTTP_RESPONSE_BODY: "http.response.body",
};

export const PayloadAttributes = new Set<string>([
  "http.request.header",
  "http.request.body",
  "http.response.header",
  "http.response.body",
]);

export function addFlattenedObj(
  span: Span,
  attrPrefix: string,
  obj: Object,
  options: Options
) {
  for (const key in obj) {
    // @ts-ignore
    const value = obj[key];

    if (value === undefined) {
      continue;
    }
    // const options = getInnerOptions();
    if (!options.payloadsEnabled && PayloadAttributes.has(attrPrefix)) return;
    // we don't call our addAttribute() because it checks again if the key is payload or not
    span.setAttribute(`${attrPrefix}.${key.toLocaleLowerCase()}`, value);
  }
}

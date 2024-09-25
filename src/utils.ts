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

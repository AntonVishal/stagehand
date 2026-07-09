export function formatError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown Stagehand failure";

  const parts = [error.message];
  const httpDetails = extractHttpErrorDetails(error);
  if (httpDetails) parts.push(httpDetails);

  if (error.cause) {
    const causeMessage = formatErrorCause(error.cause);
    if (causeMessage) parts.push(`Cause: ${causeMessage}`);
  }

  return parts.join(" ");
}

function formatErrorCause(cause: unknown) {
  if (cause instanceof Error) {
    const httpDetails = extractHttpErrorDetails(cause);
    return httpDetails ? `${cause.message} (${httpDetails})` : cause.message;
  }
  if (typeof cause === "string" && cause.trim()) return cause;
  return "";
}

function extractHttpErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return "";

  const record = error as Record<string, unknown>;
  const statusCode =
    typeof record.statusCode === "number" ? record.statusCode : undefined;
  const url = typeof record.url === "string" ? record.url : undefined;
  const responseBody =
    typeof record.responseBody === "string" ? record.responseBody.trim() : "";

  if (!statusCode && !url && !responseBody) return "";

  const statusText =
    typeof record.statusText === "string" ? record.statusText : undefined;
  const statusLabel = statusCode
    ? `HTTP ${statusCode}${statusText ? ` ${statusText}` : ""}`
    : statusText || "HTTP error";
  const location = url ? ` at ${url}` : "";
  const body = responseBody ? ` - ${truncate(responseBody, 240)}` : "";

  return `LLM request failed: ${statusLabel}${location}${body}`;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

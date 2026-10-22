type LogFields = Record<string, unknown>;

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    const extra = value as Error & { code?: unknown; status?: unknown; cause?: unknown };
    return {
      name: value.name,
      message: value.message,
      code: extra.code,
      status: extra.status,
      cause: extra.cause instanceof Error
        ? { name: extra.cause.name, message: extra.cause.message }
        : extra.cause,
      stack: value.stack,
    };
  }
  return value;
}

export function log(scope: string, message: string, fields?: LogFields): void {
  const stamp = new Date().toISOString();
  if (!fields || Object.keys(fields).length === 0) {
    console.log(`[${stamp}] [${scope}] ${message}`);
    return;
  }
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = serialize(value);
  }
  console.log(`[${stamp}] [${scope}] ${message}`, safe);
}

export function logError(scope: string, message: string, error: unknown, fields?: LogFields): void {
  log(scope, message, { ...fields, error });
}

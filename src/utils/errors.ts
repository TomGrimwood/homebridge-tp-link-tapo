// Network-level error codes that mean "the device is unreachable from
// here". These are expected during normal operation (devices get
// turned off, routers reboot, etc.) and should NOT be logged at
// error/warn level — they would spam the log with multi-page axios
// stack traces.
//
// Use isNetworkError() to gate noisy logging and isLikelyOffline() to
// also include device-side 5xx / connection-reset variants that look
// the same to a user.
const NETWORK_ERROR_CODES = new Set([
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN'
]);

export function getErrorCode(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') {
    return undefined;
  }
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code ?? err.cause?.code;
}

export function isNetworkError(e: unknown): boolean {
  const code = getErrorCode(e);
  return !!code && NETWORK_ERROR_CODES.has(code);
}

export function errorSummary(e: unknown): string {
  if (!e) {
    return 'unknown error';
  }
  if (e instanceof Error) {
    const code = getErrorCode(e);
    return code ? `${e.message} (${code})` : e.message;
  }
  return String(e);
}

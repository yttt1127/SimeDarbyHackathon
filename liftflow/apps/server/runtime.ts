import { createHash, timingSafeEqual } from 'node:crypto';

export interface RuntimeConfig {
  port: number;
  host: string;
  publicMode: boolean;
  allowedOrigins: Set<string>;
  operatorPasswordHash?: Buffer;
}

function configuredOrigin(value: string, name: string): string {
  let parsed: URL;
  try { parsed = new URL(value.trim()); }
  catch { throw new Error(`${name} must be a valid HTTPS URL`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error(`${name} must be a valid HTTPS URL without credentials, query or fragment`);
  return parsed.origin;
}

export function resolveRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const rawPort = env.PORT ?? '3001';
  if (!/^[0-9]+$/.test(rawPort)) throw new Error('PORT must be an integer from 1 to 65535');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const publicMode = Boolean(env.RENDER || env.RENDER_EXTERNAL_URL || env.LIFTFLOW_PUBLIC_MODE === '1');
  const allowedOrigins = new Set<string>();
  if (publicMode) {
    if (env.RENDER_EXTERNAL_URL) allowedOrigins.add(configuredOrigin(env.RENDER_EXTERNAL_URL, 'RENDER_EXTERNAL_URL'));
    if (env.LIFTFLOW_PUBLIC_ORIGIN) allowedOrigins.add(configuredOrigin(env.LIFTFLOW_PUBLIC_ORIGIN, 'LIFTFLOW_PUBLIC_ORIGIN'));
    if (!allowedOrigins.size) throw new Error('Public mode requires RENDER_EXTERNAL_URL or LIFTFLOW_PUBLIC_ORIGIN');
    if (!env.LIFTFLOW_OPERATOR_PASSWORD || env.LIFTFLOW_OPERATOR_PASSWORD.length < 16)
      throw new Error('Public mode requires LIFTFLOW_OPERATOR_PASSWORD of at least 16 characters');
  } else {
    for (const hostname of ['127.0.0.1', 'localhost']) {
      allowedOrigins.add(`http://${hostname}:${port}`);
      allowedOrigins.add(`http://${hostname}:5173`);
    }
  }
  return { port, host: publicMode ? '0.0.0.0' : '127.0.0.1', publicMode, allowedOrigins,
    operatorPasswordHash: publicMode ? createHash('sha256').update(env.LIFTFLOW_OPERATOR_PASSWORD!).digest() : undefined };
}

export function checkOrigin(origin: string | undefined, config: RuntimeConfig): boolean {
  if (origin === undefined) return true; // Non-browser clients still need a valid session and operator grant.
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && config.allowedOrigins.has(parsed.origin);
  } catch { return false; }
}

export function checkOperatorPassword(value: string, config: RuntimeConfig): boolean {
  if (!config.operatorPasswordHash) return !config.publicMode;
  const attempt = createHash('sha256').update(value).digest();
  return timingSafeEqual(attempt, config.operatorPasswordHash);
}

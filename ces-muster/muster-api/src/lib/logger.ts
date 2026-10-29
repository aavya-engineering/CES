// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// logger.ts — Sprint 2 (LOG-01): the one structured logger for muster-api.
//
//   import { logger } from '../lib/logger.js';
//   logger.info({ tenantId }, 'engagement created');
//   const log = logger.child({ module: 'scheduler' });
//
// Configuration (docs/ENVIRONMENTS.md):
//   LOG_LEVEL   debug | info | warn | error   (default: debug in development, info otherwise)
//   LOG_FORMAT  pretty | json                 (default: pretty in development, json otherwise)
//   CES_ENV     development | staging | production  (stamped on every line as "env")
//
// Secrets are never logged: the keys below are redacted wherever they appear in
// a log object (NIST SP 800-171 3.3.8 / 3.5.10 — audit information and
// passwords are protected). Tests run silent (level "silent" when VITEST=1)
// unless LOG_LEVEL is set explicitly.
import pino, { type Logger, type LoggerOptions } from 'pino';

export type LogFormat = 'pretty' | 'json';

/** Paths redacted from every log line (pino redact syntax; '*' = any key at that level). */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'password_hash',
  '*.password_hash',
  'token',
  '*.token',
  'authorization',
  'cookie',
  'set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'DATABASE_URL',
  'SMTP_URL',
  'MUSTER_SMTP_URL',
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'client_secret',
  '*.client_secret',
];

export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LOG_LEVEL) return env.LOG_LEVEL;
  if (env.VITEST) return 'silent';
  return env.CES_ENV === 'development' || env.NODE_ENV === 'development' ? 'debug' : 'info';
}

export function resolveLogFormat(env: NodeJS.ProcessEnv = process.env): LogFormat {
  if (env.LOG_FORMAT === 'pretty' || env.LOG_FORMAT === 'json') return env.LOG_FORMAT;
  return env.CES_ENV === 'development' || env.NODE_ENV === 'development' ? 'pretty' : 'json';
}

export function loggerOptions(env: NodeJS.ProcessEnv = process.env): LoggerOptions {
  const format = resolveLogFormat(env);
  const opts: LoggerOptions = {
    level: resolveLogLevel(env),
    base: {
      service: 'muster-api',
      env: env.CES_ENV ?? env.NODE_ENV ?? 'development',
      version: env.CES_VERSION ?? undefined,
    },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  if (format === 'pretty') {
    // pino-pretty is a devDependency; in production LOG_FORMAT=json so it is never required.
    opts.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,env,version' },
    };
  }
  return opts;
}

export function createLogger(env: NodeJS.ProcessEnv = process.env): Logger {
  return pino(loggerOptions(env));
}

/** Process-wide logger. Create children with `logger.child({ module: '…' })`. */
export const logger: Logger = createLogger();

export type { Logger };

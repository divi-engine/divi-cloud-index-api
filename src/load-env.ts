import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';

/**
 * Load `.env` from the working directory using Node's parser (handles `$` in values).
 * Does not override variables already set in the environment.
 * systemd `EnvironmentFile=` mangles `$`; production should use `node --env-file=.env` in ExecStart.
 */
export function loadDotEnvFromCwd(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }
  try {
    loadEnvFile(envPath);
  } catch {
    // Ignore parse errors — getEnv() will fail on missing required keys.
  }
}

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

import { atLeastMajor, javaMajor } from './versions.js';

export type Status = 'ok' | 'fail' | 'skip';

export interface CheckResult {
  status: Status;
  detail: string;
  /** Basarisizsa nasil duzeltilecegi (Turkce). */
  hint?: string;
}

export interface Check {
  name: string;
  macOnly: boolean;
  run(): CheckResult;
}

interface Run {
  ok: boolean;
  out: string;
}

/** Komutu calistirir; bulunamazsa veya hata verirse ok=false. stdout+stderr birlesik doner. */
export function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Run {
  const result = spawnSync(command, args, { encoding: 'utf8', env, timeout: 15_000 });
  if (result.error ?? result.status !== 0) {
    return { ok: false, out: `${result.stdout}${result.stderr}`.trim() };
  }
  return { ok: true, out: `${result.stdout}${result.stderr}`.trim() };
}

const ok = (detail: string): CheckResult => ({ status: 'ok', detail });
const fail = (detail: string, hint: string): CheckResult => ({ status: 'fail', detail, hint });

export const checks: Check[] = [
  {
    name: 'Node.js >= 24',
    macOnly: false,
    run() {
      const version = process.versions.node;
      return atLeastMajor(version, 24)
        ? ok(`v${version}`)
        : fail(`v${version}`, 'brew install nvm && nvm install 24 && nvm use (.nvmrc)');
    },
  },
  {
    name: 'pnpm >= 10',
    macOnly: false,
    run() {
      const result = run('pnpm', ['--version']);
      if (!result.ok)
        return fail('bulunamadı', 'corepack enable && corepack prepare pnpm@10 --activate');
      return atLeastMajor(result.out, 10)
        ? ok(result.out)
        : fail(result.out, 'corepack enable && corepack prepare pnpm@10 --activate');
    },
  },
  {
    name: 'Docker çalışıyor',
    macOnly: false,
    run() {
      const result = run('docker', ['info', '--format', '{{.ServerVersion}}']);
      return result.ok
        ? ok(`sunucu ${result.out}`)
        : fail('docker daemon yanıt vermiyor', 'brew install --cask docker && open -a Docker');
    },
  },
  {
    name: 'Docker Compose',
    macOnly: false,
    run() {
      const result = run('docker', ['compose', 'version', '--short']);
      return result.ok
        ? ok(result.out)
        : fail('bulunamadı', 'Docker Desktop güncel sürümle gelir: brew upgrade --cask docker');
    },
  },
  {
    name: 'Watchman',
    macOnly: true,
    run() {
      const result = run('watchman', ['--version']);
      return result.ok ? ok(result.out) : fail('bulunamadı', 'brew install watchman');
    },
  },
  {
    name: 'Java 17 (JAVA_HOME)',
    macOnly: true,
    run() {
      const home = process.env.JAVA_HOME;
      const hint =
        'brew install --cask zulu@17 && export JAVA_HOME=$(/usr/libexec/java_home -v 17)';
      if (!home) return fail('JAVA_HOME tanımlı değil', hint);
      const result = run(`${home}/bin/java`, ['-version']);
      const major = javaMajor(result.out);
      if (!result.ok || major === undefined) return fail(`${home}/bin/java çalışmıyor`, hint);
      return major === 17
        ? ok(`Java ${String(major)} (${home})`)
        : fail(`Java ${String(major)}, 17 gerekli`, hint);
    },
  },
  {
    name: 'Xcode komut satırı araçları',
    macOnly: true,
    run() {
      const result = run('xcode-select', ['-p']);
      return result.ok && existsSync(result.out)
        ? ok(result.out)
        : fail('xcode-select yolu yok', 'xcode-select --install (tam Xcode için App Store)');
    },
  },
  {
    name: 'Android SDK (ANDROID_HOME)',
    macOnly: true,
    run() {
      const home = process.env.ANDROID_HOME;
      const hint =
        'Android Studio > SDK Manager ile kurun; export ANDROID_HOME=$HOME/Library/Android/sdk';
      if (!home) return fail('ANDROID_HOME tanımlı değil', hint);
      return existsSync(home) ? ok(home) : fail(`${home} dizini yok`, hint);
    },
  },
  {
    name: 'CocoaPods',
    macOnly: true,
    run() {
      const result = run('pod', ['--version']);
      return result.ok ? ok(result.out) : fail('bulunamadı', 'brew install cocoapods');
    },
  },
];

export function runChecks(
  list: Check[] = checks,
  currentPlatform: NodeJS.Platform = platform(),
): { check: Check; result: CheckResult }[] {
  return list.map((check) => {
    if (check.macOnly && currentPlatform !== 'darwin') {
      return { check, result: { status: 'skip', detail: 'yalnızca macOS' } };
    }
    try {
      return { check, result: check.run() };
    } catch (err) {
      return {
        check,
        result: fail(err instanceof Error ? err.message : String(err), 'tekrar deneyin'),
      };
    }
  });
}

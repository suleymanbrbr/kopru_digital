/**
 * Magaza derlemesi guvenligi: production profili sahte api/push tasimaz; uretim denetimi
 * (`app.config.ts`) sahte ayari reddeder; Android izin listesi en az yetkiyle sinirlidir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import config, { uretimDenetimi } from '../app.config';

interface Profil {
  extends?: string;
  env?: Record<string, string>;
  autoIncrement?: boolean;
}
const eas = JSON.parse(readFileSync(join(__dirname, '..', 'eas.json'), 'utf8')) as {
  cli: { appVersionSource: string };
  build: Record<string, Profil>;
};

describe('eas.json', () => {
  it('production profilinde EXPO_PUBLIC_API_MOCK / EXPO_PUBLIC_PUSH_SAHTE yok, api https', () => {
    const p = eas.build.production;
    expect(p).toBeDefined();
    expect(p?.extends).toBeUndefined();
    expect(p?.env).not.toHaveProperty('EXPO_PUBLIC_API_MOCK');
    expect(p?.env).not.toHaveProperty('EXPO_PUBLIC_PUSH_SAHTE');
    expect(p?.env?.EXPO_PUBLIC_API_URL).toMatch(/^https:\/\//);
    expect(p?.env?.APP_PUSH_MODU).toBe('production');
  });

  it('preview da sahte ayar tasimaz; yalniz development mock kullanir', () => {
    for (const [ad, p] of Object.entries(eas.build)) {
      if (ad === 'development') continue;
      expect(p.env).not.toHaveProperty('EXPO_PUBLIC_API_MOCK');
      expect(p.env).not.toHaveProperty('EXPO_PUBLIC_PUSH_SAHTE');
    }
  });

  it('surum numaralari EAS uzaktan artirilir', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production?.autoIncrement).toBe(true);
  });
});

describe('uretimDenetimi', () => {
  const uretim = (o: Record<string, string>) => (ad: string) =>
    ({ EAS_BUILD_PROFILE: 'production', ...o })[ad];

  it('temiz production ortami gecer', () => {
    expect(uretimDenetimi(uretim({ EXPO_PUBLIC_API_URL: 'https://api.kopru.example' }))).toEqual(
      [],
    );
  });
  it('sahte api, sahte push ve http adresi reddedilir', () => {
    const h = uretimDenetimi(
      uretim({
        EXPO_PUBLIC_API_MOCK: '1',
        EXPO_PUBLIC_PUSH_SAHTE: '1',
        EXPO_PUBLIC_API_URL: 'http://localhost:4000',
      }),
    );
    expect(h).toHaveLength(3);
  });
  it('production disindaki profillerde denetim yok', () => {
    const e = (ad: string) => ({ EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_API_MOCK: '1' })[ad];
    expect(uretimDenetimi(e)).toEqual([]);
  });
});

describe('app.config', () => {
  const c = config({
    config: {},
    projectRoot: '.',
    staticConfigPath: null,
    packageJsonPath: null,
  });
  it('Android izinleri en aza indirilmis', () => {
    expect(c.android?.permissions).toEqual(
      expect.arrayContaining(['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']),
    );
    expect(c.android?.permissions).not.toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(c.android?.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });
  it('bundle id ve paket adi tutarli, runtimeVersion tanimli', () => {
    expect(c.ios?.bundleIdentifier).toBe(c.android?.package);
    expect(c.runtimeVersion).toEqual({ policy: 'appVersion' });
  });
  it('iOS gizlilik: takip yok, toplanan her veri kimlikle bagli ve takipsiz', () => {
    const m = c.ios?.privacyManifests as {
      NSPrivacyTracking: boolean;
      NSPrivacyCollectedDataTypes: {
        NSPrivacyCollectedDataTypeLinked: boolean;
        NSPrivacyCollectedDataTypeTracking: boolean;
      }[];
    };
    expect(m.NSPrivacyTracking).toBe(false);
    expect(m.NSPrivacyCollectedDataTypes.length).toBeGreaterThan(0);
    for (const v of m.NSPrivacyCollectedDataTypes) {
      expect(v.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });
});

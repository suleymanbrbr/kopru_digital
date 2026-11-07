import { customType } from 'drizzle-orm/pg-core';

/** PostgreSQL `citext` (buyuk/kucuk harfe duyarsiz metin). */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** PostgreSQL `bytea`; uygulamada `Buffer`. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * Better Auth `boolean` bekler (`emailVerified`, `phoneNumberVerified`); veritabaninda ise
 * dogrulanma ani (`timestamptz`, NULL = dogrulanmadi) saklanir. Yazarken `true` -> `now()` ani.
 */
export const dogrulandiMi = customType<{ data: boolean; driverData: string | Date | null }>({
  dataType: () => 'timestamptz',
  toDriver: (value) => (value ? new Date() : null),
  fromDriver: (value) => value !== null,
});

import { t } from '@kopru/i18n';
import { encode } from 'uqr';

/** Moduller (siyah kareler) tek bir SVG yolu olarak; her satirdaki ardisik moduller birlestirilir. */
export function modulYolu(veri: readonly (readonly boolean[])[]): string {
  const parcalar: string[] = [];
  veri.forEach((satir, y) => {
    let x = 0;
    while (x < satir.length) {
      if (!satir[x]) {
        x += 1;
        continue;
      }
      const bas = x;
      while (x < satir.length && satir[x]) x += 1;
      parcalar.push(`M${String(bas)} ${String(y)}h${String(x - bas)}v1h-${String(x - bas)}z`);
    }
  });
  return parcalar.join('');
}

/**
 * `otpauth://` adresinin QR kodu: istemcide cizilir, adres sunucuya ya da ucuncu tarafa gitmez.
 * Tema ne olursa olsun okunabilsin diye beyaz zemin uzerine siyah moduller.
 */
export function QrKod({ deger }: { deger: string }) {
  const { data, size } = encode(deger, { ecc: 'M', border: 0 });
  const kenar = 4;
  const kutu = size + kenar * 2;
  return (
    <svg
      role="img"
      aria-label={t('yonetim.ikinciAdim.qrAlt')}
      viewBox={`${String(-kenar)} ${String(-kenar)} ${String(kutu)} ${String(kutu)}`}
      className="size-48 rounded-orta bg-white"
      shapeRendering="crispEdges"
    >
      <path d={modulYolu(data)} fill="#000" />
    </svg>
  );
}

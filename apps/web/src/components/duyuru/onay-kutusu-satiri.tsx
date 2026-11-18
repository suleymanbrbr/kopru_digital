import { OnayKutusu } from '@/components/ui/checkbox';

/** Etiketli onay kutusu satiri (etiket tiklanabilir; en az 44 px yuksek hedef). */
export function OnayKutusuSatiri({
  id,
  etiket,
  aciklama,
  secili,
  degisti,
}: {
  id: string;
  etiket: string;
  aciklama?: string;
  secili: boolean;
  degisti: (secili: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 py-1.5">
      <OnayKutusu
        id={id}
        checked={secili}
        aria-describedby={aciklama ? `${id}-aciklama` : undefined}
        onCheckedChange={(c) => {
          degisti(c === true);
        }}
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {etiket}
        </label>
        {aciklama ? (
          <span id={`${id}-aciklama`} className="text-sm text-metin-ikincil">
            {aciklama}
          </span>
        ) : null}
      </div>
    </div>
  );
}

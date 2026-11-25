#!/usr/bin/env bash
# Depoda gercek sir (anahtar, belirtec, ozel anahtar) kalmadigini denetler (gitleaks benzeri basit regex taramasi).
# Kullanim: infra/scripts/sir-taramasi.sh  (kokten; izlenen dosyalari tarar). Bulgu varsa 1 ile cikar.
# Bilincli yer tutucu/test degeri icin satira `sir-taramasi:izin` yorumu eklenir ya da dosya IZINLI_YOLLAR'dadir.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Test/ornek verisi ve kilit dosyalari taranmaz; .env.example ayrica asagida ozel denetlenir.
IZINLI_YOLLAR='(^|/)(pnpm-lock\.yaml|.*\.test\.tsx?|.*\.spec\.ts|.*-mock\.ts|.*\.lock)$|(^|/)(e2e|e2e-gercek|__tests__|generated)/|^docs/'

DESENLER=(
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN ((RSA|EC|OPENSSH|DSA|PGP) )?PRIVATE KEY'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  'gh[pousr]_[0-9A-Za-z]{36,}'
  'sk_live_[0-9A-Za-z]{16,}'
  'AIza[0-9A-Za-z_-]{35}'
  'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}'
  '(secret|password|passwd|parola|sifre|token|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/_=-]{24,}["'"'"']'
)

bulgu=0
dosyalar=$(git ls-files | grep -Ev "$IZINLI_YOLLAR" || true)
for desen in "${DESENLER[@]}"; do
  # shellcheck disable=SC2086
  eslesen=$(printf '%s\n' "$dosyalar" | xargs grep -InE "$desen" 2>/dev/null | grep -v 'sir-taramasi:izin' | grep -v 'infra/scripts/sir-taramasi.sh' \
    | grep -Ev "[:=][[:space:]]*[\"'][a-z_.-]+[\"']" || true)
  if [ -n "$eslesen" ]; then
    echo "SIR ADAYI ($desen):"
    echo "$eslesen" | sed 's/^/  /'
    bulgu=1
  fi
done

# .env.example: gercek gibi gorunen uzun deger olmamali (yer tutucu/gelistirme degerleri kisa ve bellidir).
if [ -f .env.example ]; then
  uzun=$(grep -nE '^[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|KEY|SIR)[A-Z0-9_]*=[^[:space:]#]{32,}' .env.example | grep -v 'sir-taramasi:izin' || true)
  if [ -n "$uzun" ]; then
    echo ".env.example icinde gercek gibi gorunen uzun deger:"
    echo "$uzun" | sed 's/^/  /'
    bulgu=1
  fi
fi

if [ "$bulgu" -ne 0 ]; then
  echo "Sir taramasi BASARISIZ. Gercek sirri depodan cikarin ve DONDURUN (rotate)." >&2
  exit 1
fi
echo "Sir taramasi temiz."

#!/usr/bin/env bash
# Servisleri Kamal ile sirayla dagitir. Her servisin goc adimi kendi pre-deploy hook'unda calisir
# (.kamal/hooks/pre-deploy); bir servisin gocu ya da saglik denetimi basarisizsa sonrakilere gecilmez.
#
# Sira onemlidir: api (hesap olaylari, JWKS) -> motivasyon -> bildirim -> medya -> web -> admin.
#
# Kullanim (repo kokunden, kamal kurulu ve .kamal/secrets.<hedef> hazir):
#   infra/scripts/dagit.sh staging                 # hepsi, sirayla
#   infra/scripts/dagit.sh production api web      # yalniz belirtilenler, verilen sirayla
set -euo pipefail

hedef="${1:?Kullanim: dagit.sh <staging|production> [servis...]}"
shift
case "$hedef" in staging | production) ;; *) echo "hedef staging ya da production olmali" >&2; exit 2 ;; esac

if [ "$#" -eq 0 ]; then
  set -- api motivasyon bildirim medya web admin
fi

for servis in "$@"; do
  case "$servis" in api | motivasyon | bildirim | medya | web | admin) ;; *) echo "bilinmeyen servis: $servis" >&2; exit 2 ;; esac
  echo "=== $servis -> $hedef"
  KOPRU_SERVIS="$servis" kamal deploy -d "$hedef"
done
echo "bitti: $*"

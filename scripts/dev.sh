#!/usr/bin/env bash
# Siteyi yerelde kurup http://localhost:8000 adresinde açar.
#   scripts/dev.sh          -> ÖRNEK (rastgele) veriyle, internet gerekmez
#   scripts/dev.sh --real   -> Yahoo Finance'ten gerçek veriyle
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--real" ]]; then
  python3 scripts/fetch_data.py --out site
else
  python3 scripts/fetch_data.py --out site --sample
fi
cp -r web/. site/
echo "Açın: http://localhost:8000"
python3 -m http.server 8000 -d site

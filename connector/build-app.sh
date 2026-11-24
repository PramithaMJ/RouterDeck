#!/usr/bin/env bash
# Builds "RouterDeck Connect": a double-clickable, single-file app (Node SEA)
# for the current OS. Used by .github/workflows/release.yml and locally.
#   ./build-app.sh <output-name>
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-RouterDeck-Connect}"
mkdir -p dist
npx --yes esbuild@0.25 routerdeck-connector.mjs --bundle --platform=node --format=cjs --target=node22 --outfile=dist/connector.cjs --log-level=warning
cat > dist/sea-config.json <<JSON
{ "main": "dist/connector.cjs", "output": "dist/sea-prep.blob", "disableExperimentalSEAWarning": true }
JSON
node --experimental-sea-config dist/sea-config.json
case "$(uname -s)" in
  Darwin)
    cp "$(node -p process.execPath)" "dist/$OUT"
    codesign --remove-signature "dist/$OUT"
    npx --yes postject@1.0.0-alpha.6 "dist/$OUT" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
    codesign --sign - "dist/$OUT"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    cp "$(node -p process.execPath)" "dist/$OUT.exe"
    npx --yes postject@1.0.0-alpha.6 "dist/$OUT.exe" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    ;;
  *)
    cp "$(node -p process.execPath)" "dist/$OUT"
    npx --yes postject@1.0.0-alpha.6 "dist/$OUT" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    ;;
esac
echo "built dist/$OUT"

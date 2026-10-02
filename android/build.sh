#!/usr/bin/env bash
set -euo pipefail
# Requires Android SDK Build Tools 35, API 35 platform, Java 17+ and javac or ECJ.
# SILI_BUILD_TOOLS=/.../35.0.0 SILI_ANDROID_JAR=/.../android.jar SILI_ECJ=/.../ecj.jar bash build.sh
cd "$(dirname "$0")"
: "${SILI_BUILD_TOOLS:?Set Android build-tools path}"
: "${SILI_ANDROID_JAR:?Set Android platform android.jar path}"
: "${SILI_KEYSTORE:?Set path to existing PRIVATE keystore outside the repository}"
: "${SILI_KEY_PASSWORD_FILE:?Set path to PRIVATE password file outside the repository}"
python3 - "$SILI_KEYSTORE" "$SILI_KEY_PASSWORD_FILE" <<'PY'
from pathlib import Path
import sys
root=Path('..').resolve()
for name in sys.argv[1:]:
    p=Path(name).resolve()
    if not p.is_file() or p.is_relative_to(root):
        raise SystemExit('Signing files must exist OUTSIDE the repository. Never upload them.')
PY
rm -rf build/classes build/dex
mkdir -p build/classes build/dex ../dist
if [ -n "${SILI_ECJ:-}" ]; then
  java -jar "$SILI_ECJ" -8 -encoding UTF-8 -classpath "$SILI_ANDROID_JAR" -d build/classes src/app/sili/library/*.java
else
  javac -source 8 -target 8 -encoding UTF-8 -classpath "$SILI_ANDROID_JAR" -d build/classes src/app/sili/library/*.java
fi
"$SILI_BUILD_TOOLS/aapt2" compile --dir res -o build/resources.zip
"$SILI_BUILD_TOOLS/aapt2" link -o build/unsigned.apk -I "$SILI_ANDROID_JAR" --manifest AndroidManifest.xml build/resources.zip --min-sdk-version 26 --target-sdk-version 35
find build/classes -name '*.class' -print0 | xargs -0 "$SILI_BUILD_TOOLS/d8" --lib "$SILI_ANDROID_JAR" --min-api 26 --output build/dex
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
    z.write('build/dex/classes.dex','classes.dex')
PY
"$SILI_BUILD_TOOLS/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$SILI_BUILD_TOOLS/apksigner" sign --ks "$SILI_KEYSTORE" --ks-key-alias "${SILI_KEY_ALIAS:-sili-library}" --ks-pass "file:$SILI_KEY_PASSWORD_FILE" --out ../dist/silly-bookshop-0.3.1-test.1.apk build/aligned.apk
"$SILI_BUILD_TOOLS/apksigner" verify --verbose ../dist/silly-bookshop-0.3.1-test.1.apk

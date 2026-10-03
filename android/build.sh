#!/usr/bin/env bash
set -euo pipefail
# Requires Android SDK Build Tools 35, API 35 platform, Java 17+ and javac or ECJ.
# SILLY_BUILD_TOOLS=/.../35.0.0 SILLY_ANDROID_JAR=/.../android.jar SILLY_ECJ=/.../ecj.jar bash build.sh
cd "$(dirname "$0")"
: "${SILLY_BUILD_TOOLS:?Set Android build-tools path}"
: "${SILLY_ANDROID_JAR:?Set Android platform android.jar path}"
: "${SILLY_KEYSTORE:?Set path to existing PRIVATE keystore outside the repository}"
: "${SILLY_KEY_PASSWORD_FILE:?Set path to PRIVATE password file outside the repository}"
python3 - "$SILLY_KEYSTORE" "$SILLY_KEY_PASSWORD_FILE" <<'PY'
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
python3 - <<'ASSETS'
from pathlib import Path
import shutil
p=Path('build/assets/offline')
if p.exists():shutil.rmtree(p)
p.mkdir(parents=True)
for f in Path('offline').iterdir():shutil.copy2(f,p/f.name)
for name in ['rich.js','style.css']:shutil.copy2(Path('../server/public')/name,p/name)
shutil.copytree('../server/public/fonts',p/'fonts')
ASSETS
if [ -n "${SILLY_ECJ:-}" ]; then
  java -jar "$SILLY_ECJ" -8 -encoding UTF-8 -classpath "$SILLY_ANDROID_JAR" -d build/classes src/app/silly/bookshop/*.java
else
  javac -source 8 -target 8 -encoding UTF-8 -classpath "$SILLY_ANDROID_JAR" -d build/classes src/app/silly/bookshop/*.java
fi
"$SILLY_BUILD_TOOLS/aapt2" compile --dir res -o build/resources.zip
"$SILLY_BUILD_TOOLS/aapt2" link -o build/unsigned.apk -I "$SILLY_ANDROID_JAR" --manifest AndroidManifest.xml -A build/assets build/resources.zip --min-sdk-version 26 --target-sdk-version 35
find build/classes -name '*.class' -print0 | xargs -0 "$SILLY_BUILD_TOOLS/d8" --lib "$SILLY_ANDROID_JAR" --min-api 26 --output build/dex
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
    z.write('build/dex/classes.dex','classes.dex')
PY
"$SILLY_BUILD_TOOLS/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$SILLY_BUILD_TOOLS/apksigner" sign --ks "$SILLY_KEYSTORE" --ks-pass "file:$SILLY_KEY_PASSWORD_FILE" --out ../dist/silly-bookshop-0.7.1-test.1.apk build/aligned.apk
"$SILLY_BUILD_TOOLS/apksigner" verify --verbose ../dist/silly-bookshop-0.7.1-test.1.apk

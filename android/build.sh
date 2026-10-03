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
# Android tools use mmap output; keep all generated binaries on the native temp filesystem.
build_work="$(mktemp -d "${TMPDIR:-/tmp}/silly-bookshop-build.XXXXXX")"
trap 'rm -rf "$build_work"' EXIT
mkdir -p "$build_work/classes" "$build_work/dex" ../dist
python3 - <<'ASSETS'
from pathlib import Path
import shutil
p=Path('build/assets/offline')
if p.exists():shutil.rmtree(p)
p.mkdir(parents=True)
for f in Path('offline').iterdir():shutil.copy2(f,p/f.name)
for name in ['rich.js','style.css','pickers.js']:shutil.copy2(Path('../server/public')/name,p/name)
shutil.copytree('../server/public/fonts',p/'fonts')
ASSETS
if [ -n "${SILLY_ECJ:-}" ]; then
  java -jar "$SILLY_ECJ" -8 -encoding UTF-8 -classpath "$SILLY_ANDROID_JAR" -d "$build_work/classes" src/app/silly/bookshop/*.java
else
  javac -source 8 -target 8 -encoding UTF-8 -classpath "$SILLY_ANDROID_JAR" -d "$build_work/classes" src/app/silly/bookshop/*.java
fi
"$SILLY_BUILD_TOOLS/aapt2" compile --dir res -o "$build_work/resources.zip"
"$SILLY_BUILD_TOOLS/aapt2" link -o "$build_work/unsigned.apk" -I "$SILLY_ANDROID_JAR" --manifest AndroidManifest.xml -A build/assets "$build_work/resources.zip" --min-sdk-version 26 --target-sdk-version 35
find "$build_work/classes" -name '*.class' -print0 | xargs -0 "$SILLY_BUILD_TOOLS/d8" --lib "$SILLY_ANDROID_JAR" --min-api 26 --output "$build_work/dex"
python3 - "$build_work/unsigned.apk" "$build_work/dex/classes.dex" <<'PY'
import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'a',compression=zipfile.ZIP_DEFLATED) as z:
    assert 'AndroidManifest.xml' in z.namelist(), 'Android resources missing'
    z.write(sys.argv[2],'classes.dex')
PY
"$SILLY_BUILD_TOOLS/zipalign" -f 4 "$build_work/unsigned.apk" "$build_work/aligned.apk"
signed_apk="$build_work/signed.apk"
"$SILLY_BUILD_TOOLS/apksigner" sign --ks "$SILLY_KEYSTORE" --ks-pass "file:$SILLY_KEY_PASSWORD_FILE" --out "$signed_apk" "$build_work/aligned.apk"
cp "$signed_apk" ../dist/silly-bookshop-0.9.3-test.1.apk
"$SILLY_BUILD_TOOLS/apksigner" verify --verbose ../dist/silly-bookshop-0.9.3-test.1.apk

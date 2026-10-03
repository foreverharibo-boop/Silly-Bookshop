# 깃허브 업로드와 APK 배포

## 공개 저장소에 올릴 것

`silly-bookshop-github-0.8.1-test.1.zip`을 압축 해제한 **silly-bookshop 폴더 안의 내용**을 업로드합니다. 저장소의 최상위에 `package.json`이 있어야 합니다. ZIP 파일만 올리거나 폴더를 한 단계 더 감싸면 플러그인으로 바로 로드되지 않습니다.

이 ZIP에는 앱 서명 키, 암호 파일, 채팅, 실리 설정, 사용자 인증 파일, APK, 과거 Git 이력이 포함되지 않습니다. `.gitignore`만 믿지 않고 공개 파일 허용 목록을 기준으로 생성합니다.

APK는 별도의 **GitHub Releases 첨부 파일**로 올립니다. 현재는 테스트 단계이므로 실기 테스트 후 pre-release로 공유하세요. 정식 출시와 저장소 공개는 별도 결정이며 자동 업로드/태그 생성 워크플로는 넣지 않았습니다.

저장소 이름은 `silly-bookshop`을 권장합니다. 설치 폴더는 `plugins/silly-bookshop`입니다. 앱 패키지 `app.silly.bookshop`, API 주소 `/api/plugins/silly-bookshop/`, 데이터 폴더 `.silly-bookshop`을 사용합니다.

## 공개 전 검사

```sh
npm test
python3 scripts/package-public.py --check
python3 scripts/package-public.py
```

필요한 프로그램은 Node.js 18+, Python 3.9+입니다. 검사기는 공개 허용 목록 밖의 파일, 심볼릭 링크, 키/암호/개인 채팅 파일명, 대표적인 토큰/개인 키 패턴을 만나면 중단합니다. **모든 형태의 비밀을 탐지하는 도구는 아니므로** README나 테스트에 개인 내용을 직접 추가하지 마세요. 생성한 공개 ZIP과 SHA256SUMS는 `dist/`에 나옵니다. 전체 작업 폴더를 임의로 다시 ZIP으로 만들지 마세요.

이미 Git을 사용한다면 업로드 전에 `git status --short`와 `git diff --cached`로 실제 올라갈 파일을 확인합니다. 과거에 키를 커밋했다면 나중에 `.gitignore`를 추가하는 것으로 과거 이력이 지워지지 않습니다. 이 묶음은 새 공개용 소스여서 이전 개인용 폴더의 `.git`을 복사하지 않아야 합니다.

## 앱 서명 키 보관

별도 제공된 `silly-bookshop-signing-PRIVATE-DO-NOT-UPLOAD.zip` 또는 예전 개인용 ZIP의 `android/signing/release.p12`와 `password.txt`는 **깃허브 밖 개인 보관소**에 보관하세요. 개인 보관용 ZIP은 저장소나 Releases에 올리지 않습니다. 제공한 새 APK는 같은 키로 서명해서 기존 앱에 업데이트할 수 있습니다. 키 파일을 잃으면 같은 앱으로 업데이트하기 어렵습니다. 이미 공개한 적 있는 키는 새 정식 배포에 재사용하지 마세요.

빌드 스크립트는 이제 저장소 안에 키를 만들지 않습니다. 저장소 밖 기존 키 경로를 명시하지 않으면 빌드를 중단합니다. 공개 CI에 키나 암호를 하드코딩하지 마세요. 배포 서명은 신뢰하는 로컬 환경에서 수행하세요.

## APK 직접 빌드

Android SDK Build Tools 35.0.0, Android API 35 platform, Java 17+ 및 javac 또는 ECJ 3.39.0, Python 3.9+가 필요합니다. 예시 경로는 자신의 환경에 맞게 바꿉니다. ECJ를 쓰지 않으면 `SILLY_ECJ`를 생략합니다.

```sh
SILLY_BUILD_TOOLS=/본인SDK/build-tools/35.0.0 \
SILLY_ANDROID_JAR=/본인SDK/platforms/android-35/android.jar \
SILLY_KEYSTORE=/저장소밖/개인보관/release.p12 \
SILLY_KEY_PASSWORD_FILE=/저장소밖/개인보관/password.txt \
bash android/build.sh
```

빌드는 키를 새로 만들지 않고 `dist/silly-bookshop-0.8.1-test.1.apk`를 생성합니다. 공개 소스 ZIP에는 APK가 포함되지 않으므로 Releases에 APK를 따로 붙입니다. 빌드 도구는 Google 공식 Android SDK, ECJ는 Eclipse 공식 배포처에서 받으세요.

APK 서명 인증서 SHA-256은 검증 결과에 남깁니다. 인증서는 공개 정보이며 개인 키와 다릅니다. APK에 포함된 인증서를 추출하는 것으로 서명 개인 키가 노출되지는 않습니다.

## 배포자가 마무리할 항목

1. [TESTING.md](TESTING.md)의 실제 폰·실리·테일스케일 항목 통과.
2. 저장소 소유자/URL, 비공개 보안 제보 채널 설정.
3. 공개 소스의 사용·재배포 라이선스 결정. 현재는 임의로 권리를 허용하지 않도록 package.json을 UNLICENSED로 둔 상태입니다.
4. 테스트한 커밋을 태그로 고정하고 APK와 체크섬을 pre-release에 첨부.
5. 정식 배포 전에 남은 문제와 지원 범위를 README에 명시.

0.5.0은 이름과 앱 식별자를 통일합니다. 이전 앱에 덮어쓰는 업데이트가 아니라 새 앱 설치입니다. README의 이전 명령으로 비밀번호·읽던 위치를 보존하고 기존 화면 연동 확장을 제거합니다. 새 설치에 브라우저 확장은 필요 없습니다.

렌더러 코드를 수정하려면 `server/renderer-source.js`를 편집한 뒤 `node scripts/build-renderer.cjs`를 실행하고 생성된 `server/public/rich.js`도 함께 커밋합니다. 일반 사용자는 빌드할 필요가 없습니다. 패키징은 묶음이 오래됐으면 중단합니다.

0.6.1은 0.5.0/0.6.0과 동일한 app.silly.bookshop 및 서명으로 업데이트합니다. 서버 폴더를 다시 이전하거나 앱을 삭제할 필요는 없습니다. fonts 폴더와 각 OFL 라이선스도 모두 포함하세요.

0.7.0 APK에는 오프라인 읽기용 렌더러·폰트·각 라이선스를 포함하므로 이전보다 파일이 커집니다. `android/offline`과 새 Java 소스도 저장소에 포함하세요. 공개 전에 TESTING.md의 실제 폰 인증·오프라인 저장/재실행/삭제 항목을 완료하고, 사용자에게 서버 변경과 오프라인 사본의 독립적인 보관 정책을 안내하세요.

# 실리 책방 1.0.2 배포와 빌드

서버·웹 버전은 **1.0.2**, Android APK 버전은 **1.0.2**, Android versionCode는 **21**입니다. 패키지는 `app.silly.bookshop`, 설치 폴더는 `plugins/silly-bookshop`입니다.

## 공개 파일

- 공개 소스: `dist/silly-bookshop-github-1.0.2.zip`
- Android 설치 파일: `dist/silly-bookshop-1.0.2.apk`
- 위 파일의 SHA-256: `dist/SHA256SUMS.txt`
- 릴리스 본문: [RELEASE_NOTES.md](RELEASE_NOTES.md)

소스 ZIP은 **silly-bookshop 폴더 안의 내용**이 저장소 최상위에 오도록 업로드합니다. 최상위에 `package.json`이 있어야 합니다. ZIP 자체만 저장소에 올리면 clone 설치가 되지 않습니다. 저장소 주소는 https://github.com/foreverharibo-boop/Silly-Bookshop 입니다.

공개 패키지는 허용 목록으로 생성하며 사용자 데이터·암호 파일·서명 키·과거 Git 이력·APK를 포함하지 않습니다. APK는 GitHub Releases에 별도로 첨부합니다. **전체 개인 작업 폴더나 예전 개인용 ZIP은 공개하지 마세요.**

## 릴리스 게시

1. [TESTING.md](TESTING.md)의 현행 검증 상태와 지원 조건을 확인합니다. 사용자 기기 보고와 자동 검사를 구분하며 기록되지 않은 테스트를 완료로 표시하지 않습니다.
2. 1.0.2 소스가 반영된 커밋을 선택해 `v1.0.2` 태그로 고정합니다.
3. GitHub → Releases → Draft a new release에서 제목을 **실리 책방 1.0.2**으로 설정합니다.
4. [RELEASE_NOTES.md](RELEASE_NOTES.md) 본문을 붙이고 **APK 하나만 첨부합니다.** 소스는 GitHub 자동 Source code 링크로 제공하고, 체크섬은 릴리스 본문에 기록합니다. 상대 문서 링크는 게시할 태그의 파일 링크로 바꿉니다.
5. 사용자 결정에 따른 첫 정식 버전이므로 pre-release 표시는 끕니다. 첨부 파일과 다운로드 링크를 확인한 뒤 게시합니다.

이 저장소에는 태그·릴리스 자동 게시 또는 서명 키를 올리는 CI가 없습니다. 코드 반영·파일 준비와 실제 Releases 게시 여부는 별도로 확인합니다. 커뮤니티 글에는 저장소 또는 게시 완료한 Releases 링크를 사용합니다.

## 검사와 패키징

Node.js 18+, Python 3.9+가 필요합니다.

```sh
node scripts/build-renderer.cjs
npm test
python3 scripts/package-public.py --check
python3 scripts/package-public.py
```

검사기는 허용 목록·심볼릭 링크·개인 데이터 파일명·대표적인 키/토큰 패턴·렌더러 생성 상태를 확인합니다. 모든 형태의 비밀을 탐지하는 것은 아니므로 개인 정보를 소스/문서에 직접 넣지 않습니다. 체크섬 파일에는 **서버 버전의 공개 ZIP과 Android manifest에 지정된 버전 APK만** 포함합니다.

## APK 빌드

Android SDK Build Tools 35, API 35 platform, Java 17+ 및 javac 또는 ECJ가 필요합니다. 서명 키와 암호 파일은 저장소 **밖**의 기존 개인 보관 파일을 사용합니다. 새 키를 만들면 기존 앱의 덮어 설치가 되지 않습니다.

```sh
SILLY_BUILD_TOOLS=/본인SDK/build-tools/35.0.0 \
SILLY_ANDROID_JAR=/본인SDK/platforms/android-35/android.jar \
SILLY_KEYSTORE=/저장소밖/개인보관/release.p12 \
SILLY_KEY_PASSWORD_FILE=/저장소밖/개인보관/password.txt \
bash android/build.sh
```

ECJ 사용 시 `SILLY_ECJ`에 jar 경로를 추가합니다. APK 빌드 후 공개 패키징을 다시 실행하면 새 APK 체크섬을 포함합니다. 빌드 스크립트는 서명 키를 만들거나 공개 패키지에 넣지 않습니다.

서명 인증서 SHA-256:

```text
d7ca695de38f3708bee090e88d8a4306bb05f332575b49cbbe1ea0db395ddfae
```

인증서 지문은 공개 정보이며 개인 키가 아닙니다. 개인 키/암호/서명용 ZIP은 Releases에도 올리지 않습니다. 키가 노출되었다면 배포 전에 새 키와 업데이트 정책을 정해야 합니다.

## 소스 권리와 제보

자체 소스는 `UNLICENSED` 상태입니다. 정식 버전 전환만으로 오픈소스 라이선스를 임의로 부여하지 않습니다. 포함된 라이브러리·폰트의 라이선스 파일은 삭제하지 않습니다. GitHub의 비공개 취약점 제보 채널을 제공하는 경우 활성화 여부를 확인하고 [SECURITY.md](SECURITY.md)에 맞게 안내합니다.

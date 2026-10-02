# 실리 책방

**0.2.0-test.1 · 공개 배포 전 테스트 버전**

실리의 채팅을 읽는 개인용 웹 화면과 안드로이드 앱입니다. 각 사용자는 **자기 실리 서버**에 이 서버 플러그인을 설치하고, 앱에 자기 서버 주소를 입력합니다. 중앙 채팅 서버나 제작자 계정은 필요하지 않습니다.

말풍선 보기, 접는 캐릭터 목록, 검색, 밝은/어두운 화면, 글자 크기, 원문/저장된 표시문 전환, 새 답변·수정·현재 스와이프 자동 반영, 기기 사이 읽던 위치 복원을 지원합니다.

## 설치 구조

이 저장소를 통째로 `SillyTavern/plugins/sili-library`에 clone하면 최상위 `package.json`의 `main: server/index.cjs`로 로드됩니다. **일반 확장 설치 메뉴에 넣지 않습니다.** 실행용 외부 npm 의존성이 없어 `npm install`도 필요 없습니다.

Android 8 이상 / Node.js 18 이상. 실리가 실행 중이어야 읽을 수 있습니다. 실리 계정을 쓰는 경우 각 계정의 채팅만 읽습니다.

## 터먹스에 최초 설치

먼저 실리 서버를 `Ctrl+C`로 중지합니다. 기존 실리 경로가 `~/SillyTavern`인 경우:

```sh
cd ~/SillyTavern
read -r -p "책방 깃허브 저장소 주소를 붙여넣으세요: " SILI_REPO_URL
git clone -- "$SILI_REPO_URL" plugins/sili-library
cd plugins/sili-library
node scripts/enable-plugin.cjs
node setup.cjs
```

아직 저장소를 만들지 않았다면 위 clone 단계는 기다려 주세요. 먼저 이 공개용 ZIP을 압축 해제해서 **그 안의 파일/폴더를 저장소 최상위에 업로드**합니다. 최상위에 `package.json`, `setup.cjs`, `server`, `android`가 보여야 합니다. ZIP 파일 자체를 올리는 것으로는 clone 설치가 되지 않습니다. 숨김 파일 `.gitignore`, `.gitattributes`도 포함하세요.

`enable-plugin.cjs`는 config.yaml을 백업하고 `enableServerPlugins`만 true로 바꿉니다. 기존의 다른 서버 플러그인도 함께 활성화될 수 있습니다. 이미 true이면 파일을 바꾸지 않습니다.

비밀번호는 **12자 이상**으로 두 번 입력합니다. 글자나 별표가 화면에 안 나오는 게 정상입니다. 기본 계정이 아니라면 사용자 데이터 폴더를 직접 지정하세요:

```sh
node setup.cjs "$HOME/SillyTavern/data/사용자핸들"
```

사용자 지정 실리 경로라면 `enable-plugin.cjs` 뒤에 config.yaml 전체 경로를 넣을 수 있습니다. 비밀번호를 잊었을 때도 setup.cjs로 재설정하며 이전 로그인은 무효화됩니다.

실리 다시 시작:

```sh
cd ~/SillyTavern
bash start.sh
```

콘솔에 `[실리 책방 0.2.0-test.1] /api/plugins/sili-library/`가 표시됩니다.

## APK 연결

공개용 소스 ZIP에 APK나 서명 키를 섞지 않습니다. 테스트 APK 또는 이후 GitHub Releases의 APK를 폰에서 열어 설치하세요.

- 실리 터먹스가 있는 **같은 폰**: `http://127.0.0.1:8000`
- 다른 안드로이드 기기: 테일스케일을 켜고 `http://100.x.y.z:8000` 또는 해당 `.ts.net` 주소
- 별도 HTTPS 서버: 본인이 관리하는 `https://서버주소`

포트가 다르면 8000을 실제 포트로 바꿉니다. 실리 기본 주소만 넣으면 책방 경로는 자동으로 붙습니다. 하위 경로 프록시는 지원하지 않습니다.

실리 자체 인증이 있으면 먼저 실리 로그인 후 위쪽 **책방**을 누르고, 책방 비밀번호를 입력합니다. 기존 `0.1.x` 앱은 삭제 없이 새 APK로 업데이트 가능합니다. 기존 HTTP LAN 주소(192.168.x.x 등)는 이 버전에서 차단하므로 localhost/테일스케일/HTTPS 주소로 바꿔 주세요.

안드로이드 앱에서는 채팅이 최근 앱 화면이나 일반 스크린샷에 노출되지 않도록 보안 화면을 사용합니다. OS 및 기기 정책에 따라 동작이 다를 수 있습니다. 서버 주소를 변경하면 앱 안의 이전 쿠키와 웹 저장 데이터를 비웁니다.

## 컴퓨터에서 읽기

테일스케일로 실리를 여는 주소 뒤에 `/api/plugins/sili-library/`를 붙입니다. 예:

```text
http://100.x.y.z:8000/api/plugins/sili-library/
```

403이면 같은 서버의 실리 메인 화면에서 먼저 로그인하고 돌아오세요. 네트워크 제한 안내가 나오면 localhost/테일스케일/HTTPS를 확인합니다. 실리의 기존 IP 허용 목록과 로그인 제한은 그대로 적용됩니다.

## 동작과 저장 위치

- 활성 대화는 약 5초, 목록은 약 30초 간격으로 서버 파일을 확인합니다. 화면이 숨겨져 있으면 폴링을 멈춥니다.
- 생성 중 아직 실리가 파일에 저장하지 않은 내용은 표시되지 않습니다.
- 읽던 위치는 스크롤을 멈춘 뒤 약 0.65초 후 저장됩니다. 같은 대화를 다른 기기에서 열면 이어 읽습니다. 동시에 읽으면 마지막 저장이 적용됩니다.
- 글자 크기·테마·목록 접힘·최근 선택 ID는 기기 웹 저장소에 보관합니다. 대화 본문을 오프라인 보관하지 않습니다.
- 서버 추가 파일은 해당 계정의 `data/<handle>/.sili-library/auth.json`, `reading.json`입니다. 비밀번호는 salt+scrypt 해시로 저장합니다.
- 원본 JSONL과 `settings.json`, 프롬프트, API 키, 다른 확장 파일은 변경하지 않습니다.
- 추가 AI 호출, 분석/광고 SDK, 제작자 알림, 외부 이미지 자동 요청이 없습니다.

## 업데이트

**기존 0.1.x ZIP 설치자는** 서버를 멈추고 기존 플러그인 폴더를 `plugins` 밖에 백업한 뒤 저장소를 같은 이름으로 clone하세요. 계정 데이터 폴더는 이동하거나 삭제하지 않습니다.

```sh
cd ~/SillyTavern
mv plugins/sili-library "$HOME/sili-bookshop-plugin-backup-$(date +%Y%m%d-%H%M%S)"
read -r -p "책방 깃허브 저장소 주소: " SILI_REPO_URL
git clone -- "$SILI_REPO_URL" plugins/sili-library
```

clone이 실패하면 백업 폴더를 원래 위치로 되돌리면 됩니다. 비밀번호와 읽던 위치는 별도 계정 폴더에 남아 있습니다. 기존 비밀번호가 짧다면 `node setup.cjs`로 새로 설정하세요.

**이미 Git으로 설치한 뒤의 업데이트**는 실리를 중지한 상태에서 실행합니다:

```sh
cd ~/SillyTavern/plugins/sili-library
git pull --ff-only
```

테스트 버전을 고정하려면 검증한 태그/커밋을 checkout하세요. 실리의 `enableServerPluginsAutoUpdate`가 true이면 시작할 때 Git 플러그인을 자동 업데이트할 수 있습니다. false로 바꾸면 **다른 서버 플러그인의 자동 업데이트에도 영향**을 주므로 본인 운영 방식에 맞게 직접 결정하세요.

## 현재 제한

텍스트와 기본 강조 표시만 지원하며 HTML 상태창·스크립트·외부 이미지·링크는 실행하지 않습니다. 대화당 32MiB, JSONL 한 줄 약 1MiB 문자 수, 10만 메시지, 목록 2만 대화 제한이 있습니다. 한 번에 최대 150개 메시지와 약 2MiB의 메시지 데이터를 반환하며 큰 페이지는 더 작게 나눕니다. 첫 메시지는 크기에 따라 이 응답 목표를 넘을 수 있습니다. 읽던 위치의 메시지가 중간 삭제되면 위치가 달라질 수 있습니다.

30분 동안 사용하지 않거나 로그인 후 24시간이 지나면 재로그인이 필요합니다. 실리 서버를 다시 켜도 재로그인이 필요합니다. 앱 종료/네트워크 단절 직전의 위치는 저장되지 않을 수 있습니다. 오프라인 읽기는 아직 없습니다.

실제 폰·터먹스 실기 테스트는 아직 완료하지 않았습니다. 공개하기 전에 [TESTING.md](TESTING.md)를 확인하세요. 보안 범위는 [SECURITY.md](SECURITY.md), 공개 절차와 앱 빌드는 [PUBLISHING.md](PUBLISHING.md)에 있습니다.

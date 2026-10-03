# HTTP·HTTPS 로그인 충돌 수정 (2026-10-04 KST, 1.0.1 서버 패치)

- 같은 호스트의 HTTP와 HTTPS가 같은 `silly_bookshop` 쿠키 이름을 쓰던 문제를 수정했습니다. 쿠키는 포트별로 분리되지 않으므로 HTTPS의 Secure 쿠키가 HTTP 로그인에 간섭할 수 있었습니다.
- 쿠키 이름에 서버에서 계산한 Origin 구분자를 사용합니다. 내장 HTTPS 입구는 기존처럼 자신의 Host/포트를 유지하며 Secure 속성을 붙입니다. 계정·Origin 검증, HttpOnly, SameSite=Strict, CSRF와 만료 정책은 유지합니다.
- 기존 공유 쿠키는 인증에 사용하지 않습니다. 업데이트 후 주소마다 다시 로그인해야 합니다. 사이트 데이터 삭제, 인증서 재발급, URL 변경, 오프라인 보관함 초기화는 필요하지 않습니다. Android APK 재설치도 필요하지 않습니다.
- `session-origins-browser.cjs`: 기존 쿠키 방식에서 HTTPS 로그인 후 HTTP 인증이 풀리는 실패를 재현했습니다. 수정 후 Chromium에서 HTTP→HTTPS→HTTP 로그인, 서로 다른 HTTPS 포트, 남아 있는 이전 Secure 쿠키, 다른 Origin 토큰 재사용 거부, 주소별 로그아웃 검사를 통과했습니다.
- 기존 `http-security.cjs`, `account-http.cjs`, `local-https.test.cjs` 통과. 실제 아이폰 Safari 검사는 이 패치에서 아직 하지 않았습니다.
- 재현 명령: `NODE_PATH=<express·playwright 경로>/node_modules PLAYWRIGHT_BROWSERS_PATH=<Chromium 경로> node server/tests/session-origins-browser.cjs`


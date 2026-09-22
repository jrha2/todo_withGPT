# 투자기획팀 업무관리 공간 1.6.0 배포 및 운영 안내

## 1. 서버 PC 준비

현재 검증 환경은 Windows와 Node.js 24입니다. 서버 PC에서 저장소를 받은 후 다음을
실행합니다.

```powershell
cd C:\making_app\todo_withGPT\apps\desktop
npm ci
Copy-Item ..\..\server\.env.example ..\..\server\.env
```

`server\.env`에서 최소한 아래 항목을 실제 환경에 맞게 변경합니다.

```text
TODO_DATABASE_PATH=C:\making_app\todo_withGPT\server\database\todo_app.db
TODO_UPLOADS_PATH=C:\making_app\todo_withGPT\server\uploads
TODO_ADMIN_PASSWORD=8자 이상의 안전한 초기 비밀번호
```

서버를 직접 시작하려면:

```powershell
powershell -ExecutionPolicy Bypass -File C:\making_app\todo_withGPT\server\start-server.ps1
```

상태 확인 주소는 `http://127.0.0.1:4310/health`입니다.

## 2. 서버 자동 시작과 백업

다음 스크립트는 현재 Windows 계정 로그인 시 서버를 자동 시작하고 매일 오전
2시에 백업을 실행하는 작업 스케줄러 항목을 설치합니다.
두 작업 모두 별도 콘솔 창을 띄우지 않고 백그라운드에서 실행됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File C:\making_app\todo_withGPT\server\install-windows-tasks.ps1
```

백업은 기본적으로 `server\backups`에 14개까지 보관합니다. 즉시 백업하려면:

```powershell
powershell -ExecutionPolicy Bypass -File C:\making_app\todo_withGPT\server\backup-server.ps1
```

백업에는 SQLite 일관성 스냅샷과 전체 첨부파일이 함께 포함됩니다. 서버 PC의 디스크
고장에 대비하려면 `server\backups` 폴더를 별도 NAS나 외장 디스크에도 복제하세요.

## 3. 방화벽과 네트워크

TCP 4310 인바운드는 회사/가정의 신뢰할 수 있는 `Domain`, `Private` 네트워크에만
허용합니다. Public 네트워크에는 공개하지 마세요. 이 버전의 API는 사내 LAN용 HTTP
구성이므로 인터넷에 직접 노출하면 안 됩니다.

다른 PC에서 서버 PC의 IPv4 주소를 확인하고, 예를 들어 `192.168.0.10`이라면 앱
로그인 화면의 서버 주소에 다음을 입력합니다.

```text
http://192.168.0.10:4310
```

## 4. 데스크톱 앱 배포

생성된 파일:

```text
apps\desktop\release\투자기획팀 업무관리 공간-설치파일-1.6.0.exe
apps\desktop\release\투자기획팀 업무관리 공간-설치파일-1.6.0.exe.sha256.txt
apps\desktop\release\투자기획팀 업무관리 공간-1.6.0-win-x64.zip
apps\desktop\release\투자기획팀 업무관리 공간-1.6.0-win-x64.zip.sha256.txt
```

일반 사용자는 Setup EXE를 실행해 설치합니다. 설치 권한이 제한된 PC에서는 ZIP을
원하는 폴더에 풀고 `투자기획팀 업무관리 공간.exe`를 실행할 수 있습니다. 패키지 앱은 Windows
로그인 시 자동 실행되며 창을 닫아도 트레이에서 PC 알림을 확인합니다.

NSIS 설치 파일은 다음 명령으로 만들 수 있습니다.

```powershell
cd C:\making_app\todo_withGPT\apps\desktop
npm run dist:win
```

현재 개발 PC에서는 공식 NSIS 및 7zip 구성요소를 SHA-256 검증 후 로컬 빌드 캐시에
보관하므로 이후 빌드에서 재사용합니다. 다른 PC에서 인증서 프록시가 다운로드를
막는 경우에는 검증된 포터블 ZIP을 사용하거나 사내 루트 인증서를 Node.js 신뢰
저장소에 정식으로 등록해야 합니다. TLS 검증을 끄는 방식은 사용하지 마세요.

현재 실행 파일은 코드 서명 인증서로 서명하지 않았으므로 Windows SmartScreen이
경고할 수 있습니다. 조직 외부 배포 전에는 Authenticode 인증서 서명이 필요합니다.

## 5. 최초 로그인과 사용자 생성

초기 로그인 ID는 기본적으로 `admin`입니다. 비밀번호는 `server\.env`의
`TODO_ADMIN_PASSWORD` 값입니다. 로그인 직후 관리자 화면에서 본인 비밀번호를 다시
설정하고 팀원 계정을 만드세요.

기존 DB가 이미 있으면 환경 변수의 초기 비밀번호가 기존 admin 비밀번호를 덮어쓰지
않습니다.

## 6. 업데이트 절차

1. 서버 백업을 한 번 실행합니다.
2. 서버 프로세스를 종료합니다.
3. 새 소스에서 `npm ci`, `npm run lint`, `npm run build`, `npm run test:server`를 실행합니다.
4. 서버를 다시 시작하고 `/health`의 버전을 확인합니다.
5. 새 포터블 ZIP을 사용자에게 배포합니다.

### 6-1. 업데이트 안내 문구 / 강제 업데이트 (서버에서 제어)

클라이언트의 업데이트 팝업 문구와 "강제 업데이트" 여부를 서버에서 파일 하나로 제어할 수 있습니다.
`updates/` 폴더(`TODO_UPDATES_PATH`)에 **`update-policy.json`** 을 두면 서버 재시작 없이 즉시 반영됩니다.
(형식 예시는 `server/update-policy.example.json` 참고. `updates/`는 gitignore 대상이라 저장소에 커밋되지 않습니다.)

```json
{
  "message": "업데이트 팝업 상단 문구 (비우면 기본 문구)",
  "detail": "업데이트 팝업 상세 문구 (비우면 기본 문구)",
  "minVersion": "1.6.0",
  "forced": false
}
```

- `message` / `detail`: 업데이트 팝업에 표시할 문구. 비우면 기본 문구가 쓰입니다.
- **강제 업데이트 판정**: `forced` 가 `true` 이거나, 실행 중인 앱 버전이 `minVersion` 보다 낮으면
  해당 업데이트를 **필수**로 취급합니다.
  - 필수일 때: 팝업에서 "나중에" 버튼이 사라지고, 다운로드가 끝나면 앱이 **자동으로 재시작·설치**됩니다.
- 클라이언트는 업데이트 확인 시 `GET /api/update-policy` 로 이 정책을 읽습니다(미인증 접근 허용).
- 강제 업데이트를 끝내면 `forced` 를 `false` 로 되돌리거나 `minVersion` 을 낮춰, 이후 배포가
  불필요하게 강제되지 않게 합니다.

## 7. 복구 절차

복구 전에는 서버 프로세스를 반드시 종료합니다. 선택한 백업 폴더의 `todo_app.db`를
`server\database\todo_app.db`로, `uploads` 내용을 `server\uploads`로 복원한 뒤
서버를 다시 시작합니다. 기존 운영 데이터가 덮어써지므로 복구 직전 상태도 별도
폴더에 보관하세요.


## 8. 1.5.2 변경 사항 — 새 서버 접속 문제 수정 및 이전 배포 순서

### 무엇이 바뀌었나

- 데스크톱 앱의 서버 통신을 Electron 메인 프로세스의 Node/undici `fetch` 대신
  **Electron `net.fetch`(Chromium 네트워크 스택)** 로 전환했습니다.
- Node의 `fetch`는 Windows 시스템 인증서 저장소와 시스템/사내 프록시 설정을 사용하지
  않습니다. 그래서 브라우저로는 접속되던 새 HTTPS 서버
  (`https://home-desktop.tailf5d646.ts.net:10000`)에 1.5.1 이하 앱에서는 접속되지
  않았습니다. `net.fetch`는 브라우저와 동일하게 OS 인증서·프록시를 사용하므로 이
  문제가 해결됩니다.
- 서버 코드 변경은 없습니다. **클라이언트만 수정**된 패치입니다.
- 서버 자동 전환 매핑에 옛 Tailscale 주소(`http://100.65.76.14:4310`)를 추가해,
  옛 LAN/Tailscale 주소 어느 쪽에 접속했던 사용자든 업데이트 후 새 서버로 자동
  전환되게 했습니다.

### 이전(구 서버 -> 신 서버) 배포 순서

1.5.1 이하 앱은 새 서버에 직접 접속할 수 없으므로, 업데이트는 **아직 접속되는 옛
서버 경로로** 받아야 합니다.

1. **사용자 안내**: 접속이 안 되면 로그인 화면 서버 주소를 **기존(옛) 서버 주소로
   되돌려** 접속하도록 안내합니다(옛 LAN `http://130.1.14.61:4310` 또는 옛 Tailscale
   `http://100.65.76.14:4310`).
2. **옛 서버에서 1.5.2 업데이트 배포**: 옛 서버의 `updates/` 피드에 1.5.2 설치본을
   올립니다. 옛 서버에 접속 중인 앱이 자동 업데이트로 1.5.2를 받습니다.
3. **업데이트 후 자동 전환**: 1.5.2로 재시작되면, 저장된 옛 서버 주소가 자동으로 새
   서버(`https://home-desktop.tailf5d646.ts.net:10000`)로 교체되고 재로그인이
   유도됩니다. 이때부터는 `net.fetch`로 새 HTTPS 서버에 정상 접속됩니다.
4. **정리**: 모든 사용자가 1.5.2 + 새 서버로 이전된 것이 확인되면 옛 서버를 폐쇄합니다.


## 9. 1.5.3 변경 사항 — 접속 로그(로그인/로그아웃 기록)

### 무엇이 바뀌었나

- 서버가 **로그인 성공**과 **로그아웃** 이벤트를 `access_logs` 테이블에 기록합니다.
  기록 항목은 "어떤 ID가(로그인 ID·이름), 언제(시각), 로그인/로그아웃" 뿐이며,
  IP·앱버전·엔드포인트별 상세는 남기지 않습니다.
- 무한 증가를 막기 위해 **사용자별 최근 100건**만 보관합니다(로그인/로그아웃 합산,
  새 기록이 들어올 때 초과분 자동 삭제).
- 관리자 콘솔에 **"접속 기록"** 탭이 추가되어, 누가 언제 접속·해지했는지 최신순으로
  확인할 수 있습니다. (관리자 전용: `GET /api/admin/access-logs`)
- 접속 로그 기록은 best-effort로, 기록에 실패해도 로그인/로그아웃 자체는 정상
  동작합니다.

### 배포 순서 — 서버 먼저

이 버전은 **서버 코드가 변경**됩니다(신규 테이블 + 로그인/로그아웃 시 기록 +
관리자 엔드포인트). 따라서 다음 순서로 배포합니다.

1. **서버 먼저 업데이트**: 서버 백업 → 서버 프로세스 종료 → 새 소스(1.5.3)로
   `npm ci`, `npm run build`, `npm run test:server` → 서버 재시작 →
   `/health` 버전이 1.5.3인지 확인. 서버 시작 시 `access_logs` 테이블이
   자동 생성됩니다(`CREATE TABLE IF NOT EXISTS`, 기존 데이터 영향 없음).
2. **그다음 앱 배포**: 1.5.3 설치본을 `updates/` 피드에 올려 클라이언트가 자동
   업데이트되게 합니다. (구버전 앱은 새 관리자 "접속 기록" 탭이 없을 뿐, 서버가
   먼저 올라가 있어도 기존 로그인/로그아웃은 정상 동작합니다.)


## 10. 1.6.0 변경 사항 — 공지사항 팝업 (서버에서 제어)

### 무엇이 바뀌었나

- 관리자가 서버 파일 하나로 **공지 팝업**을 띄울 수 있습니다. `updates/` 폴더
  (`TODO_UPDATES_PATH`)에 **`announcement.json`** 을 두면 서버 재시작 없이 즉시
  반영됩니다. (형식 예시는 `server/announcement.example.json` 참고. `updates/`는
  gitignore 대상이라 저장소에 커밋되지 않습니다.)
- 클라이언트는 `GET /api/announcement`(미인증)로 이 공지를 읽어, `active`가 `true`
  이고 아직 닫지 않은 공지면 **제목 + 본문** 팝업을 띄웁니다.
- **로그인 직후는 물론, 앱 사용 중에도** 주기적으로(약 5분 간격) 새 공지를 감지해
  팝업합니다.
- 팝업에는 **"다시 보지 않기"** 옵션이 있습니다. 체크 후 닫으면 그 공지 `id`를
  해당 PC에 기록해 다시 뜨지 않습니다. **관리자가 `id`를 바꾸면** 새 공지로 간주되어
  다시 표시됩니다(내용만 바꾸고 `id`를 그대로 두면, 이미 닫은 사람에겐 다시 안 뜸).

```json
{
  "id": "2026-09-notice-1",
  "title": "공지 제목",
  "body": "공지 본문 (\\n 으로 줄바꿈)",
  "active": true
}
```

- `active`를 `false`로 두거나 파일을 지우면 공지가 표시되지 않습니다.
- 새 공지를 낼 때는 **`id`를 새 값으로 바꿔야** 이전에 "다시 보지 않기"를 누른
  사용자에게도 다시 표시됩니다.

### 배포 순서 — 서버 먼저

이 버전은 **서버 코드가 변경**됩니다(신규 엔드포인트 `GET /api/announcement` +
`announcement.json` 읽기). 순서:

1. **서버 먼저 1.6.0으로 업데이트**: 백업 → 중지 → 새 소스로 `npm ci`,
   `npm run build`, `npm run test:server` → 재시작 → `/health` 버전 1.6.0 확인.
   (DB 변경은 없습니다.)
2. **그다음 1.6.0 앱 배포**: `updates/` 피드에 1.6.0 설치본을 올려 클라이언트가
   자동 업데이트되게 합니다. (서버가 먼저 올라가 있으면, 아직 1.5.x인 앱은 공지
   기능이 없을 뿐 정상 동작합니다.)
3. 공지를 띄우려면 `updates/announcement.json`을 작성/수정합니다(재시작 불필요).

## 1.6.1 — 공지 전원 확인 시 자동 종료

- 1.6.0에서는 "다시 보지 않기"가 각 PC 로컬에만 기록됐지만, 1.6.1은 **그 dismissal을
  서버에도 기록**합니다(신규 인증 엔드포인트 `POST /api/announcement/dismiss`, 신규
  테이블 `announcement_dismissals`). **활성 계정(status='active') 전원**이 현재
  공지 `id`를 "다시 보지 않기"로 닫으면, 서버가 `GET /api/announcement`에서 그 공지를
  자동으로 `active=false`로 강등해 아무에게도 더는 뜨지 않습니다. `announcement.json`
  파일을 직접 지우거나 `active`를 끌 필요가 없어집니다(원하면 여전히 수동으로 가능).
- 개인이 "다시 보지 않기"를 누르면 (1.6.0처럼) 그 사람에게는 즉시 안 뜨고, (1.6.1
  추가로) 서버에도 보고됩니다. 활성 전원이 누른 시점에 전체적으로 종료됩니다.
- 새 `id`로 공지를 바꾸면 dismissal 집계도 새 `id` 기준으로 리셋됩니다(과거 공지의
  dismissal은 그대로 남아 무관).

### 배포 순서 — 서버 먼저 (1.6.0과 동일)

이 버전도 **서버 코드가 변경**됩니다(신규 엔드포인트 + 신규 테이블
`announcement_dismissals`, `CREATE TABLE IF NOT EXISTS`로 자동 생성, 기존 데이터
영향 없음). 순서: 서버 먼저 1.6.1로 재시작(`/health`=1.6.1 확인) → `updates/` 피드에
1.6.1 설치본 배포 → 클라이언트 자동 업데이트. 서버가 먼저 올라가 있으면 아직 1.6.0인
앱은 dismissal을 서버에 보고하지 못할 뿐(로컬 동작은 정상), 전원-자동종료는 1.6.1
앱이 보고할 때부터 작동합니다.

# 투자기획팀 업무관리 공간 1.2.1 배포 및 운영 안내

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
apps\desktop\release\투자기획팀 업무관리 공간-설치파일-1.2.1.exe
apps\desktop\release\투자기획팀 업무관리 공간-설치파일-1.2.1.exe.sha256.txt
apps\desktop\release\투자기획팀 업무관리 공간-1.2.1-win-x64.zip
apps\desktop\release\투자기획팀 업무관리 공간-1.2.1-win-x64.zip.sha256.txt
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

## 7. 복구 절차

복구 전에는 서버 프로세스를 반드시 종료합니다. 선택한 백업 폴더의 `todo_app.db`를
`server\database\todo_app.db`로, `uploads` 내용을 `server\uploads`로 복원한 뒤
서버를 다시 시작합니다. 기존 운영 데이터가 덮어써지므로 복구 직전 상태도 별도
폴더에 보관하세요.

# 임시 중앙 서버

현재 PC를 로그인 및 팀원 관리용 임시 중앙 서버로 사용합니다.

## 서버 PC에서 실행

`apps/desktop` 폴더에서 다음 명령을 한 번만 실행합니다.

```powershell
npm run dev
```

이 명령은 다음 세 가지를 함께 실행합니다.

- Node.js API 서버: `0.0.0.0:4310`
- React 개발 서버
- Electron 데스크톱 앱

서버 상태 확인 주소:

```text
http://127.0.0.1:4310/health
```

## 다른 PC에서 접속

다른 PC의 PowerShell에서 서버 PC의 내부 IP를 지정한 다음 클라이언트만 실행합니다.

```powershell
$env:TODO_SERVER_URL='http://서버PC의-IP:4310'
npm run dev:client
```

예시:

```powershell
$env:TODO_SERVER_URL='http://192.168.0.10:4310'
npm run dev:client
```

Windows 방화벽에서 TCP 4310 포트의 인바운드 연결을 허용해야 합니다.

## 현재 전환 범위

- 로그인
- 로그인 세션
- admin 사용자 관리
- 담당자 목록
- Navigation Tree 전체 CRUD와 드래그 앤 드롭
- Task 생성·조회·수정·완료
- Sub Task 생성·조회·수정·완료·삭제
- 메모 저장·조회
- 댓글과 무한 답글 생성·수정·삭제
- 첨부파일 업로드·다운로드
- 로그인한 담당자별 PC 알림 조회·미루기·해제·Task 완료

첨부파일 원본은 기본적으로 `server/uploads`에 저장됩니다. 이 폴더는 Git에 포함되지
않으며 DB 파일과 함께 정기적으로 백업해야 합니다. 기본 파일당 제한은 25MB이고,
`TODO_UPLOADS_PATH`와 `TODO_MAX_ATTACHMENT_BYTES` 환경 변수로 변경할 수 있습니다.

PC 알림은 30초마다 중앙 서버에서 로그인한 사용자가 담당자로 지정된 Task만
확인합니다. 같은 계정으로 로그인한 여러 PC에서는 같은 알림을 받을 수 있고, 한
기기에서 미루거나 해제하면 다른 기기에도 다음 조회 시 반영됩니다.

## 자동 실행과 백업

`install-windows-tasks.ps1`을 실행하면 현재 Windows 계정 로그인 시 서버가 자동으로
시작되고, 매일 오전 2시에 DB와 첨부파일을 백업합니다.
서버와 백업은 `wscript.exe`를 통해 별도 PowerShell 창 없이 백그라운드에서 실행됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows-tasks.ps1
```

즉시 수동 백업은 다음과 같습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-server.ps1
```

초기 admin 비밀번호는 `.env`의 `TODO_ADMIN_PASSWORD`로 지정하세요. 설정하지 않으면
개발용 기본 비밀번호가 사용되고 서버에 경고가 출력됩니다.

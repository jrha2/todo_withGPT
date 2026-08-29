# 투자기획팀 업무관리 공간 1.2.0

팀 계정, 담당자, 계층형 Navigation, Task, Sub Task, 메모, 댓글, 첨부파일과
PC 알림을 제공하는 Electron 데스크톱 To Do 앱입니다. 데이터는 한 대의 중앙 서버
PC에 SQLite로 저장되고 여러 Windows PC가 같은 데이터를 사용합니다.

## 현재 배포 범위

- Windows x64 데스크톱 앱
- 로그인과 admin 사용자 관리
- Navigation Tree 전체 CRUD, 정렬, 이동, 복사, 드래그 앤 드롭
- Task 완료 상태와 Navigation Bar 완료 표시
- 기한, 알림, 복수 담당자, Sub Task, 메모, 무한 답글 댓글
- 서버 첨부파일 업로드와 다운로드
- 로그인한 복수 담당자별 PC 알림과 여러 PC 간 개별 알림 상태 동기화
- SSE 기반 실시간 변경 감지, 사용자 승인 후 화면 반영, 리비전 기반 충돌 방지
- 서버 자동 시작과 매일 SQLite·첨부파일 백업
- 중앙 서버 기반 Windows 앱 자동 업데이트

## 빠른 시작

개발 환경 전체 실행:

```powershell
cd C:\making_app\todo_withGPT\apps\desktop
npm run dev
```

코드 검증:

```powershell
npm run lint
npm run build
npm run test:server
```

Windows 포터블 배포본 생성:

```powershell
npm run dist:portable
```

자세한 설치와 운영 방법은 [DEPLOYMENT.md](DEPLOYMENT.md)를 확인하세요.

## 아직 포함하지 않은 범위

모바일 앱 푸시와 이메일 발송은 Apple/Google 푸시 인증서 및 이메일 발송 서비스
계정이 필요한 별도 배포 단계입니다. 1.2.0은 Windows PC 알림과
To Do Briefing 기능까지를 정식 배포 범위로 정했습니다.

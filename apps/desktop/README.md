# 투자기획팀 업무관리 공간 데스크톱 앱

Electron, Vite, React, TypeScript 기반 Windows 데스크톱 클라이언트입니다.

```powershell
npm ci
npm run dev
```

주요 명령:

- `npm run dev`: API 서버, Vite, Electron 동시 실행
- `npm run dev:client`: 다른 PC의 API 서버를 사용하는 클라이언트 개발 실행
- `npm run lint`: React와 TypeScript 정적 검사
- `npm run build`: TypeScript 및 Vite 프로덕션 빌드
- `npm run test:server`: 임시 DB 기반 서버 통합 테스트
- `npm run dist:portable`: Windows x64 포터블 ZIP과 SHA-256 생성
- `npm run dist:win`: Windows NSIS 설치 프로그램 생성

전체 배포 안내는 저장소 루트의 `DEPLOYMENT.md`를 확인하세요.

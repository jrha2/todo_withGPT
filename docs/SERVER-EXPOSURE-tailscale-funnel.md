# 새 서버(home-desktop) 노출 구성 — Tailscale Funnel (포트 10000)

이 문서는 `todo_withGPT` 앱 서버를 새 PC(`home-desktop`)에서 인터넷에 HTTPS로
노출하기 위해 실제 적용한 Tailscale Funnel 구성을 기록한다.
(SERVER-MIGRATION.md 2장 "Tailscale + HTTPS 연결 주소 확정"에 대응)

## 배경 / 제약
- 이 PC는 KiroCrew(원격 대시보드) 서버를 함께 돌리며, Tailscale `serve`로
  **443 포트**를 이미 사용 중이다 (`https://home-desktop.tailf5d646.ts.net` → `127.0.0.1:5476`, tailnet 전용).
- 따라서 앱 서버는 **443을 절대 건드리면 안 되고**, 다른 포트를 써야 한다.
- 이 tailnet에서 Funnel로 열 수 있는 포트는 **443 / 8443 / 10000** 뿐이다.
- 클라이언트(다른 PC/폰)에는 Tailscale를 설치하지 않으므로, tailnet 전용(serve)이 아닌
  **인터넷 공개(funnel)** 가 필요하다 → 포트 **10000** 선택.

## 최종 구성
| 서비스 | 포트 | 프록시 대상 | 노출 범위 |
|--------|------|-------------|-----------|
| KiroCrew 대시보드 | 443 | `http://127.0.0.1:5476` | tailnet 전용 (serve) |
| **todo_withGPT 앱 서버** | **10000** | `http://127.0.0.1:4310` | **인터넷 공개 (funnel)** |

- 앱 서버 최종 접속 주소(FQDN): **`https://home-desktop.tailf5d646.ts.net:10000`**
- 앱 자체는 HTTP(4310)만 제공하고, TLS 종단(HTTPS)은 Tailscale Funnel이 담당한다.
- `/updates` 도 같은 HTTPS 엔드포인트로 노출되어 electron-updater 자동 업데이트가 HTTPS로 동작한다.

## 적용 명령 (Windows PowerShell)
```powershell
$ts = 'C:\Program Files\Tailscale\tailscale.exe'

# 앱 서버(4310)를 포트 10000으로 인터넷 공개. 443(Crew)은 건드리지 않음.
& $ts funnel --bg --https=10000 http://127.0.0.1:4310

# 현재 구성 확인
& $ts funnel status
& $ts serve status -json
```

## 해제(롤백) 방법
```powershell
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
& $ts funnel --https=10000 off
```
> 위 해제는 10000(앱 서버)만 내린다. 443(Crew)은 영향받지 않는다.

## 검증 결과 (빈 서버, 데이터 미이전 상태)
- 로컬 `GET http://127.0.0.1:4310/health` → 200, `version: 1.4.1`
- 외부 HTTPS `GET https://home-desktop.tailf5d646.ts.net:10000/health`
  → **200**, `version: 1.4.1`, 인증서 검증 성공(`ssl_verify_result=0`, `-k` 없이 통과)
- 외부 HTTPS `GET .../updates/latest.yml` → **404** (빈 서버라 파일 없음 — 경로 라우팅·인증서 정상 확인)

## 주의
- Funnel은 인터넷 전체에 공개되므로 앱의 로그인/인증이 유일한 방어선이다.
- 재부팅 후에도 `--bg`로 등록된 funnel은 유지된다. 상태는 `tailscale funnel status`로 확인.
- 실제 서비스 전환(cutover) 직전, 클라이언트 실기기(모바일 데이터 등 외부망)에서
  위 주소로 로그인·자동 업데이트까지 최종 확인할 것.

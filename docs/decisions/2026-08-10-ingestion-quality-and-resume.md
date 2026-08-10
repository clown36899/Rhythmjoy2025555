# 수집 품질 게이트와 부분 실행 복구

- 날짜: 2026-08-10
- 상태: 채택

## 배경

`swing-daily`는 메인 Mac의 네 LaunchAgent가 08:00~11:00에 우선순위별로 실행한다. 미니 PC는 키오스크 표시 장치이며 수집 실행 주체가 아니다. 메인 Mac이 절전 또는 전원 종료 상태였던 2026-08-10에는 우선순위 1·3 실행이 일부 소스만 확인하고도 종료 코드 0을 반환했고, 뒤 실행은 전역 잠금과 충돌했다. 또한 이미지 없는 후보, 설명 문장형 제목, DJ나 운영 근거가 없는 소셜, 같은 날짜의 DJ 부분집합 후보가 관리자 검수 큐를 오염시켰다.

## 결정

1. 수집 후보는 활동 종류와 관계없이 실제 원문 이미지가 있어야 한다. 이미지가 없거나 썸네일뿐이면 저장하지 않는다.
2. 소셜은 DJ명 또는 입장료·운영시간·라이브 밴드·밀롱가·프랙티카 같은 구체적 운영 근거가 있어야 한다.
3. 대관 가능일정, 과거 혜택, 설명 문장형 제목은 결정 규칙으로 AI 호출 전에 제외한다.
4. 같은 소스·날짜·장소·기본 제목의 소셜 후보는 DJ 집합이 더 완전한 한 건으로 병합한다.
5. AI 판정은 자동등록 직전의 최종 안전판으로 유지한다. AI 실패는 자동등록을 열지 않으며, 결정 규칙을 대신하지 않는다.
6. 우선순위별 실행은 남은 소스와 마지막 완주 시각을 로컬 상태 파일에 원자적으로 기록한다. 중단 뒤에는 남은 소스를 먼저 실행하고, 완주 공백에 비례해 Instagram 확인 범위를 최대 8개까지 넓힌다.
7. 실행 예산 초과나 남은 소스가 있는 실행은 종료 코드 75로 반환한다. LaunchAgent는 `caffeinate -dimsu` 아래에서 실행해 예약 실행 중 절전을 방지한다.

## 운영 경계

- 자동 수집은 `getAutomationSourceList('swing-daily')`만 사용한다.
- 저장은 Cafe24 수집 API만 사용하며 직접 DB 쓰기를 하지 않는다.
- Mac이 완전히 꺼져 있는 동안에는 실행할 수 없지만, 다음 기동 후 소스 체크포인트와 확대된 게시물 창으로 공백을 보강한다.
- 수집 실행 주체를 미니 PC로 옮기는 것은 별도 인프라 변경이며 이번 결정 범위에 포함하지 않는다.

## 검증

- `node scripts/test-ingestion-standards.mjs`
- AI 판정, 자동등록 링크, 공식 일정 중복 관련 Vitest 31개
- 경성홀·네오스윙·스윙타임 실제 Instagram 경로 무저장 실행
- 네 LaunchAgent plist 검증 및 재등록 후 실행 프로그램이 `/usr/bin/caffeinate`임을 확인

## 관련 파일

- `scripts/ingestion/candidate-utils.mjs`
- `scripts/ingestion/ingestion-progress.mjs`
- `scripts/ingestion/swing-daily-native.mjs`
- `scripts/com.rhythmjoy.codex-ingestion*.plist`
- `scripts/test-ingestion-standards.mjs`
- `server/cafe24/ingestion-candidate-policy.js`
- `server/cafe24/function-api.js`
- `server/cafe24/ingestion-date-expansion.js`

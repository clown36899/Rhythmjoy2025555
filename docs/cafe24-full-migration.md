# Cafe24 Only Policy

이 프로젝트는 이제 **Cafe24 단일 운영 체계**를 사용한다.

## 현재 원칙

- 레거시 배포 경로는 운영 경로에서 제거됐다.
- 레거시 DB, Storage, Auth 의존성은 운영 경로에서 제거됐다.
- 이벤트 수집, 관리자 검수, 통계 API, 업로드 파일, 로그인 세션은 모두 Cafe24 서버 기준으로 동작한다.
- 운영 이벤트 후보 저장 엔드포인트는 `https://swingenjoy.com/api/scraped-events`다.
- V3 후보 검수 엔드포인트는 `https://swingenjoy.com/api/ingestor-v3/candidates`다.
- 업로드 파일은 Cafe24 서버의 `/uploads/...` 경로로 관리된다.

## 점검 기준

- `/api/events` 또는 관련 관리자 기능이 Cafe24 백엔드를 사용해야 한다.
- 수집 스크립트와 자동화 문서는 레거시 플랫폼을 다시 안내하면 안 된다.
- 신규 환경변수, 스크립트, 문서는 Cafe24-only 정책을 따라야 한다.

## 남겨두는 기록의 범위

- `CHANGELOG.md` 같은 이력 문서에는 과거 플랫폼 언급이 남을 수 있다.
- 운영 지침, 활성 스킬, 자동화 스크립트, 현재 설정 파일은 Cafe24 기준만 남긴다.

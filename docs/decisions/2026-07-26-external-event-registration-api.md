# 파트너별 외부 일정 등록 API

- 날짜: 2026-07-26
- 상태: accepted

## Context

외부 사이트 운영자가 자기 사이트에 일정을 등록할 때 Swing Enjoy에도 같은 일정을 한 번에 등록하고 싶어 한다. 외부에는 일정 편집 권한이 필요하지 않으며, 여러 집단에 같은 연동 기능을 안전하게 제공해야 한다.

## Decision

- 서버 간 일정 등록 `POST /api/external/v1/events`와 이미지 업로드 `POST /api/external/v1/images`만 공개하고 조회·수정·삭제 기능은 제공하지 않는다.
- 파트너마다 독립 API Key를 발급하며 원문 대신 SHA-256 해시를 저장한다.
- `partner_id + external_id`를 고유값으로 사용해 재시도에 의한 중복 일정을 방지한다.
- 분류는 현재 사이트의 `category`별 장르 목록만 허용한다. 파트너별 기본 분류를 둘 수 있지만 새 분류를 자동 생성하지 않는다.
- 외부 API 날짜 입력은 `event_dates` 하나로 통일한다. 단일 일정은 날짜 1개, 개별 날짜 일정은 여러 개를 보내며 연속 기간 방식은 지원하지 않는다. 내부 DB 호환용 날짜값은 서버가 생성한다.
- 관련 링크는 모든 일정에서 필수다. 이미지는 행사·강습·동호회에서 필수지만 소셜은 예외로 하며, 이미지 없는 소셜은 상세 화면의 기존 카카오맵을 사용할 수 있도록 정확한 주소를 필수로 받는다. `scope=domestic`, `show_title_on_billboard=true`는 서버에서 적용한다.
- API 등록은 홈 메인 광고 노출을 보장하지 않는다. 일반 일정과 동일한 비소셜·미래일정·관리자 필터·등록자/장소 중복 제한을 적용한다.
- 이미지를 사용하는 일정은 `upload`와 `url` 두 방식 중 하나를 선택한다. `upload`는 인증된 바이너리 업로드 API가 실제 파일을 검사하고 WebP로 재인코딩해 자체 저장한다. `url`은 기존 일반 등록 화면에는 없는 외부 API 전용 기능으로, 공개 HTTPS 이미지를 직접 연결한다. Base64 이미지를 일정 JSON에 직접 넣는 방식은 받지 않는다.
- 파트너별 호출량 제한과 요청 결과 로그를 저장한다.

## Consequences

- 새로운 파트너는 코드 변경 없이 DB 등록과 키 발급만으로 추가할 수 있다.
- 외부 사이트는 비밀 키 보호를 위해 브라우저가 아니라 서버에서 API를 호출해야 한다.
- 파트너가 업로드 API를 사용하면 원본 사이트 이미지 권한이나 URL 수명에 의존하지 않는다.

## Related

- `server/cafe24/external-events-api.js`
- `server/cafe24/migrations/2026-07-26-external-events-api.sql`
- `scripts/create-external-api-partner.mjs`
- `docs/external-event-api.md`

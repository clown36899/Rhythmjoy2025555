# 외부 일정 API 관리자 운영 안내

이 문서는 Dance Billboard 관리자용입니다. 파트너에게는 `docs/external-event-api.md`와 OpenAPI 파일만 전달해 주세요.

## 최초 운영 준비

다음 마이그레이션이 적용되어 있어야 합니다.

```text
server/cafe24/migrations/2026-07-26-external-events-api.sql
```

## API Key 발급

여러 종류의 일정을 등록하는 일반 파트너는 기본 분류 없이 발급합니다.

```bash
npm run external-api:create-partner -- \
  --name "파트너명"
```

항상 한 종류만 등록하는 파트너에 한해 최상위·하위 분류 생략값을 함께 지정할 수 있습니다.

```bash
npm run external-api:create-partner -- \
  --name "워크샵 전용 파트너" \
  --category event \
  --genre "워크샵"
```

명령에 출력되는 API Key 원문은 한 번만 표시됩니다. 안전한 채널로 담당자에게 전달하고 비밀 저장소에 보관하도록 안내해 주세요. DB에는 키 해시만 저장됩니다.

## 중지와 추적

관리자 로그인 세션이 있는 상태에서 다음 관리자 API를 사용할 수 있습니다.

```http
GET /api/admin/external-partners
GET /api/admin/external-request-logs
PATCH /api/admin/external-partners/{partner_id}
Content-Type: application/json

{"is_active": false}
```

키 유출, 오등록 또는 계약 종료 시 해당 파트너를 중지해 주세요. 파트너별 요청 IP, 결과, 상태 코드와 시각은 요청 로그에서 확인할 수 있습니다.

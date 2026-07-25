# 외부 일정 등록 API

외부 사이트가 자기 일정 등록과 동시에 Swing Enjoy에도 같은 일정을 등록하기 위한 서버 간 API다. 현재 공개 버전은 등록만 제공하며 수정·삭제는 아직 허용하지 않는다.

## 엔드포인트

```http
POST https://swingenjoy.com/api/external/v1/events
Authorization: Bearer {파트너 전용 API Key}
Content-Type: application/json
```

API Key는 브라우저 JavaScript에 넣지 말고 상대방 서버에서만 사용한다.

브라우저 직접 호출을 위한 CORS는 제공하지 않는다.

## 단일 일정 요청 예시

```json
{
  "external_id": "partner-event-20260801-1",
  "title": "토요일 린디합 강습",
  "event_dates": ["2026-08-01"],
  "time": "19:30",
  "location": "서울 강남",
  "address": "서울특별시 강남구",
  "description": "행사 소개",
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/events/1",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/1.webp"
}
```

단일 일정도 `event_dates` 배열을 사용하며 날짜를 하나만 보낸다.

## 개별 날짜 여러 개 선택 요청 예시

사이트 등록 화면의 개별 날짜 선택 기능과 동일하게 `event_dates` 배열을 사용한다.

```json
{
  "external_id": "partner-class-202608",
  "title": "8월 토요일 린디합 강습",
  "event_dates": [
    "2026-08-01",
    "2026-08-08",
    "2026-08-22"
  ],
  "time": "19:30",
  "location": "서울 강남",
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/classes/202608",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/class-202608.webp"
}
```

개별 날짜 일정도 같은 `event_dates`를 사용하며 실제 노출할 날짜를 모두 보낸다.

위 예시는 서로 독립된 8월 1일, 8일, 22일 일정으로 처리되어 캘린더의 각 날짜에 노출된다. 선택하지 않은 중간 날짜에는 노출되지 않으며, 연속 일정으로 처리되지 않는다.

## 연속 날짜 방식은 지원하지 않음

이 사이트의 외부 일정 API는 `시작일~종료일` 형태의 연속 일정을 지원하지 않는다.

`start_date`와 `end_date` 필드는 둘 다 지원하지 않으며, 보내면 `400` 오류를 반환한다. 여러 날짜에 노출하려면 각각을 독립된 날짜로 `event_dates`에 넣어야 한다.

```json
{
  "event_dates": [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05"
  ]
}
```

외부 API의 날짜 입력 필드는 하나뿐이다.

```text
단일 일정: event_dates에 날짜 1개
개별 날짜 일정: event_dates에 날짜 여러 개
연속 일정: 지원하지 않음
```

`external_id`, `title`, `source_url`, `event_dates`는 항상 필수다. `external_id`가 같은 요청을 다시 보내면 새 일정을 만들지 않고 최초 `event_id`를 반환한다.

### category와 genre를 누가 정하는가

원칙적으로 상대방은 요청 JSON에 `category`와 `genre`를 직접 넣는다. 아래 표에 없는 값은 등록되지 않는다.

특정 업체가 항상 같은 종류만 등록하는 경우에만 관리자가 API 키에 분류를 미리 지정할 수 있다. 예를 들어 그 키를 `category=event`, `genre=워크샵`으로 발급하면 상대방은 두 필드를 생략할 수 있고 서버가 항상 `event/워크샵`으로 저장한다. 요청값으로 다른 분류를 새로 만드는 기능이 아니다. 이런 사전 지정이 없는 일반 키는 두 필드를 반드시 보내야 한다.

| category | 의미 | 허용 genre |
|---|---|---|
| `social` | 소셜 일정 | `소셜`, `졸공` |
| `event` | 행사 | `워크샵`, `파티`, `대회`, `라이브밴드`, `기타` |
| `class` | 강습 | `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |
| `club` | 동호회 | `정규강습`, `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |

관련 링크는 모든 일정에서 필수다. 이미지 규칙은 일정 분류에 따라 다르다.

- `event`, `class`, `club`: 이미지 필수
- `social`: 이미지 선택
- 이미지 없는 `social`: 상세 화면의 카카오맵 표시를 위해 `address` 필수

`address`는 카카오맵 검색이 가능한 대한민국 도로명주소 또는 지번주소를 사용한다. 건물명만 쓰지 말고 시·도부터 번지까지 보낸다.

```text
권장 도로명주소: 서울특별시 강남구 테헤란로 123
권장 지번주소: 서울특별시 강남구 역삼동 123-45
잘못된 예: 강남 스윙홀, 지하 1층, 역삼역 근처
```

층·호수와 장소명은 `venue_name` 또는 `location`에 넣고 `address`에는 지도 검색용 주소만 넣는다.

이미지를 사용하는 경우 다음 두 방식 중 하나를 선택한다.

| 선택 | image_mode | 사용 방법 |
|---|---|---|
| Swing Enjoy에 파일 업로드 | `upload` | 이미지 업로드 API가 반환한 `image_url` 사용 |
| 외부 이미지 URL 연결 | `url` | 상대방의 공개 HTTPS 이미지 주소 사용 |

## 이미지 파일 업로드

이미지 파일을 먼저 Swing Enjoy 서버에 직접 업로드한다.

```http
POST https://swingenjoy.com/api/external/v1/images
Authorization: Bearer {파트너 전용 API Key}
Content-Type: image/jpeg

{이미지 바이너리 파일}
```

JPEG, PNG, WebP, AVIF 파일을 최대 8MB까지 받을 수 있다. 확장자나 요청 헤더만 믿지 않고 실제 이미지인지 검사한 뒤, 최대 2,400×2,400 크기의 WebP로 다시 변환하여 Swing Enjoy 저장소에 보관한다. SVG, GIF 애니메이션, HTML 및 실행 파일은 허용하지 않는다.

업로드 응답:

```json
{
  "ok": true,
  "image_url": "https://swingenjoy.com/uploads/external-events/.../poster.webp",
  "content_type": "image/webp",
  "bytes": 183204
}
```

반환받은 `image_url`을 일정 등록 요청에 넣는다.

```json
{
  "external_id": "partner-event-20260801-1",
  "title": "토요일 린디합 강습",
  "event_dates": ["2026-08-01"],
  "image_mode": "upload",
  "image_url": "https://swingenjoy.com/uploads/external-events/.../poster.webp"
}
```

이 방식을 사용하면 원본 사이트의 로그인 권한, URL 만료, 핫링크 차단과 관계없이 Swing Enjoy에서 이미지가 표시된다. Base64 이미지를 일정 JSON 안에 직접 넣는 방식은 허용하지 않는다.

업로드 cURL 예시:

```bash
curl -X POST 'https://swingenjoy.com/api/external/v1/images' \
  -H 'Authorization: Bearer 발급받은_API_KEY' \
  -H 'Content-Type: image/jpeg' \
  --data-binary '@poster.jpg'
```

## 외부 이미지 URL 연결

이 방식은 기존 사이트의 일반 일정 등록 화면에는 없으며, 외부 API에서만 제공하는 기능이다. 상대방이 인터넷에서 로그인 없이 열리는 HTTPS 이미지 주소를 가지고 있을 때 사용한다.

```json
{
  "external_id": "partner-event-20260801-2",
  "title": "토요일 소셜",
  "event_dates": ["2026-08-01"],
  "category": "social",
  "genre": "소셜",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/poster.jpg"
}
```

허용 확장자는 AVIF, JPEG, PNG, WebP다. 주소에 로그인, 쿠키 또는 일회성 서명이 필요하면 사용할 수 없다. 상대방 서버가 핫링크를 막거나 이미지를 삭제하거나 URL을 만료시키면 Swing Enjoy에서도 이미지가 보이지 않을 수 있다. 그런 사이트는 `upload` 방식을 사용해야 한다.

이미지를 사용하는 경우 `image_mode`과 `image_url` 중 하나라도 빠지면 등록되지 않는다. 둘 다 생략할 수 있는 경우는 주소가 있는 `social`뿐이다.

## 이미지 없는 소셜

소셜은 이미지 없이 등록할 수 있다. 이 경우 상세 화면의 이미지 영역 대신 기존 `EventKakaoMap`을 사용해 장소 주소를 카카오맵으로 표시한다.

```json
{
  "external_id": "partner-social-20260801-3",
  "title": "금요일 정기 소셜",
  "event_dates": ["2026-08-01"],
  "time": "20:00",
  "category": "social",
  "genre": "소셜",
  "location": "스윙홀",
  "address": "서울특별시 강남구 테헤란로 1",
  "location_link": "https://map.kakao.com/...",
  "source_url": "https://partner.example.com/socials/3"
}
```

이 방식에서는 `image_mode`과 `image_url`을 모두 생략한다. 카카오 주소 검색이 가능하도록 도로명 또는 지번 주소를 `address`에 정확히 보내야 한다. `location`은 상세 화면과 지도 마커에 표시할 장소명이고, `location_link`는 지도 외부 열기 링크다.

## 사이트 분류값

| category | 허용 genre |
|---|---|
| `social` | `소셜`, `졸공` |
| `event` | `워크샵`, `파티`, `대회`, `라이브밴드`, `기타` |
| `class` | `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |
| `club` | `정규강습`, `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |

표에 없는 값은 등록하지 않고 `400` 오류로 반환한다.

## 필드 규칙

| 필드 | 필수 | 형식 및 제한 |
|---|---:|---|
| `external_id` | 예 | 파트너 시스템 내 일정 고유번호, 최대 160자 |
| `title` | 예 | 최대 255자 |
| `event_dates` | 예 | 날짜 배열, 최대 366개; 단일 일정은 1개, 개별 날짜 일정은 여러 개 |
| `time` | 아니오 | 표시용 시간 문자열, 최대 120자 |
| `location` | 아니오 | 최대 255자 |
| `address` | 조건부 | 최대 255자; 이미지 없는 `social`에서는 카카오맵 표시를 위해 필수 |
| `location_link` | 아니오 | 공개 HTTPS URL |
| `description` | 아니오 | 최대 20,000자 |
| `category` | 조건부 | 위 표의 고정 영문값, 파트너 기본값이 있으면 생략 가능 |
| `genre` | 조건부 | 선택한 `category`에 허용된 사이트 장르값 |
| `source_url` | 예 | 기존 사이트의 필수 관련 링크에 해당하는 원본 일정 공개 HTTPS URL |
| `link_name1` | 아니오 | 링크 표시명, 기본값 `자세히 보기` |
| `image_mode` | 조건부 | 이미지를 사용할 때 `upload` 또는 `url`; 이미지 없는 `social`만 생략 가능 |
| `image_url` | 조건부 | 이미지를 사용할 때 필수; 이미지 없는 `social`만 생략 가능 |
| `venue_name` | 아니오 | 생략 시 `location` 사용 |

다음 필드는 상대방이 지정할 수 없다.

```text
id, user_id, created_at, updated_at, start_date, end_date, password,
organizer_name, organizer_phone, dance_scope, dance_genre,
activity_type, group_id, board_users, organizer,
scope, show_title_on_billboard, main_ad_image_kind
```

이 값들은 Swing Enjoy 서버가 사이트 규칙에 맞춰 생성한다.

API로 등록되는 일정에는 기존 등록 기능과 동일하게 다음 값이 자동 적용된다.

```text
scope = domestic
show_title_on_billboard = true
organizer = 익명
```

## 메인 광고 노출 규칙

일정을 API로 등록했다고 해서 메인 광고 노출이 보장되지는 않는다. 일반 사이트 등록 일정과 같은 후보 선정 규칙을 적용한다.

- `event`, `class`, `club` 일정만 메인 신규 이벤트 광고 후보가 될 수 있다.
- `social` 일정은 메인 신규 이벤트 광고에서 제외된다.
- 오늘 또는 미래에 노출 날짜가 남아 있어야 한다.
- 관리자가 설정한 포함 장르, 등록 시간 범위, 정렬 방식과 최대 개수 설정을 적용한다.
- 현재 기본 등록 시간 범위는 72시간이며 최대 노출 개수는 10개다. 운영 설정으로 달라질 수 있다.
- 후보가 부족하고 관리자 fallback 설정이 켜져 있으면 등록 시간이 지난 미래 일정도 보충 후보가 될 수 있다.
- 같은 등록자와 같은 장소의 일정은 메인 광고에서 한 건만 선택될 수 있다.

`main_ad_image_kind`는 API에서 받지 않는다. 이 값은 메인 광고 강제 노출 스위치가 아니며, 관리자가 이미지의 사진/포스터 판정을 보정할 때 사용하는 내부 값이다.

### 메인 광고와 빌보드는 다름

`show_title_on_billboard = true`는 전용 빌보드 화면에서 이미지와 함께 제목·날짜·장소 정보를 표시할 수 있게 하는 기본값이다. 홈 화면의 메인 신규 이벤트 광고 후보 선정과는 별도 기능이다. 외부 API에서는 이 값을 임의로 끄거나 메인 광고 노출을 강제할 수 없다.

## 응답

최초 등록:

```json
{
  "ok": true,
  "duplicate": false,
  "event_id": "생성된 일정 ID",
  "event": {}
}
```

중복 요청:

```json
{
  "ok": true,
  "duplicate": true,
  "event_id": "기존 일정 ID"
}
```

## 오류 응답

```json
{
  "error": "Cafe24 API Error",
  "code": "invalid_request",
  "message": "오류 원인"
}
```

| HTTP | code | 의미 | 상대방 처리 |
|---:|---|---|---|
| `400` | `invalid_request` | 필수값, 날짜, 분류 또는 URL이 잘못됨 | 값을 수정한 뒤 다시 요청 |
| `401` | `invalid_api_key` | 키가 잘못됐거나 중지됨 | 키 확인, 임의 반복 금지 |
| `413` | `payload_too_large` | 일정 JSON 256KB 또는 이미지 8MB 초과 | 본문 또는 이미지 축소 |
| `415` | `unsupported_media_type` | 이미지 Content-Type이 지원 형식이 아님 | JPEG, PNG, WebP, AVIF로 전송 |
| `429` | `rate_limit_exceeded` | 파트너 호출 한도 초과 | 잠시 기다린 뒤 재시도 |
| `500` | 없음 | 서버 처리 실패 | 같은 `external_id`로 지수 백오프 재시도 |

네트워크 오류나 `500`, `429`에서는 같은 `external_id`로 재시도한다. `400`, `401`은 자동으로 반복 요청하지 않는다. 동일 `external_id` 재시도는 중복 일정을 생성하지 않는다.

## cURL 확인 예제

```bash
curl -X POST 'https://swingenjoy.com/api/external/v1/events' \
  -H 'Authorization: Bearer 발급받은_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "external_id": "partner-event-20260801-1",
    "title": "토요일 린디합 강습",
    "event_dates": ["2026-08-01"],
    "location": "서울 강남",
    "source_url": "https://partner.example.com/events/1",
    "image_mode": "url",
    "image_url": "https://partner.example.com/images/1.webp"
  }'
```

## 운영 준비

DB에 다음 마이그레이션을 먼저 적용한다.

```text
server/cafe24/migrations/2026-07-26-external-events-api.sql
```

그다음 파트너별 키를 하나씩 발급한다.

```bash
npm run external-api:create-partner -- \
  --name "파트너명" \
  --category class \
  --genre "린디합"
```

출력되는 키는 한 번만 표시된다. 파트너마다 별도 키를 사용하고, 유출 시 해당 파트너의 `is_active`를 `0`으로 변경한다.

기계 판독용 정식 계약은 `docs/external-event-api.openapi.yaml`에 있다.

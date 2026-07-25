# Dance Billboard 외부 일정 연동 API 안내서

이 문서는 파트너 사이트에서 일정을 등록·수정·삭제할 때 Dance Billboard에도 같은 내용을 연동하는 방법을 안내합니다.

## 1. 연동을 시작하기 전에

Dance Billboard 관리자가 파트너별 API Key를 발급해 드립니다. 연동을 원하시면 다음 정보를 관리자에게 전달해 주세요.

- 파트너 또는 사이트 이름
- 연결할 Dance Billboard 회원 계정(댄스빌보드 로그인 아이디)
- 기술 담당자 연락처

발급받은 키는 다음과 같은 형태입니다.

```text
rj_live_...
```

API Key는 파트너를 식별하는 서버용 비밀번호입니다. 파트너 사이트의 HTML이나 브라우저 JavaScript에 넣으면 방문자가 키를 확인할 수 있으므로, 반드시 파트너 서버의 환경변수 또는 비밀 저장소에 보관해 주세요.

### 로그인과 인증은 어떻게 처리되나요?

이 API는 Dance Billboard의 웹 로그인 세션이나 쿠키를 사용하지 않습니다. 파트너 사이트 사용자가 카카오 로그인 또는 자체 로그인을 했는지도 Dance Billboard에 전달하지 않습니다.

발급할 때 선택한 Dance Billboard 회원 계정은 API로 등록되는 일정의 내부 소유자를 구분하기 위해서만 사용합니다. 외부 서버가 그 회원의 로그인 쿠키를 받거나 대신 로그인하는 방식은 아닙니다.

파트너 서버가 요청할 때마다 아래 헤더에 발급받은 API Key를 넣어 인증합니다.

```http
Authorization: Bearer {발급받은_API_KEY}
```

서버는 이 키로 다음 항목을 확인합니다.

1. 어느 파트너가 보낸 요청인지 확인합니다.
2. 키가 사용 중지되지 않았는지 확인합니다.
3. 해당 파트너의 호출 한도를 확인합니다.
4. 등록·수정·삭제 기록을 파트너별로 남깁니다.
5. 같은 키로 등록한 일정만 수정하거나 삭제할 수 있게 제한합니다.

키가 잘못되었거나 중지된 경우 `401`을 반환합니다. 키가 유출된 것으로 의심되면 즉시 Dance Billboard 관리자에게 재발급을 요청해 주세요.

### 도배 방지 요청 한도

API Key마다 요청 횟수 한도가 적용됩니다. 기본 한도는 분당 10회, 24시간당 200회이며 관리자가 파트너별로 조정할 수 있습니다.

일정 등록·수정·삭제뿐 아니라 이미지 업로드와 주소 확인 요청도 한도에 포함됩니다. 필수값이 잘못된 요청도 반복 도배를 막기 위해 횟수에 포함됩니다. 한도를 넘으면 서버가 `429 rate_limit_exceeded`를 반환하며, 해당 응답을 받은 경우 자동 재시도를 즉시 중단하고 잠시 후 다시 요청해 주세요.

한 파트너의 과도한 요청은 해당 API Key만 제한하며 다른 파트너 키에는 영향을 주지 않습니다. 반복 오등록이나 비정상 사용이 확인되면 관리자가 해당 키를 즉시 중지할 수 있습니다.

## 2. 기본 요청 주소

```http
POST https://swingenjoy.com/api/external/v1/events
Authorization: Bearer {발급받은_API_KEY}
Content-Type: application/json
```

브라우저에서 직접 호출하는 CORS 방식은 제공하지 않습니다. 파트너 서버에서 Dance Billboard 서버로 요청해 주세요.

## 3. 날짜 입력 방법

날짜는 단일 일정과 개별 날짜 일정 모두 `event_dates` 하나만 사용합니다.

### 단일 일정

```json
{
  "external_id": "partner-event-20260801-1",
  "title": "토요일 린디합 강습",
  "event_dates": ["2026-08-01"],
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/events/1",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/1.webp"
}
```

단일 일정은 `event_dates`에 날짜를 하나만 넣어 주세요.

### 서로 떨어진 날짜 여러 개

```json
{
  "external_id": "partner-class-202608",
  "title": "8월 토요일 린디합 강습",
  "event_dates": [
    "2026-08-01",
    "2026-08-08",
    "2026-08-22"
  ],
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/classes/202608",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/class-202608.webp"
}
```

위 요청은 8월 1일, 8일, 22일에 각각 표시됩니다. 선택하지 않은 중간 날짜에는 표시되지 않습니다.

### 연속 기간은 지원하지 않습니다

`start_date`와 `end_date`는 보내지 마세요. 두 필드는 지원하지 않으며 요청에 포함하면 `400`을 반환합니다.

```text
단일 일정       event_dates에 날짜 1개
개별 날짜 일정 event_dates에 실제 선택한 날짜 여러 개
연속 기간 일정 지원하지 않음
```

## 4. 최상위 분류와 하위 분류

`category`는 사이트의 최상위 분류이고 `genre`는 해당 최상위 분류 안에서 선택하는 하위 분류입니다. 표에 있는 조합만 등록할 수 있으며, 임의의 분류나 장르는 추가할 수 없습니다.

| 최상위 분류 (`category`) | 입력 가능한 하위 분류 (`genre`) |
|---|---|
| 소셜 — `social` | `소셜`, `졸공` |
| 행사 — `event` | `워크샵`, `파티`, `대회`, `라이브밴드`, `기타` |
| 강습 — `class` | `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |
| 동호회 — `club` | `정규강습`, `린디합`, `솔로재즈`, `발보아`, `블루스`, `팀원모집`, `기타` |

예를 들어 워크샵은 다음과 같이 보내 주세요.

```json
{
  "category": "event",
  "genre": "워크샵"
}
```

모든 파트너는 표에 있는 모든 분류 조합을 사용할 수 있습니다. 일정마다 알맞은 `category`와 `genre`를 함께 보내 주세요. 관리자가 생략 시 기본값을 설정한 경우에만 두 값을 생략할 수 있으며, 기본값이 있더라도 요청에 다른 허용 조합을 직접 보내면 해당 분류로 등록됩니다.

분류에 따른 이미지·주소 규칙은 다음과 같습니다.

- `event`, `class`, `club`: 이미지가 반드시 필요합니다.
- `social`: 이미지를 생략할 수 있습니다. 이미지를 생략하면 상세 화면에 카카오맵을 표시할 수 있도록, 주소 확인 API에서 선택한 정확한 `address`를 반드시 보내야 합니다.

## 5. 이미지 등록 방식

이미지는 다음 두 방식 중 하나를 선택할 수 있습니다.

| 방식 | `image_mode` | 사용 시점 |
|---|---|---|
| Dance Billboard 서버에 파일 업로드 | `upload` | 파트너 서버가 이미지 파일을 가지고 있을 때 |
| 공개 이미지 URL 전달 | `url` | 로그인 없이 열리는 HTTPS 이미지 주소가 있을 때 |

### 방법 A: 이미지 파일을 직접 업로드

먼저 이미지 파일 자체를 업로드 API로 보내 주세요.

```http
POST https://swingenjoy.com/api/external/v1/images
Authorization: Bearer {발급받은_API_KEY}
Content-Type: image/jpeg

{이미지 파일의 바이너리 데이터}
```

이 요청은 JSON 요청이 아닙니다. 이미지 파일의 실제 바이트를 본문에 넣어야 합니다. Base64 문자열이나 `data:image/...` 문자열을 일정 JSON에 넣는 방식은 지원하지 않습니다.

```bash
curl -X POST 'https://swingenjoy.com/api/external/v1/images' \
  -H 'Authorization: Bearer 발급받은_API_KEY' \
  -H 'Content-Type: image/jpeg' \
  --data-binary '@poster.jpg'
```

업로드가 완료되면 서버가 자동으로 실제 이미지인지 검사하고 다음 4종 WebP 파일을 생성합니다.

| 응답 필드 | 용도 | 최대 폭 |
|---|---|---:|
| `image_micro` | 초소형 표시 | 100px |
| `image_thumbnail` | 목록 썸네일 | 300px |
| `image_medium` | 일반 화면 | 650px |
| `image_full` | 상세 화면 | 1300px |

응답 예시는 다음과 같습니다.

```json
{
  "ok": true,
  "image_url": "https://swingenjoy.com/uploads/external-events/.../full.webp",
  "variants": {
    "image_micro": "https://swingenjoy.com/uploads/external-events/.../micro.webp",
    "image_thumbnail": "https://swingenjoy.com/uploads/external-events/.../thumbnail.webp",
    "image_medium": "https://swingenjoy.com/uploads/external-events/.../medium.webp",
    "image_full": "https://swingenjoy.com/uploads/external-events/.../full.webp"
  },
  "content_type": "image/webp"
}
```

응답의 `image_url`을 일정 등록 요청에 넣어 주세요.

```json
{
  "image_mode": "upload",
  "image_url": "https://swingenjoy.com/uploads/external-events/.../full.webp"
}
```

이 방식에서는 이미지 파일이 Dance Billboard 서버에 저장됩니다. 따라서 파트너 사이트가 로그인을 요구하거나 원본 이미지 주소가 나중에 바뀌더라도, 이미 업로드된 Dance Billboard 일정 이미지는 계속 표시됩니다.

### 방법 B: 공개 이미지 URL 전달

파트너가 공개 HTTPS 이미지 주소를 가지고 있다면 파일 업로드 단계를 생략하고 일정 등록 요청에 바로 넣을 수 있습니다.

```json
{
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/poster.jpg"
}
```

이후 과정은 Dance Billboard 서버가 자동으로 처리합니다.

1. 일정 등록 요청을 받는 즉시 `image_url`의 파일을 내려받습니다.
2. 실제 JPEG, PNG, WebP 또는 AVIF 이미지인지 검사합니다.
3. 파일 크기, 픽셀 수, 리디렉션과 네트워크 주소를 검사합니다.
4. 안전한 이미지이면 WebP 4종으로 변환합니다.
5. 변환한 파일을 Dance Billboard 서버에 저장합니다.
6. 일정에는 외부 원본 URL이 아니라 저장된 Dance Billboard 이미지 주소를 연결합니다.

파트너가 별도의 변환 API를 다시 호출할 필요는 없습니다. 일정 등록 `POST` 또는 수정 `PUT` 한 번으로 자동 처리됩니다.

다음 URL은 사용할 수 없습니다.

- HTTP 주소
- 로그인이 필요한 이미지 주소
- 잠시 후 만료되는 서명 URL
- 사설망·로컬 서버 주소
- 8MB를 초과하는 파일
- 지나치게 많은 리디렉션을 사용하는 주소
- 확장자가 `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`가 아닌 주소

원본 이미지를 성공적으로 저장한 뒤에는 파트너가 원본 파일을 삭제해도 Dance Billboard에 저장된 일정 이미지는 유지됩니다.

## 6. 이미지 없는 소셜과 주소 확인

이미지가 없는 `social` 일정은 상세 화면에 카카오맵을 표시하므로 정확한 도로명주소 또는 지번주소가 필요합니다. 장소명, 건물명, 역 이름만 보내면 등록할 수 없습니다.

파트너 등록 화면에는 다음 주소 확인 절차를 구현해 주세요.

1. 사용자가 주소를 입력합니다.
2. 파트너 서버가 아래 주소 확인 API를 호출합니다.
3. 반환된 후보를 사용자에게 보여 줍니다.
4. 사용자가 올바른 후보를 선택합니다.
5. 선택한 후보의 `address` 값을 일정 등록 요청에 사용합니다.

```http
GET https://swingenjoy.com/api/external/v1/addresses/validate?query={주소}
Authorization: Bearer {발급받은_API_KEY}
```

호출 예시는 다음과 같습니다.

```bash
curl --get 'https://swingenjoy.com/api/external/v1/addresses/validate' \
  -H 'Authorization: Bearer 발급받은_API_KEY' \
  --data-urlencode 'query=서울 강남구 테헤란로 123'
```

응답 예시는 다음과 같습니다.

```json
{
  "ok": true,
  "query": "서울 강남구 테헤란로 123",
  "candidates": [
    {
      "address": "서울 강남구 테헤란로 123",
      "road_address": "서울 강남구 테헤란로 123",
      "jibun_address": "서울 강남구 역삼동 123-45",
      "building_name": "예시빌딩",
      "postal_code": "06123",
      "latitude": "37.000000",
      "longitude": "127.000000"
    }
  ]
}
```

후보가 없으면 `422 address_not_found`를 반환합니다. 이미지 없는 소셜 등록 시에도 서버가 주소를 다시 확인하므로, 확인 API를 거치지 않은 잘못된 주소는 최종 등록 단계에서 거절됩니다.

```json
{
  "external_id": "partner-social-20260801-3",
  "title": "금요일 정기 소셜",
  "event_dates": ["2026-08-01"],
  "time": "20:00",
  "category": "social",
  "genre": "소셜",
  "location": "스윙홀",
  "address": "서울 강남구 테헤란로 123",
  "source_url": "https://partner.example.com/socials/3"
}
```

`location`에는 장소명을 넣고 `address`에는 주소 확인 API가 반환한 주소를 넣어 주세요. 이 경우 `image_mode`과 `image_url`은 생략합니다.

## 7. 등록 필드

| 필드 | 필수 여부 | 설명 |
|---|---:|---|
| `external_id` | 필수 | 파트너 시스템에서 사용하는 일정 고유번호, 최대 160자 |
| `title` | 필수 | 일정 제목, 최대 255자 |
| `event_dates` | 필수 | 실제 표시할 날짜 배열, 최대 366개 |
| `category` | 원칙적으로 필수 | 최상위 분류 코드 |
| `genre` | 원칙적으로 필수 | 선택한 최상위 분류의 하위 분류 코드 |
| `source_url` | 필수 | 파트너 사이트의 공개 HTTPS 일정 상세 주소 |
| `time` | 선택 | 표시용 시간, 최대 120자 |
| `location` | 선택 | 장소명, 최대 255자 |
| `address` | 조건부 | 이미지 없는 소셜에서 필수이며 주소 확인 API 결과를 사용 |
| `location_link` | 선택 | 공개 HTTPS 지도 또는 장소 링크 |
| `description` | 선택 | 일정 설명, 최대 20,000자 |
| `link_name1` | 선택 | 상세 링크 표시명, 기본값은 `자세히 보기` |
| `image_mode` | 조건부 | 이미지를 사용할 때 `upload` 또는 `url` |
| `image_url` | 조건부 | 이미지를 사용할 때 필수 |
| `venue_name` | 선택 | 생략하면 `location` 값을 사용 |

`external_id`는 매우 중요합니다. 같은 일정을 다시 요청할 때 같은 값을 사용하면 중복 일정을 만들지 않습니다. 수정과 삭제에도 같은 값을 사용합니다.

## 8. 수정과 삭제

수정은 기존 일정의 일부만 바꾸는 방식이 아니라 전체 내용을 다시 보내는 방식입니다.

```http
PUT https://swingenjoy.com/api/external/v1/events/{external_id}
Authorization: Bearer {등록할_때_사용한_동일한_API_KEY}
Content-Type: application/json
```

본문은 등록 요청과 같은 필드를 보내 주세요. 본문에 `external_id`를 포함한다면 URL의 값과 같아야 합니다.

삭제는 다음과 같이 요청합니다.

```http
DELETE https://swingenjoy.com/api/external/v1/events/{external_id}
Authorization: Bearer {등록할_때_사용한_동일한_API_KEY}
```

다른 파트너의 키로는 일정을 수정하거나 삭제할 수 없습니다. 권한이 없는 일정은 존재 여부도 노출하지 않도록 `404`를 반환합니다.

## 9. 응답과 재시도

최초 등록 성공:

```json
{
  "ok": true,
  "duplicate": false,
  "event_id": "생성된 일정 ID",
  "event": {}
}
```

같은 `external_id`를 다시 등록한 경우:

```json
{
  "ok": true,
  "duplicate": true,
  "event_id": "기존 일정 ID"
}
```

오류 응답:

```json
{
  "error": "Cafe24 API Error",
  "code": "invalid_request",
  "message": "오류 원인"
}
```

| HTTP | `code` | 의미 | 권장 처리 |
|---:|---|---|---|
| `400` | `invalid_request` | 필수값, 날짜, 분류 또는 URL이 잘못되었습니다. | 값을 수정한 후 다시 요청해 주세요. |
| `401` | `invalid_api_key` | 키가 잘못되었거나 중지되었습니다. | 자동 반복하지 말고 키를 확인해 주세요. |
| `404` | `not_found` | 해당 키가 소유한 일정을 찾을 수 없습니다. | `external_id`와 사용한 키를 확인해 주세요. |
| `413` | `payload_too_large` | JSON 256KB 또는 이미지 8MB를 초과했습니다. | 본문 또는 이미지를 줄여 주세요. |
| `415` | `unsupported_media_type` | 지원하지 않는 이미지 형식입니다. | JPEG, PNG, WebP, AVIF를 사용해 주세요. |
| `422` | `address_not_found` | 카카오맵에서 주소를 확인할 수 없습니다. | 주소 확인 API에서 후보를 다시 선택해 주세요. |
| `429` | `rate_limit_exceeded` | 파트너 호출 한도를 초과했습니다. | 잠시 기다린 후 재시도해 주세요. |
| `500`, `503` | 서버 오류 코드 | 일시적인 서버 또는 외부 서비스 오류입니다. | 같은 `external_id`로 간격을 늘려 재시도해 주세요. |

네트워크 오류, `429`, `500`, `503`에서는 같은 `external_id`로 재시도해 주세요. `400`, `401`, `404`, `422`는 입력이나 권한을 확인하기 전까지 자동 반복하지 마세요.

## 10. 전체 등록 cURL 예시

```bash
curl -X POST 'https://swingenjoy.com/api/external/v1/events' \
  -H 'Authorization: Bearer 발급받은_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "external_id": "partner-event-20260801-1",
    "title": "토요일 린디합 강습",
    "event_dates": ["2026-08-01"],
    "time": "19:30",
    "location": "서울 강남",
    "category": "class",
    "genre": "린디합",
    "source_url": "https://partner.example.com/events/1",
    "image_mode": "url",
    "image_url": "https://partner.example.com/images/1.webp"
  }'
```

기계 판독용 API 정의는 함께 전달된 `external-event-api.openapi.yaml` 파일을 참고해 주세요.

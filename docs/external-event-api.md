# Dance Billboard 외부 일정 연동 API 안내서

이 문서는 파트너 사이트에서 일정을 등록·수정·삭제할 때 Dance Billboard에도 같은 내용을 연동하는 방법을 안내합니다.

## 1. 연동을 시작하기 전에

공유용 웹 안내서는 [https://swingenjoy.com/external-event-api](https://swingenjoy.com/external-event-api)에서 확인하실 수 있습니다.

안내서의 신청 양식에서 다음 정보를 보내 주시면 Dance Billboard 관리자가 검토 후 파트너별 테스트 API Key를 발급해 드립니다.

- 파트너 또는 사이트 이름
- 연결할 Dance Billboard 회원 계정(댄스빌보드 로그인 아이디)
- 기술 담당자 이메일
- 기술 담당자 전화번호

공유 링크에 비로그인 상태로 접속하면 Dance Billboard 로그인창이 먼저 열립니다. 연동 신청은 로그인한 사용자만 할 수 있으며, 신청 폼에는 현재 본인 계정이 `닉네임 · 로그인 아이디` 형식으로 표시되고 수정할 수 없습니다. 예: `홍길동 · user@example.com`. 승인된 API Key와 이 키로 등록한 일정은 표시된 계정에 연결됩니다.

기술 담당자 이메일과 전화번호는 모두 필수입니다. 로그인 계정에 유효한 이메일이 있으면 `로그인 계정 이메일 사용`이 기본 선택되어 자동 입력됩니다. Google 로그인은 일반적으로 계정 이메일을 제공하지만, 카카오를 포함한 소셜 로그인은 제공 동의와 계정 상태에 따라 이메일이 없을 수 있습니다. 로그인 이메일이 확인되지 않으면 체크박스를 사용할 수 없으며 담당자 이메일을 직접 입력해야 합니다. 전화번호는 로그인 정보에서 가져오지 않고 항상 직접 입력합니다.

테스트 키로 보낸 요청은 형식과 허용 장르를 검사하지만 실제 일정에는 등록되지 않습니다. 연동 확인이 끝나면 관리자가 운영 모드로 전환하며, 그 이후 요청부터 실제 일정에 반영됩니다.

발급받은 키는 다음과 같은 형태입니다.

```text
rj_live_...
```

API Key는 파트너를 식별하는 서버용 비밀번호입니다. 가장 중요한 원칙은 **사이트 방문자가 API Key를 볼 수 없어야 한다**는 것입니다.

- 넣으면 안 되는 곳: HTML, 브라우저 JavaScript, 공개 앱 번들, 공개 Git 저장소
- 사용할 수 있는 곳: 서버 환경변수(`.env`), 호스팅 서비스의 비밀변수, Secret Manager, 암호화된 서버 설정

특정 저장 기술을 강제하지는 않습니다. 파트너의 서버 환경에 맞는 방식을 사용하되, 키는 서버만 읽을 수 있어야 합니다. 문서 코드의 `process.env.DANCE_BILLBOARD_API_KEY`는 Node.js 서버 예시일 뿐입니다. PHP, Java, Python, 서버리스 플랫폼 등에서는 해당 환경의 비밀변수 또는 보안 저장 기능으로 바꿔 사용해 주세요.

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

API Key마다 요청 횟수 한도가 적용됩니다. 테스트 단계 권장값은 분당 30회·24시간 1,000회이고, 운영 단계 권장값은 분당 10회·24시간 200회입니다. 관리자는 파트너의 정상 사용량에 맞게 조정할 수 있습니다.

일정 등록·수정·삭제와 이미지 업로드가 한도에 포함됩니다. 필수값이 잘못된 요청도 반복 도배를 막기 위해 횟수에 포함됩니다. 한도를 넘으면 서버가 `429 rate_limit_exceeded`를 반환하며, 해당 응답을 받은 경우 자동 재시도를 즉시 중단하고 잠시 후 다시 요청해 주세요.

한 파트너의 과도한 요청은 해당 API Key만 제한하며 다른 파트너 키에는 영향을 주지 않습니다. 반복 오등록이나 비정상 사용이 확인되면 관리자가 해당 키를 즉시 중지할 수 있습니다.

개발 테스트 중 한도가 부족하면 안내 페이지에 로그인한 뒤 본인 계정에 연결된 테스트 파트너를 선택하고 **테스트 한도 즉시 상향**을 누르세요. 별도 관리자 승인 없이 분당 60회·24시간 3,000회로 자동 상향됩니다. 파트너별 24시간에 한 번만 사용할 수 있고 운영 모드 키에는 적용되지 않습니다.

## 2. 기본 요청 주소

아래 `curl` 명령은 파트너 사이트에 그대로 넣어야 하는 고정 개발 코드가 아니라, 터미널에서 API 요청을 빠르게 시험하는 예시입니다. 실제 연동 코드는 Node.js, PHP, Java, Python, 서버리스 등 파트너가 사용하는 서버 플랫폼에 따라 달라집니다.

플랫폼과 관계없이 다음 HTTP 계약만 동일하게 맞추면 됩니다.

| 구분 | 고정 여부 |
|---|---|
| 요청 방식 | `POST` |
| 요청 주소 | `https://swingenjoy.com/api/external/v1/events` |
| 인증 | `Authorization: Bearer {API Key}` |
| 데이터 형식 | `Content-Type: application/json` |
| JSON 구조 | 문서에 정의된 필드명과 형식 사용 |
| 실제 구현 코드 | 파트너의 서버 언어와 플랫폼에 맞게 자유롭게 작성 |

```http
POST https://swingenjoy.com/api/external/v1/events
Authorization: Bearer {발급받은_API_KEY}
Content-Type: application/json
```

브라우저에서 직접 호출하는 CORS 방식은 제공하지 않습니다. 파트너 서버에서 Dance Billboard 서버로 요청해 주세요.

공개 안내 페이지의 **사용 중인 서버 환경의 등록 예시**에서 Node.js, PHP, Python, Java 코드를 선택해 복사할 수 있습니다. 이 코드는 각각의 서버 문법으로 같은 HTTP 요청을 작성한 예시입니다. 파트너 사이트가 React, Vue 또는 일반 HTML로 만들어졌더라도 API Key를 프론트엔드에 넣지 말고, 해당 사이트의 서버나 서버리스 함수에서 호출해야 합니다.

- Node.js: Node.js 18 이상 내장 `fetch`
- PHP: PHP cURL 확장
- Python: `requests` 패키지
- Java: Java 17 이상 `HttpClient`

예시에 사용된 비밀변수 이름은 파트너 환경에 맞게 바꿀 수 있습니다. 요청 주소, 인증 헤더, HTTP 메서드와 JSON 형식은 바꾸면 안 됩니다.

### 등록 예시의 값은 어떻게 바꾸나요?

요청 주소, `POST` 메서드, 인증 헤더, `Content-Type`과 JSON 필드명은 그대로 사용하세요. 예시의 필드값은 실제 파트너 일정에 맞게 바꿀 수 있습니다.

| 예시 필드 | 바꿀 수 있는 범위 | 작성 방법 |
|---|---|---|
| `external_id` | 자유롭게 정함 | 최대 160자. 파트너 시스템의 일정 ID를 사용하며 등록 후 같은 일정의 수정·삭제에 동일한 값을 계속 사용합니다. |
| `title` | 자유로운 문자열 | 실제 일정 제목으로 바꿉니다. 최대 255자입니다. |
| `event_dates` | 정해진 날짜 형식 | `YYYY-MM-DD` 배열입니다. 단일 일정은 1개, 개별 날짜 일정은 선택한 날짜를 여러 개 넣습니다. |
| `category`, `genre` | 허용 코드만 가능 | 관리자가 승인한 최상위 분류와 장르표에 있는 값만 사용합니다. |
| `source_url` | 공개 HTTPS URL | 상대 사이트의 실제 일정 상세 페이지 주소로 바꿉니다. |
| `time`, `location` | 자유로운 문자열 | 표시할 시간과 장소명이며 필요 없으면 생략할 수 있습니다. |
| `image_mode` | `upload` 또는 `url` | 이미지 전달 방식에 맞춰 둘 중 하나만 사용합니다. |
| `image_url` | 이미지 URL | 업로드 API 응답 URL 또는 로그인 없이 열리는 공개 HTTPS 이미지 URL입니다. |

`title`, `time`, `location`, `description`, `venue_name`은 최대 길이 안에서 자유롭게 작성할 수 있습니다. 반면 날짜, 분류, HTTPS URL과 이미지 방식은 문서에 정해진 형식을 지켜야 합니다.

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

### 한 일정에서 장르를 몇 개 선택할 수 있나요?

| 최상위 분류 | 한 일정의 하위 장르 선택 |
|---|---|
| 행사 `event` | 복수 선택 가능. 쉼표로 구분합니다. 단, `파티 + 대회`는 동시 선택할 수 없고 `기타`는 단독으로만 사용할 수 있습니다. |
| 소셜 `social` | 1개만 선택 |
| 강습 `class` | 1개만 선택 |
| 동호회 `club` | 1개만 선택 |

행사 복수 장르는 `"genre": "워크샵,라이브밴드"`처럼 보내 주세요.

### API Key 승인 시 분류 권한

사이트와 같은 선택 규칙을 사용합니다.

| 승인 항목 | 선택 규칙 |
|---|---|
| 최상위 분류 `category` | `social`, `event`, `class`, `club` 중 반드시 1개만 선택합니다. |
| 하위 장르 `genre` | 선택한 최상위 분류 안에서 파트너가 사용할 수 있는 장르를 여러 개 허용할 수 있습니다. |
| 하위 장르를 선택하지 않은 경우 | 선택한 최상위 분류 안의 모든 하위 장르를 허용합니다. |
| 다른 최상위 분류의 장르 | 이름이 같아도 해당 API Key로 등록할 수 없습니다. |

관리자 화면의 복수 체크는 파트너가 여러 일정에서 사용할 수 있는 장르의 범위입니다. 한 일정에 동시에 넣을 수 있는 장르 개수는 위 표를 따릅니다.

예를 들어 워크샵은 다음과 같이 보내 주세요.

```json
{
  "category": "event",
  "genre": "워크샵"
}
```

일정 요청 한 건에는 승인된 `category` 1개를 보내 주세요. `event`는 허용된 하위 장르를 복수로 보낼 수 있고, `social`, `class`, `club`은 하위 장르 1개만 보낼 수 있습니다. 파트너 권한에서 하위 장르를 제한하지 않은 경우에도 선택한 최상위 분류 안에서만 사용할 수 있습니다.

분류에 따른 이미지·주소 규칙은 다음과 같습니다.

- `event`, `class`, `club`: 이미지가 반드시 필요합니다.
- `social`: 이미지를 생략할 수 있습니다. 주소도 선택 입력이지만, 주소를 보내면 상세 화면의 장소·지도 연동에 사용되므로 반드시 주소 검색 서비스에서 확인한 도로명주소를 보내 주세요.

## 5. 이미지 등록 방식

이미지는 다음 두 방식 중 하나를 선택할 수 있습니다. 차이는 원본 이미지 파일을 누가 Dance Billboard 서버로 전달하느냐입니다. 두 방식 모두 최종적으로 Dance Billboard 내부 저장소에 WebP 4종을 만들기 때문에 등록이 끝난 뒤의 표시 방식은 같습니다.

| 방식 | `image_mode` | 사용 시점 |
|---|---|---|
| Dance Billboard 서버에 파일 업로드 | `upload` | 파트너 서버가 파일을 가지고 있거나 원본 URL에 로그인·만료·핫링크 제한이 있을 때 |
| 공개 이미지 URL 전달 | `url` | Dance Billboard 서버가 로그인 없이 즉시 내려받을 수 있는 공개 HTTPS 이미지 주소가 있을 때 |

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

업로드가 완료되면 서버가 자동으로 실제 이미지인지 검사하고 다음 4종 WebP 파일을 생성합니다. 처리 순서는 수신 중 용량 제한 → 실제 형식·손상·픽셀 수 검사 → 4종 순차 변환 → 각 변환 결과 재검사입니다. 따라서 이미지로 위장한 파일과 깨진 파일은 저장 전에 거부되며, 큰 이미지 여러 장이 동시에 들어와도 순간 메모리 사용량이 급격히 커지지 않도록 처리합니다.

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

즉 `upload` 방식은 두 번 요청합니다. 먼저 이미지 파일을 `POST /images`로 보내고, 그 응답의 `image_url`을 일정 등록 `POST /events`에 사용합니다.

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
- 32MB를 초과하는 파일
- 지나치게 많은 리디렉션을 사용하는 주소
- 확장자가 `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`가 아닌 주소

원본 이미지를 성공적으로 저장한 뒤에는 파트너가 원본 파일을 삭제해도 Dance Billboard에 저장된 일정 이미지는 유지됩니다.

두 방식 모두 이미지 검사나 변환에 실패하면 일정 등록도 실패합니다. 이미지가 필요한 `event`, `class`, `club` 일정이 이미지 없이 새로 저장되는 일은 없습니다.

### 원본 사이트의 일정과 저장 이미지가 연결되는 방식

이미지 파일은 원본 사이트와 분리해 저장하지만 일정의 연결은 끊기지 않습니다. 연결 고리는 **발급받은 API Key의 파트너 계정 + `external_id`**입니다.

| 원본 사이트 작업 | 호출할 API | Dance Billboard 처리 |
|---|---|---|
| 새 일정 등록 | `POST /events` | 일정과 WebP 이미지 4종을 새로 저장합니다. |
| 기존 일정 및 이미지 수정 | 같은 `external_id`로 `PUT /events/{external_id}` | 같은 일정을 찾아 내용을 덮어쓰고, 새 이미지를 검사·변환해 교체한 뒤 이전 이미지를 정리합니다. |
| 기존 일정 삭제 | 같은 `external_id`로 `DELETE /events/{external_id}` | 해당 일정과 연결된 내부 저장 이미지 파일을 함께 삭제합니다. |

원본 사이트의 일정 고유번호를 `external_id`로 정해 등록·수정·삭제에서 계속 동일하게 사용해 주세요. 수정할 때 새 이미지가 있다면 등록 때와 똑같이 `upload` 또는 `url` 방식으로 보내야 합니다. 다른 파트너의 API Key로는 같은 `external_id`를 사용해도 해당 일정이나 이미지에 접근할 수 없습니다.

## 6. 지도에 사용할 도로명주소

Dance Billboard 상세 화면은 카카오맵으로 장소를 표시합니다. 주소는 필수가 아니며 이미지 유무나 분류와도 관계없지만, 주소를 보내면 카카오맵 검색에 그대로 사용됩니다. 부정확한 주소나 장소명만 보내면 카카오맵 검색 결과의 첫 번째 주소가 사용되어 실제 장소와 다른 위치가 표시될 수 있으므로, 가능한 한 확인된 도로명주소를 보내 주세요.

정확한 주소를 확인할 때는 다음 방법 중 파트너 환경에 맞는 것을 선택할 수 있습니다. API 요청에서 확인 방법 자체를 반드시 선택해야 하는 것은 아닙니다.

| 주소 확인 방법 | `address_source` | 사용 방법 |
|---|---|---|
| 다음 우편번호 | `daum_postcode` | 무료 검색창에서 사용자가 도로명주소 선택 |
| 카카오맵 API | `kakao_map` | 파트너가 보유한 API에서 도로명주소 확인 |
| 네이버지도 API | `naver_map` | 파트너가 보유한 API에서 도로명주소 확인 |
| Google Maps API | `google_map` | 대한민국 도로명주소로 정리한 결과만 사용 |
| 도로명주소 API | `road_address_api` | 공공 도로명주소 검색 결과 사용 |

별도 지도 API가 없다면 파트너 등록 화면에 무료 다음 우편번호 서비스를 직접 적용할 수 있습니다. Dance Billboard API Key는 이 검색창에 사용하지 않습니다.

카카오 Local API를 이미 사용하는 파트너는 주소 검색 결과에서 도로명주소를 확인한 뒤 전송해도 됩니다. 카카오 API 사용은 강제하지 않으며 카카오 개발자 앱, REST API Key, 이용 한도와 비용은 파트너가 직접 관리합니다. 자세한 사용법은 [카카오 주소 검색 API 공식 안내](https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord)를 확인해 주세요.

Google Maps를 사용하는 파트너도 연동할 수 있지만 Google의 `formatted_address`, 영문 주소, Plus Code 또는 장소명을 그대로 보내면 안 됩니다. Google 주소 결과는 구성과 표기가 카카오 주소검색과 달라 호환이 보장되지 않습니다. Google 검색 결과에서 대한민국 도로명주소를 별도로 확보해 `address`에 보내고, `address_source`는 `google_map`으로 기록해 주세요. Google 좌표만 보내는 방식은 현재 일정 API에서 지원하지 않습니다. Google 응답의 주소 구성과 좌표 필드는 [Google Geocoding 공식 문서](https://developers.google.com/maps/documentation/geocoding/geocoding)에서 확인할 수 있습니다.

```html
<script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
<script>
function selectRoadAddress() {
  new daum.Postcode({
    oncomplete(data) {
      if (!data.roadAddress) {
        alert('도로명주소를 선택해 주세요.');
        return;
      }
      eventPayload.address = data.roadAddress;
      eventPayload.postal_code = data.zonecode;
      eventPayload.address_source = 'daum_postcode';
    }
  }).open();
}
</script>
<button type="button" onclick="selectRoadAddress()">도로명주소 검색</button>
```

```json
{
  "external_id": "partner-social-20260801-3",
  "title": "금요일 정기 소셜",
  "event_dates": ["2026-08-01"],
  "time": "20:00",
  "category": "social",
  "genre": "소셜",
  "location": "스윙홀",
  "address": "서울 동작구 남부순환로 2077",
  "address_detail": "건축회관 3층",
  "postal_code": "07025",
  "address_source": "daum_postcode",
  "source_url": "https://partner.example.com/socials/3"
}
```

`location`에는 장소명을, `address`에는 선택한 서비스에서 확인한 도로명주소를 넣어 주세요. 층·호수는 지도 검색 주소가 틀어지지 않도록 `address_detail`로 분리합니다. Dance Billboard 서버는 유료 주소 검색을 다시 호출하거나 검색 첫 결과를 임의로 저장하지 않고 필드 형식만 검사합니다. 주소를 생략해도 일정은 등록됩니다.

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
| `address` | 선택 | 지도 연동이 필요할 때 보내는 확인된 행정안전부 도로명주소 |
| `address_detail` | 선택 | 층·호수 등 상세 위치. 지도 검색 주소와 분리 |
| `postal_code` | 선택 | 주소 확인 서비스가 반환한 5자리 우편번호 |
| `address_source` | 선택 | 주소를 확인한 서비스 기록. `daum_postcode`, `kakao_map`, `naver_map`, `google_map`, `road_address_api` 중 하나 |
| `location_link` | 선택 | 공개 HTTPS 지도 또는 장소 링크 |
| `description` | 선택 | 일정 설명, 최대 20,000자 |
| `link_name1` | 선택 | 상세 링크 표시명, 기본값은 `자세히 보기` |
| `image_mode` | 조건부 | 이미지를 사용할 때 `upload` 또는 `url` |
| `image_url` | 조건부 | 이미지를 사용할 때 필수 |
| `venue_name` | 선택 | 생략하면 `location` 값을 사용 |

`external_id`는 매우 중요합니다. 같은 일정을 다시 요청할 때 같은 값을 사용하면 중복 일정을 만들지 않습니다. 수정과 삭제에도 같은 값을 사용합니다.

## 8. 수정과 삭제

수정은 기존 일정의 일부만 바꾸는 방식이 아니라 전체 내용을 다시 보내는 방식입니다.

등록·수정·삭제는 **등록에 사용한 API Key와 `external_id`**로 연결됩니다. 등록 예시에서 정한 `external_id`를 수정 URL, 수정 본문과 삭제 URL에 똑같이 사용하세요. 제목·날짜·시간·장소·설명·이미지는 수정할 수 있지만 `external_id`를 새 값으로 바꾸면 기존 일정을 찾지 못합니다. 새 값으로 `POST`하면 별도 일정 등록으로 처리됩니다.

```http
PUT https://swingenjoy.com/api/external/v1/events/{external_id}
Authorization: Bearer {등록할_때_사용한_동일한_API_KEY}
Content-Type: application/json
```

본문의 값과 형식은 등록 요청 표와 같습니다. 수정은 부분 수정이 아니므로 바꾸지 않는 값도 포함해 현재 일정 전체를 보내 주세요. 본문에 `external_id`를 포함한다면 URL의 값과 같아야 합니다.

수정 요청에는 사용할 이미지를 `upload` 또는 `url` 방식으로 다시 보내 주세요. 서버는 새 이미지 4종을 만든 뒤 일정 연결을 교체하고 이전 저장 이미지를 정리합니다.

```js
const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
const externalId = 'partner-event-20260801-1';
const event = {
  external_id: externalId,
  title: '토요일 린디합 강습 (시간 변경)',
  event_dates: ['2026-08-01'],
  time: '19:30',
  category: 'class',
  genre: '린디합',
  source_url: 'https://partner.example.com/events/1',
  image_mode: 'url',
  image_url: 'https://partner.example.com/images/1-updated.webp',
};
const response = await fetch(
  `https://swingenjoy.com/api/external/v1/events/${encodeURIComponent(externalId)}`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  },
);
const result = await response.json();
if (!response.ok) throw new Error(result.message || '일정 수정 실패');
```

삭제는 다음과 같이 요청합니다.

삭제는 JSON 본문이 필요하지 않습니다. 등록에 사용한 API Key와 같은 `external_id`만 URL에 넣습니다.

```http
DELETE https://swingenjoy.com/api/external/v1/events/{external_id}
Authorization: Bearer {등록할_때_사용한_동일한_API_KEY}
```

```js
const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
const externalId = 'partner-event-20260801-1';
const response = await fetch(
  `https://swingenjoy.com/api/external/v1/events/${encodeURIComponent(externalId)}`,
  {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${API_KEY}` },
  },
);
const result = await response.json();
if (!response.ok) throw new Error(result.message || '일정 삭제 실패');
```

삭제가 성공하면 Dance Billboard의 일정과 그 일정에 연결된 내부 저장 이미지도 함께 삭제됩니다. 다른 파트너의 키로는 일정을 수정하거나 삭제할 수 없습니다. 권한이 없는 일정은 존재 여부도 노출하지 않도록 `404`를 반환합니다.

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
| `413` | `payload_too_large` | JSON 256KB 또는 이미지 32MB를 초과했습니다. | 본문 또는 이미지를 줄여 주세요. |
| `415` | `unsupported_media_type` | 지원하지 않는 이미지 형식입니다. | JPEG, PNG, WebP, AVIF를 사용해 주세요. |
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

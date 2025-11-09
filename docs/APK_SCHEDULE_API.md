# APK 빌보드 스케줄 API

## 개요
Android APK가 빌보드 스케줄 정보를 받아 영상을 선행 로딩하고 재생할 수 있도록 하는 API입니다.

## API 엔드포인트

### 개발 환경 (Replit/로컬)
```
GET http://localhost:3001/api/billboard/:userId/schedule
```

### 프로덕션 환경 (Netlify)
```
GET https://yoursite.netlify.app/.netlify/functions/billboard-schedule?userId={userId}
```

## 요청 예시

### 개발 환경
```bash
GET http://localhost:3001/api/billboard/user123/schedule
```

### 프로덕션 환경
```bash
GET https://yoursite.netlify.app/.netlify/functions/billboard-schedule?userId=user123
```

## 응답 예시

```json
{
  "billboard_user": {
    "id": "user123",
    "name": "홍길동 빌보드"
  },
  "schedule": [
    {
      "type": "WEB",
      "duration": 30,
      "content_data": "https://example.com/billboard/user123",
      "event_id": 1,
      "title": "클래스 이벤트"
    },
    {
      "type": "YOUTUBE",
      "duration": 60,
      "content_data": "dQw4w9WgXcQ",
      "event_id": 2,
      "title": "영상 이벤트"
    },
    {
      "type": "YOUTUBE",
      "duration": 60,
      "content_data": "abc123xyz",
      "event_id": 3,
      "title": "또 다른 영상"
    },
    {
      "type": "WEB",
      "duration": 30,
      "content_data": "https://example.com/billboard/user123",
      "event_id": 4,
      "title": "이미지 이벤트"
    }
  ],
  "settings": {
    "image_duration": 30,
    "video_duration": 60,
    "play_order": "sequential",
    "total_events": 4
  },
  "generated_at": "2025-11-09T00:43:04.798Z"
}
```

## 응답 필드 설명

### `billboard_user`
- `id`: 빌보드 사용자 ID
- `name`: 빌보드 사용자 이름

### `schedule[]` (배열)
각 슬라이드의 정보:

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `"WEB"` \| `"YOUTUBE"` | 콘텐츠 타입 |
| `duration` | `number` | 표시 시간 (초) |
| `content_data` | `string` | WEB: 웹뷰 URL<br>YOUTUBE: videoId |
| `event_id` | `number` | 이벤트 ID |
| `title` | `string` | 이벤트 제목 |

### `settings`
- `image_duration`: 이미지 슬라이드 기본 표시 시간 (초)
- `video_duration`: 영상 슬라이드 기본 표시 시간 (초)
- `play_order`: 재생 순서 (`sequential`, `random`, `time`, `title`, `newest`)
- `total_events`: 총 이벤트 개수

### `generated_at`
- 스케줄 생성 시간 (ISO 8601)

## APK 사용 시나리오

### 1. 앱 시작 시 스케줄 받기
```kotlin
// Retrofit API 호출
val response = apiService.getBillboardSchedule(userId)
val schedule = response.schedule
```

### 2. 영상 선행 로딩 큐 생성
```kotlin
val videoIds = schedule
    .filter { it.type == "YOUTUBE" }
    .map { it.content_data }

// YouTube Player로 미리 로딩
videoIds.forEach { videoId ->
    preloadVideo(videoId)
}
```

### 3. WebView와 YouTube Player 전환
```kotlin
schedule.forEachIndexed { index, item ->
    when (item.type) {
        "WEB" -> {
            // WebView 표시
            webView.loadUrl(item.content_data)
            delay(item.duration * 1000L)
        }
        "YOUTUBE" -> {
            // YouTube Player로 영상 재생
            youtubePlayer.loadVideo(item.content_data)
            delay(item.duration * 1000L)
        }
    }
}
```

## 필터링 로직

서버는 다음 조건으로 이벤트를 필터링합니다:

1. ✅ **이미지/영상 존재**: `image_full`, `image`, `video_url` 중 하나 이상 있어야 함
2. ✅ **제외된 이벤트**: `excluded_event_ids`에 없어야 함
3. ✅ **요일 필터**: `excluded_weekdays`에 없어야 함
4. ✅ **날짜 범위**: `date_filter_start`, `date_filter_end` 범위 내
5. ✅ **만료된 이벤트**: 날짜 필터 없을 시 오늘 이후 이벤트만

## 오류 응답

### 400 Bad Request
```json
{
  "error": "userId가 필요합니다"
}
```

### 404 Not Found
```json
{
  "error": "빌보드 사용자를 찾을 수 없습니다"
}
```

### 500 Internal Server Error
```json
{
  "error": "서버 오류가 발생했습니다",
  "message": "상세 오류 메시지"
}
```

## 주의사항

1. **스케줄 갱신**: 이벤트가 변경되면 API를 다시 호출하여 최신 스케줄을 받아야 합니다.
2. **Random 순서**: `play_order`가 `random`인 경우, APK에서 직접 셔플 처리해야 합니다.
3. **WebView URL**: 모든 `WEB` 타입의 `content_data`는 동일한 빌보드 페이지 URL입니다 (이미지는 웹뷰 내부에서 표시).
4. **Duration 단위**: 모든 `duration` 값은 **초(second)** 단위입니다.

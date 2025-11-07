# 광고판 시스템 - YouTube 재생 및 빌보드 방식 가이드

## 목차
1. [시스템 개요](#시스템-개요)
2. [빌보드 시스템 구조](#빌보드-시스템-구조)
3. [YouTube 재생 방식](#youtube-재생-방식)
4. [자동 재생 로직](#자동-재생-로직)
5. [타이밍 제어](#타이밍-제어)
6. [Android TV 연동](#android-tv-연동)
7. [주요 파일 구조](#주요-파일-구조)

---

## 시스템 개요

광고판 플랫폼은 이벤트와 클래스 정보를 슬라이드쇼 형식으로 보여주는 디지털 빌보드 시스템입니다.

### 주요 특징
- **풀스크린 슬라이드쇼**: 이미지와 YouTube 영상을 자동 재생
- **다중 빌보드 지원**: 각 사용자별 독립적인 빌보드 설정 가능
- **크로스 플랫폼**: 웹 브라우저 + Android TV 지원
- **실시간 업데이트**: Supabase Realtime으로 콘텐츠 자동 동기화
- **세로 모드 최적화**: 40인치 세로 모니터 및 Android TV 전용

---

## 빌보드 시스템 구조

### 1. 빌보드 접근 경로

#### 홈 빌보드 (`/`)
- 메인 페이지에서 비활동 시 자동 실행
- 전체 이벤트 기반 (슈퍼 관리자 설정)
- 설정: `billboard_settings` 테이블 (id: 1)

#### 사용자별 빌보드 (`/billboard/:userId`)
- 각 빌보드 사용자 전용 페이지
- 독립적인 필터링 및 재생 설정
- 설정: `billboard_user_settings` 테이블
- 예시: `/billboard/user123`

### 2. 빌보드 설정 항목

```typescript
interface BillboardSettings {
  enabled: boolean;                // 빌보드 활성화 여부
  autoSlideInterval: number;       // 이미지 슬라이드 간격 (ms)
  videoPlayDuration: number;       // 영상 슬라이드 간격 (ms)
  transitionDuration: number;      // 전환 애니메이션 시간 (ms)
  playOrder: 'random' | 'sequential'; // 재생 순서
  dateRangeStart: string | null;   // 필터: 시작 날짜
  dateRangeEnd: string | null;     // 필터: 종료 날짜
  weekdays: number[];              // 필터: 요일 (0=일요일)
  selectedEventIds: string[];      // 필터: 특정 이벤트만
}
```

### 3. 슬라이드 구성

각 슬라이드는 다음 중 하나:
- **이미지**: 이벤트 썸네일 + 정보 오버레이
- **YouTube 영상**: 이벤트에 등록된 YouTube 링크

---

## YouTube 재생 방식

### 웹 환경 (일반 브라우저)

#### 기술 스택
- **YouTube IFrame Player API**: 공식 JavaScript API
- **React 컴포넌트**: `YouTubePlayer.tsx`

#### 재생 흐름
```
1. 슬라이드 전환 → YouTube 영상 슬라이드 감지
2. iframe 생성 및 YouTube Player 초기화
3. onReady 이벤트 → playVideo() 호출
4. onStateChange 감지 → PLAYING 상태 시 타이머 시작
5. videoPlayDuration 경과 → 다음 슬라이드 전환
```

#### 성능 최적화
- **React.memo**: videoId 기준 메모이제이션
- **Player 재사용**: 동일 영상 재등장 시 Player 객체 재사용
- **지연 로드**: PLAYING 상태 감지 후 타이머 시작 (YouTube iframe 로드 시간 8-10초 고려)

#### 코드 예시
```typescript
// src/components/YouTubePlayer.tsx
<YouTube
  videoId={videoId}
  opts={{
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      showinfo: 0,
      modestbranding: 1,
      rel: 0
    }
  }}
  onReady={(e) => e.target.playVideo()}
  onStateChange={handleStateChange}
/>
```

---

### Android TV 환경 (WebView APK)

#### 문제점
- YouTube iframe Player는 **VP9 코덱 미지원**
- Android TV 브라우저에서 영상 재생 불가

#### 해결 방법: 네이티브 플레이어 자동 호출

#### 기술 구현
1. **플랫폼 감지** (`src/utils/platform.ts`)
```typescript
export function isAndroidWebView(): boolean {
  return typeof window !== 'undefined' && 
         typeof (window as any).Android !== 'undefined';
}
```

2. **네이티브 플레이어 호출**
```typescript
export function playVideoNative(videoId: string): void {
  if (isAndroidWebView()) {
    (window as any).Android.playVideo(videoId);
  }
}
```

3. **자동 호출 로직** (`src/pages/billboard/page.tsx`)
```typescript
useEffect(() => {
  if (currentEvent?.youtube_url && isAndroidWebView()) {
    const videoId = extractYouTubeId(currentEvent.youtube_url);
    if (videoId) {
      playVideoNative(videoId);
    }
  }
}, [currentEventId]);
```

#### Android 환경 동작
```
1. 슬라이드 전환 → YouTube 영상 감지
2. isAndroidWebView() 체크 → true
3. window.Android.playVideo(videoId) 자동 호출
4. APK 네이티브 플레이어 실행 (VP9 지원 ✅)
5. 웹앱은 썸네일만 표시 (iframe 렌더링 안함)
6. videoPlayDuration 경과 → 다음 슬라이드
```

---

## 자동 재생 로직

### 슬라이드 전환 메커니즘

#### 1. 초기 로드
```typescript
useEffect(() => {
  if (events.length > 0) {
    setCurrentEventId(events[0].id);
  }
}, [events]);
```

#### 2. 자동 전환 타이머
```typescript
useEffect(() => {
  if (!currentEventId || events.length === 0) return;

  // 현재 슬라이드 타입 확인
  const currentEvent = events.find(e => e.id === currentEventId);
  const isVideo = currentEvent?.youtube_url;
  const isAndroid = isAndroidWebView();

  // 간격 계산
  let interval: number;
  if (isVideo && isAndroid) {
    interval = videoPlayDuration;  // Android 영상: 설정값 사용
  } else if (isVideo) {
    interval = videoPlayDuration;  // 웹 영상: 설정값 사용
  } else {
    interval = autoSlideInterval;  // 이미지: 이미지 간격 사용
  }

  const timer = setTimeout(() => {
    handleNextSlide();
  }, interval);

  return () => clearTimeout(timer);
}, [currentEventId, events]);
```

#### 3. 다음 슬라이드 선택
```typescript
const handleNextSlide = () => {
  if (playOrder === 'random') {
    // 랜덤: 현재와 다른 슬라이드 선택
    const otherEvents = events.filter(e => e.id !== currentEventId);
    const randomEvent = otherEvents[Math.floor(Math.random() * otherEvents.length)];
    setCurrentEventId(randomEvent.id);
  } else {
    // 순차: 다음 인덱스
    const currentIndex = events.findIndex(e => e.id === currentEventId);
    const nextIndex = (currentIndex + 1) % events.length;
    setCurrentEventId(events[nextIndex].id);
  }
};
```

---

## 타이밍 제어

### 간격 설정값

| 항목 | 설정 필드 | 기본값 | 설명 |
|------|----------|--------|------|
| 이미지 슬라이드 | `auto_slide_interval` | 5000ms | 이미지 표시 시간 |
| 영상 슬라이드 | `video_play_duration` | 10000ms | 영상 재생 시간 |
| 전환 애니메이션 | `transition_duration` | 300ms | fade-in/out 시간 |

### 타이밍 차트

```
[이미지 슬라이드]
├─ 표시: 5000ms (autoSlideInterval)
├─ 페이드 아웃: 300ms (transitionDuration)
└─ 다음 슬라이드

[YouTube 영상 - 웹]
├─ iframe 로드: ~8000ms (자동)
├─ PLAYING 상태 감지
├─ 재생: 10000ms (videoPlayDuration)
├─ 페이드 아웃: 300ms
└─ 다음 슬라이드

[YouTube 영상 - Android]
├─ 썸네일 표시
├─ Android.playVideo() 호출 (즉시)
├─ 네이티브 재생: 10000ms (videoPlayDuration)
├─ 페이드 아웃: 300ms
└─ 다음 슬라이드
```

---

## Android TV 연동

### APK 요구사항

#### 1. WebView 설정
```kotlin
// MainActivity.kt
val webView = findViewById<WebView>(R.id.webView)

webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true
    mediaPlaybackRequiresUserGesture = false
}

// JavaScript 인터페이스 주입
webView.addJavascriptInterface(
    AndroidBridge(this),
    "Android"
)
```

#### 2. JavaScript Bridge 구현
```kotlin
class AndroidBridge(private val activity: MainActivity) {
    
    @JavascriptInterface
    fun playVideo(videoId: String) {
        activity.runOnUiThread {
            // YouTube Android Player API 호출
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("vnd.youtube:$videoId")
            )
            
            // YouTube 앱이 없으면 브라우저로 fallback
            try {
                activity.startActivity(intent)
            } catch (e: Exception) {
                val webIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://www.youtube.com/watch?v=$videoId")
                )
                activity.startActivity(webIntent)
            }
        }
    }
}
```

#### 3. 테스트 방법
1. APK를 Android TV에 설치
2. 빌보드 페이지 접속: `https://your-domain.com/billboard/user123`
3. YouTube 영상 슬라이드 전환 시 자동 재생 확인
4. 영상 종료 후 자동으로 다음 슬라이드 전환 확인

### 디버깅

#### 웹앱 디버그 (Chrome DevTools)
```javascript
// 콘솔에서 Android 인터페이스 확인
console.log(typeof window.Android);  // "object" 또는 "undefined"

// 수동 테스트
if (typeof window.Android !== 'undefined') {
  window.Android.playVideo('dQw4w9WgXcQ');
}
```

#### APK 디버그 (Android Studio Logcat)
```kotlin
@JavascriptInterface
fun playVideo(videoId: String) {
    Log.d("AndroidBridge", "playVideo called with: $videoId")
    // ...
}
```

---

## 주요 파일 구조

```
src/
├── utils/
│   └── platform.ts                    # Android 감지 유틸리티
│
├── components/
│   ├── YouTubePlayer.tsx              # 웹 YouTube Player
│   └── FullscreenBillboard.tsx        # 풀스크린 빌보드 UI
│
├── pages/
│   ├── home/
│   │   └── page.tsx                   # 홈 빌보드 (슈퍼 관리자)
│   └── billboard/
│       └── page.tsx                   # 사용자별 빌보드
│
└── hooks/
    ├── useBillboardSettings.ts        # 홈 빌보드 설정
    └── useBillboardUserSettings.ts    # 사용자 빌보드 설정
```

### 핵심 파일 설명

#### `src/utils/platform.ts`
- Android WebView 감지
- 네이티브 플레이어 호출 인터페이스

#### `src/components/YouTubePlayer.tsx`
- 웹 환경 YouTube iframe Player 래퍼
- React.memo로 성능 최적화
- onStateChange 이벤트 처리

#### `src/components/FullscreenBillboard.tsx`
- 풀스크린 슬라이드쇼 UI
- 자동 전환 로직
- 플랫폼별 타이밍 제어

#### `src/pages/billboard/page.tsx`
- 사용자별 빌보드 페이지
- Android 네이티브 플레이어 자동 호출
- Supabase Realtime 연동

---

## 실시간 업데이트 시스템

### Supabase Realtime 구독
```typescript
const channel = supabase
  .channel('billboard-changes')
  .on('postgres_changes', 
    { 
      event: '*', 
      schema: 'public', 
      table: 'events' 
    },
    handleRealtimeChange
  )
  .subscribe();
```

### 변경 감지 시 동작
```typescript
const handleRealtimeChange = () => {
  // 현재 슬라이드가 비어있으면 즉시 리로드
  if (events.length === 0) {
    window.location.reload();
    return;
  }
  
  // 슬라이드 재생 중이면 다음 전환 시 리로드 예약
  pendingReloadRef.current = true;
  
  // 다음 슬라이드 전환 시 리로드 실행
};
```

---

## 문제 해결 가이드

### 웹에서 YouTube 영상이 안 나올 때
1. YouTube API 스크립트 로드 확인: `index.html`
2. 브라우저 콘솔에서 `window.YT` 객체 확인
3. 네트워크 탭에서 YouTube iframe 로드 확인

### Android TV에서 영상이 안 나올 때
1. `window.Android` 객체 확인 (콘솔)
2. APK의 JavaScript 인터페이스 주입 확인
3. YouTube 앱 설치 여부 확인
4. Logcat에서 `playVideo` 호출 로그 확인

### 슬라이드 전환이 느릴 때
1. `video_play_duration` 설정값 확인
2. YouTube iframe 로드 시간 고려 (8-10초)
3. Android의 경우 네이티브 플레이어 응답 시간 확인

---

## 배포 정보

- **프로덕션**: Netlify
- **개발 서버**: Replit
- **빌드 명령**: `npm run build`
- **배포 자동화**: `scripts/notify-deploy.js`

---

## 연락처

기술 문의: 개발팀
APK 관련: Android 개발자

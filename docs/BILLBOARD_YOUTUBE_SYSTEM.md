# 광고판 시스템 - YouTube 재생 및 빌보드 방식 가이드

## 목차
1. [시스템 개요](#시스템-개요)
2. [핵심 아키텍처: 웹이 지휘자, Android가 연주자](#핵심-아키텍처)
3. [빌보드 시스템 구조](#빌보드-시스템-구조)
4. [YouTube 재생 방식](#youtube-재생-방식)
5. [Android TV APK 연동 가이드](#android-tv-apk-연동-가이드)
6. [자동 재생 로직](#자동-재생-로직)
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

## 핵심 아키텍처

### 🎯 **웹이 지휘자, Android가 연주자**

이 시스템의 핵심은 **역할 분리**입니다:

#### **웹사이트 (지휘자)**
- ✅ **언제, 무엇을 재생할지 결정**
- ✅ **슬라이드 타이밍 제어** (이미지 5초, 영상 10초 등)
- ✅ **자동 전환 관리** (순차/랜덤 재생)
- ✅ **Android에 명령 전달**:
  - `playVideo(videoId)` - 영상 재생 시작
  - `hideVideo()` - 영상 숨김/종료

#### **Android 앱 (연주자)**
- ✅ **웹의 명령만 수행**
- ✅ **두 가지 간단한 함수만 구현**:
  ```kotlin
  window.Android.playVideo(videoId, thumbnailUrl)  // 영상 전체화면 재생 (썸네일 포함)
  window.Android.hideVideo()                       // 영상 숨김
  ```
- ✅ **복잡한 타이밍/로직 불필요** - 모두 웹이 처리

### 왜 이 방식인가?

| 항목 | 기존 방식 | 새로운 방식 (지휘자-연주자) |
|------|----------|--------------------------|
| **APK 복잡도** | 높음 (타이밍, 상태 관리) | 낮음 (2개 함수만 구현) |
| **유지보수** | 웹+앱 둘 다 수정 필요 | 웹만 수정하면 됨 |
| **썸네일 설정** | 제한적 | 웹에서 자유롭게 설정 가능 ✅ |
| **타이밍 제어** | 앱에서 처리 (복잡) | 웹에서 처리 (간단) |

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

#### 재생 방법
- **YouTube IFrame Player API** 사용
- `<iframe>` 태그로 영상 임베드
- 자동 재생 및 루프 재생

#### 동작 흐름
```
1. 슬라이드 전환 → YouTube 영상 슬라이드 감지
2. iframe 생성 및 YouTube Player 초기화
3. autoplay 설정으로 자동 재생
4. videoPlayDuration 경과 → 다음 슬라이드 전환
```

---

### Android TV 환경 (WebView APK)

#### 문제점
- YouTube iframe Player는 **VP9 코덱 미지원**
- Android TV 브라우저에서 영상 재생 불가

#### 해결 방법: 네이티브 플레이어 명령 방식

웹사이트가 Android 앱에 **직접 명령**을 내려 네이티브 YouTube 플레이어를 제어합니다.

#### 1단계: Android 환경 감지

```typescript
// src/utils/platform.ts
export function isAndroidWebView(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.Android !== 'undefined';
}
```

#### 2단계: 명령 전달 함수

```typescript
// 영상 재생 명령 (썸네일 URL 포함)
export function playVideoNative(videoId: string, thumbnailUrl?: string): void {
  if (isAndroidWebView() && window.Android?.playVideo) {
    window.Android.playVideo(videoId, thumbnailUrl);
  }
}

// 영상 숨김 명령
export function hideVideoNative(): void {
  if (isAndroidWebView() && window.Android?.hideVideo) {
    window.Android.hideVideo();
  }
}
```

#### 3단계: 자동 호출 로직

```typescript
// 슬라이드 전환 시
useEffect(() => {
  // 1. 이전 영상 숨김
  hideVideoNative();
  
  // 2. 현재 슬라이드가 영상이면 재생
  if (currentEvent?.youtube_url && isAndroidWebView()) {
    const videoId = extractYouTubeId(currentEvent.youtube_url);
    const thumbnailUrl = currentEvent?.image_full || currentEvent?.image || videoInfo.thumbnailUrl;
    if (videoId) {
      playVideoNative(videoId, thumbnailUrl);
    }
  }
}, [currentIndex]);
```

#### Android 환경 동작 플로우

```
[슬라이드 1: 이미지]
├─ 웹: 썸네일 표시 (5초)
└─ Android: 대기

      ↓ (5초 경과)

[슬라이드 전환]
├─ 웹: hideVideoNative() 호출
└─ Android: (영상 없으므로 무시)

      ↓

[슬라이드 2: YouTube 영상]
├─ 웹: 썸네일 표시 + playVideoNative('dQw4w9WgXcQ', 'https://...') 호출
└─ Android: 네이티브 플레이어 전체화면 재생 (VP9 지원 ✅)
           (썸네일 URL로 로딩 화면 표시 가능)

      ↓ (10초 경과)

[슬라이드 전환]
├─ 웹: hideVideoNative() 호출
└─ Android: 네이티브 플레이어 숨김

      ↓

[슬라이드 3: 이미지]
├─ 웹: 썸네일 표시 (5초)
└─ Android: 대기
```

---

## Android TV APK 연동 가이드

### APK에서 구현할 두 가지 함수

#### 1. `playVideo(videoId: String, thumbnailUrl: String?)`

네이티브 YouTube 플레이어로 영상을 **전체화면 재생**합니다. 썸네일 URL도 함께 전달됩니다.

```kotlin
// MainActivity.kt
class AndroidBridge(private val activity: MainActivity) {
    
    @JavascriptInterface
    fun playVideo(videoId: String, thumbnailUrl: String?) {
        activity.runOnUiThread {
            Log.d("AndroidBridge", "playVideo 호출: videoId=$videoId, thumbnail=$thumbnailUrl")
            
            // 썸네일은 로딩 화면이나 플레이어 백그라운드로 사용 가능
            // 예: Glide로 썸네일 미리 로드 후 네이티브 플레이어 띄우기
            
            // YouTube 앱으로 전체화면 재생
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("vnd.youtube:$videoId")
            )
            
            try {
                activity.startActivity(intent)
            } catch (e: Exception) {
                // YouTube 앱이 없으면 브라우저로 fallback
                val webIntent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://www.youtube.com/watch?v=$videoId")
                )
                activity.startActivity(webIntent)
            }
        }
    }
    
    @JavascriptInterface
    fun hideVideo() {
        activity.runOnUiThread {
            // 현재 재생 중인 영상 Activity 종료
            // (YouTube 앱이 별도 Activity로 실행되므로)
            // 또는 WebView로 돌아오기
        }
    }
}
```

#### 2. WebView 설정

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
    "Android"  // ← window.Android로 접근 가능
)
```

### 구현 요구사항

| 함수 | 필수 기능 | 선택 옵션 |
|------|----------|----------|
| `playVideo(videoId, thumbnailUrl)` | ✅ 네이티브 플레이어로 전체화면 재생<br>✅ 썸네일 URL 수신 | 썸네일 로딩 화면, 오버레이 UI, PiP 모드 |
| `hideVideo()` | ✅ 재생 중인 영상 숨김/종료 | 페이드 아웃 애니메이션 |

### 테스트 방법

#### 1. WebView에서 콘솔 테스트
```javascript
// Chrome DevTools (chrome://inspect)
console.log(typeof window.Android);  // "object"
window.Android.playVideo('dQw4w9WgXcQ', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');  // 영상 재생
window.Android.hideVideo();  // 영상 숨김
```

#### 2. 실제 빌보드 테스트
1. APK를 Android TV에 설치
2. 빌보드 페이지 접속: `https://your-domain.com/billboard/user123`
3. YouTube 영상이 포함된 이벤트 슬라이드 확인
4. **자동으로** 네이티브 플레이어가 재생되는지 확인
5. 슬라이드 전환 시 영상이 자동으로 숨겨지는지 확인

---

## 자동 재생 로직

### 슬라이드 전환 메커니즘

#### 타이밍 제어

```typescript
// 현재 슬라이드 타입 확인
const isVideo = currentEvent?.youtube_url;
const isAndroid = isAndroidWebView();

// 간격 계산
let interval: number;
if (isVideo && isAndroid) {
  interval = videoPlayDuration;  // 예: 10000ms
} else if (isVideo) {
  interval = videoPlayDuration;  // 웹도 동일
} else {
  interval = autoSlideInterval;  // 예: 5000ms
}

// 타이머 설정
setTimeout(() => {
  // 1. 이전 영상 숨김
  hideVideoNative();
  
  // 2. 다음 슬라이드로 전환
  handleNextSlide();
}, interval);
```

#### 타이밍 차트

| 슬라이드 타입 | 웹 환경 | Android 환경 | 간격 |
|-------------|---------|-------------|------|
| 이미지 | 썸네일 표시 | 썸네일 표시 | 5초 (autoSlideInterval) |
| YouTube 영상 | iframe 재생 | 네이티브 재생 | 10초 (videoPlayDuration) |
| 전환 애니메이션 | fade-in/out | fade-in/out | 0.3초 (transitionDuration) |

---

## 주요 파일 구조

```
src/
├── utils/
│   └── platform.ts                    # Android 감지 + 명령 함수
│       ├── isAndroidWebView()
│       ├── playVideoNative(videoId)
│       └── hideVideoNative()
│
├── components/
│   ├── YouTubePlayer.tsx              # 웹 YouTube Player (iframe)
│   └── FullscreenBillboard.tsx        # 풀스크린 빌보드 UI
│       └── 슬라이드 전환 시 hideVideoNative() 호출
│
├── pages/
│   ├── home/
│   │   └── page.tsx                   # 홈 빌보드
│   │       └── 슬라이드 전환 시 hideVideoNative() 호출
│   └── billboard/
│       └── page.tsx                   # 사용자별 빌보드
│           └── 슬라이드 전환 시 hideVideoNative() 호출
│
└── hooks/
    ├── useBillboardSettings.ts        # 홈 빌보드 설정
    └── useBillboardUserSettings.ts    # 사용자 빌보드 설정
```

### 핵심 파일 설명

#### `src/utils/platform.ts`
**역할**: Android WebView 감지 및 명령 인터페이스

```typescript
// TypeScript 인터페이스 정의
interface Window {
  Android?: {
    playVideo: (videoId: string) => void;
    hideVideo: () => void;
  };
}

// 감지 함수
isAndroidWebView()  // Android 환경인지 확인

// 명령 함수
playVideoNative(videoId)  // Android에 재생 명령
hideVideoNative()         // Android에 숨김 명령
```

#### `src/components/FullscreenBillboard.tsx`
**역할**: 풀스크린 슬라이드쇼 UI 및 자동 전환 로직

```typescript
// 슬라이드 전환 타이머
setTimeout(() => {
  hideVideoNative();  // 1. 이전 영상 숨김
  setCurrentIndex(nextIndex);  // 2. 다음 슬라이드
}, interval);

// 슬라이드 변경 시 영상 재생
useEffect(() => {
  if (currentEvent?.youtube_url && isAndroidWebView()) {
    playVideoNative(videoId);
  }
}, [currentIndex]);
```

#### `src/pages/billboard/page.tsx`
**역할**: 사용자별 빌보드 페이지 (Realtime 연동)

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
};
```

---

## 문제 해결 가이드

### 웹에서 YouTube 영상이 안 나올 때
1. YouTube API 스크립트 로드 확인: `index.html`
2. 브라우저 콘솔에서 `window.YT` 객체 확인
3. 네트워크 탭에서 YouTube iframe 로드 확인

### Android TV에서 영상이 안 나올 때

#### 체크리스트
```javascript
// 1. Android 인터페이스 확인 (브라우저 콘솔)
console.log(typeof window.Android);  // "object" 여야 함

// 2. playVideo 함수 존재 확인
console.log(typeof window.Android.playVideo);  // "function" 여야 함

// 3. hideVideo 함수 존재 확인
console.log(typeof window.Android.hideVideo);  // "function" 여야 함
```

#### 디버깅 (Logcat)
```kotlin
@JavascriptInterface
fun playVideo(videoId: String) {
    Log.d("AndroidBridge", "playVideo 호출됨: $videoId")
    // ...
}

@JavascriptInterface
fun hideVideo() {
    Log.d("AndroidBridge", "hideVideo 호출됨")
    // ...
}
```

### 슬라이드 전환이 느릴 때
1. `video_play_duration` 설정값 확인 (기본 10초)
2. Android 네이티브 플레이어 응답 시간 확인
3. 웹에서 hideVideo() 호출이 제대로 되는지 콘솔 로그 확인

---

## 썸네일 설정 기능

### 현재 구현
- ✅ 웹에서 이벤트별 썸네일 자유롭게 설정 가능
- ✅ Android는 `playVideo()` 호출 시 썸네일 URL을 함께 수신
- ✅ 썸네일 우선순위:
  1. 사용자 업로드 이미지 (`event.image_full` 또는 `event.image`)
  2. YouTube 기본 썸네일 (`https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg`)

### 장점
- ✅ Android APK는 웹이 전달한 썸네일 URL만 사용하면 됨
- ✅ 웹 관리자 페이지에서 모든 썸네일 제어
- ✅ 썸네일 변경 시 APK 업데이트 불필요
- ✅ APK는 썸네일을 로딩 화면, 플레이어 백그라운드 등으로 활용 가능

---

## 배포 정보

- **프로덕션**: Netlify
- **개발 서버**: Replit
- **빌드 명령**: `npm run build`
- **배포 자동화**: `scripts/notify-deploy.js`

---

## 요약: APK 개발자가 해야 할 일

### 필수 구현 (2개 함수)

```kotlin
@JavascriptInterface
fun playVideo(videoId: String, thumbnailUrl: String?) {
    // TODO: 네이티브 YouTube 플레이어로 전체화면 재생
    // thumbnailUrl: 사용자 업로드 썸네일 또는 YouTube 기본 썸네일
    // 로딩 화면이나 백그라운드 이미지로 활용 가능
}

@JavascriptInterface
fun hideVideo() {
    // TODO: 재생 중인 영상 숨김/종료
}
```

### 나머지는?
- ❌ **타이밍 제어 불필요** - 웹이 처리
- ❌ **슬라이드 전환 불필요** - 웹이 처리
- ❌ **썸네일 관리 불필요** - 웹이 처리
- ✅ **두 함수만 구현하면 끝!**

---

## 연락처

기술 문의: 개발팀  
APK 관련: Android 개발자

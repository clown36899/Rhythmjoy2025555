# APK 오버레이 시스템

## 개요
Android APK가 투명한 웹뷰로 빌보드 정보 레이어(QR + 제목 + 날짜 + 장소)를 표시할 수 있도록 하는 시스템입니다.

## 아키텍처

### 역할 분리
1. **웹사이트 (광고판)**: 모든 동적 콘텐츠와 디자인 관리
2. **APK**: 웹사이트가 만든 URL을 받아서 투명 웹뷰에 표시

### 데이터 흐름
```
메인 빌보드 (슬라이드 변경)
    ↓
URL 생성 (title, date, location, qrUrl)
    ↓
window.Android.updateOverlay(url)
    ↓
APK 투명 웹뷰 (overlayWebView.loadUrl(url))
    ↓
오버레이 페이지 로드 (/billboard/overlay/:userId?params)
    ↓
QR 코드 자동 생성 + 스타일 적용
```

## 웹사이트 구현

### 1. 오버레이 전용 페이지
```
/billboard/overlay/:userId?title=샘플&date=2025-12-19&location=서울&qrUrl=https://...
```

### 2. URL 파라미터
| 파라미터 | 필수 | 설명 | 예시 |
|---------|------|------|------|
| `userId` | ✅ | 빌보드 사용자 ID | `user123` |
| `title` | ✅ | 이벤트 제목 | `샘플 이벤트` |
| `date` | ⚪ | 날짜 범위 | `2025-12-19~20` |
| `location` | ⚪ | 장소 | `서울 강남구` |
| `qrUrl` | ✅ | QR 코드 URL | `https://yoursite.com/?event=123` |

### 3. 오버레이 페이지 구성
- ✅ **HTML + CSS + QR 생성 로직** 포함
- ✅ **URL 파라미터** 읽어서 동적 렌더링
- ✅ **투명 배경** (APK 투명 웹뷰용)
- ✅ **기존 애니메이션** 그대로 적용

### 4. 메인 빌보드 코드
```typescript
// 슬라이드 변경 시 자동 호출
useEffect(() => {
  const currentEvent = events[currentIndex];
  
  if (currentEvent && userId) {
    const params = new URLSearchParams({
      title: currentEvent.title,
      date: formatDateRange(currentEvent.start_date, currentEvent.end_date),
      location: currentEvent.location || '',
      qrUrl: `${window.location.origin}/?event=${currentEvent.id}&from=qr`,
    });
    
    const overlayUrl = `${window.location.origin}/billboard/overlay/${userId}?${params}`;
    updateOverlayNative(overlayUrl);
  }
}, [currentIndex, events, userId]);
```

## APK 구현

### 1. 인터페이스 정의
```kotlin
@JavascriptInterface
fun updateOverlay(url: String) {
    runOnUiThread {
        overlayWebView.loadUrl(url)
    }
}
```

### 2. 투명 웹뷰 설정
```kotlin
overlayWebView.apply {
    setBackgroundColor(Color.TRANSPARENT)
    setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    settings.javaScriptEnabled = true
    
    // WebViewClient 설정
    webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            return false
        }
    }
}

// JavaScript 인터페이스 등록
overlayWebView.addJavascriptInterface(this, "Android")
```

### 3. 레이아웃 구성
```xml
<FrameLayout>
    <!-- 메인 빌보드 웹뷰 -->
    <WebView
        android:id="@+id/mainWebView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
    
    <!-- 투명 오버레이 웹뷰 -->
    <WebView
        android:id="@+id/overlayWebView"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@android:color/transparent" />
</FrameLayout>
```

### 4. 초기 로드
```kotlin
// 메인 빌보드
mainWebView.loadUrl("https://yoursite.com/billboard/user123")

// 오버레이는 updateOverlay() 호출 시 자동 로드됨
```

## URL 예시

### 개발 환경
```
http://localhost:5000/billboard/overlay/user123?title=%EC%83%98%ED%94%8C&date=2025-12-19&qrUrl=http://localhost:5000/?event=1&from=qr
```

### 프로덕션 환경
```
https://yoursite.netlify.app/billboard/overlay/user123?title=%EC%83%98%ED%94%8C&date=2025-12-19&location=%EC%84%9C%EC%9A%B8&qrUrl=https://yoursite.netlify.app/?event=1&from=qr
```

## QR 코드 처리

### 웹 (자동 생성)
```typescript
import { QRCodeCanvas } from 'qrcode.react';

<QRCodeCanvas
  value={qrUrl}  // URL 파라미터에서 받은 값
  size={qrSize}
  level="M"
  includeMargin={false}
/>
```

### APK (아무것도 안 함)
- ❌ QR 생성 불필요
- ❌ QR 이미지 다운로드 불필요
- ✅ 웹뷰가 자동으로 QR 생성

## 스타일 보존

### CSS 애니메이션
```css
@keyframes slideInLeft { 
  0% { opacity: 0; transform: translateX(-150px); } 
  100% { opacity: 1; transform: translateX(0); } 
}

@keyframes zoomInUp { 
  0% { opacity: 0; transform: scale(0.2) translateY(100px); } 
  100% { opacity: 1; transform: scale(1) translateY(0); } 
}
```

### 동적 스케일링
```typescript
const scale = Math.min(
  window.innerWidth / 1920,
  window.innerHeight / 1080
);

// 모든 크기에 스케일 적용
fontSize: `${titleFontSize * scale}px`
padding: `${32 * scale}px`
```

## 장점

### 1. 안정성
- ✅ 웹 기술로 모든 복잡한 로직 처리
- ✅ APK는 URL만 받아서 표시
- ✅ HTML 코드 문자열 전달 불필요

### 2. 역할 분리
- ✅ 디자인 변경: 웹만 수정
- ✅ APK: 웹뷰 표시만 담당
- ✅ 유지보수 용이

### 3. 동기화
- ✅ 슬라이드 변경 시 자동 업데이트
- ✅ 실시간 정보 반영
- ✅ 타이밍 문제 없음

## 문제 해결

### Q1. 오버레이가 보이지 않아요
```kotlin
// 투명 배경 확인
overlayWebView.setBackgroundColor(Color.TRANSPARENT)
overlayWebView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

### Q2. QR 코드가 안 나와요
```typescript
// URL 파라미터 확인
console.log('qrUrl:', searchParams.get('qrUrl'));
```

### Q3. 애니메이션이 매번 실행돼요
- 정상 동작입니다
- 슬라이드 변경 시마다 새 URL 로드 → 애니메이션 재실행

### Q4. 레이아웃이 깨져요
```typescript
// 화면 크기에 맞는 스케일 계산 확인
const calculateSizes = () => {
  const scale = Math.min(
    window.innerWidth / 1920,
    window.innerHeight / 1080
  );
  setScale(scale);
};
```

## 테스트

### 웹 브라우저 테스트
```
1. http://localhost:5000/billboard/overlay/user123?title=테스트&date=2025-12-19&qrUrl=https://example.com
2. QR 코드 생성 확인
3. 제목, 날짜 표시 확인
4. 애니메이션 동작 확인
```

### APK 테스트
```kotlin
// 테스트 URL 직접 호출
overlayWebView.loadUrl(
    "https://yoursite.com/billboard/overlay/user123?" +
    "title=테스트&date=2025-12-19&qrUrl=https://example.com"
)
```

## 참고

### 관련 파일
- `src/pages/billboard/overlay/page.tsx` - 오버레이 페이지
- `src/pages/billboard/page.tsx` - 메인 빌보드 (updateOverlay 호출)
- `src/utils/platform.ts` - updateOverlayNative 함수
- `src/router/config.tsx` - 라우트 설정

### 관련 API
- `/api/billboard/:userId/schedule` - 스케줄 정보 (선행 로딩용)
- `/billboard/overlay/:userId` - 오버레이 페이지 (실시간 표시용)

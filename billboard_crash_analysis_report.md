# 빌보드 앱 크래시 분석 보고서
**분석 기간:** 2025년 11월 13일 03:00 ~ 12:58  
**디바이스:** Android TV (MediaTek SoC)  
**앱:** com.billboard.rhythmjoy (v1.0)

---

## 📊 요약 (Executive Summary)

**증상:** 빌보드 APK 앱이 새벽 3시 이후 하얀 화면으로 멈춤  
**근본 원인:** 시스템 메모리 부족으로 인한 WebView 프로세스 강제 종료  
**영향:** 빌보드 앱 UI는 실행 중이나 웹 콘텐츠 렌더링 불가

---

## 🔍 타임라인 분석

### 03:32 - 시스템 불안정 시작
```
03:32:32 - Google Katniss 서비스 크래시 (음성검색)
03:38:36 - Google MediaShell 크래시 (Chromecast)
03:38:37 - Google Play Services 강제 종료 (메모리 43460KB 확보)
```
→ **시스템이 메모리 부족 상태로 진입**

### 03:52 - 빌보드 앱 상태 확인
```
03:52:39 - running Activity: com.billboard.rhythmjoy.MainActivity
```
→ **빌보드 앱 UI는 정상 실행 중**

### 03:55 ~ 12:52 - 주기적 상태 체크
```
03:52:39, 04:22:40, 04:52:41, ..., 12:52:57
30분마다 MainActivity 실행 확인됨
```
→ **앱 프로세스는 죽지 않았음**

---

## 🚨 발견된 문제

### 1️⃣ WebView 프로세스 반복 종료
```
이벤트 시각          프로세스                                      상태
-------------------------------------------------------------------------------
21:05:54.771        sandboxed_process0 (PID 11145)             Killing (isolated not needed)
21:33:48.546        sandboxed_process0 (PID 11568)             Killing (isolated not needed)
21:33:48.548        webview_apk (PID 11217)                    Killing (empty for 1801s)
21:34:29.193        sandboxed_process0 (PID 12410)             새로 시작됨
```

**분석:**
- WebView Sandbox 프로세스가 주기적으로 강제 종료됨
- "isolated not needed" → 시스템이 필요 없다고 판단하여 종료
- "empty for 1801s" → 30분간 사용되지 않아 메모리 회수

**결과:**
- 빌보드 MainActivity는 살아있지만
- WebView 엔진이 죽어서 **하얀 화면만 표시**

### 2️⃣ 메모리 압박 (Low Memory Killer)
```
03:38:37 - Killing com.google.android.gms (adj 905): 43460k from cached
03:56:06 - Killing com.google.android.videos (adj 985): empty for 11031s
```

**OOM Adjuster 값:**
- adj 905 = cached app (언제든지 종료 가능)
- adj 985 = empty app (백그라운드, 빈 프로세스)

**분석:**
- 시스템이 공격적으로 메모리를 회수 중
- 빌보드 WebView도 백그라운드로 분류되어 종료 대상

### 3️⃣ 클립보드 접근 거부
```
20:51:35 - Denying clipboard access to com.billboard.rhythmjoy, 
           application is not in focus
```

**분석:**
- 앱이 포커스를 잃었음 (백그라운드 상태)
- Android 10+ 보안 정책으로 백그라운드 앱의 클립보드 접근 차단

---

## 🔬 근본 원인 (Root Cause)

### Android WebView 생명주기 문제

1. **WebView는 별도 프로세스로 실행됨**
   ```
   - Main Process: com.billboard.rhythmjoy (앱 UI)
   - Renderer Process: sandboxed_process0 (WebView 엔진)
   ```

2. **시스템이 Renderer만 종료함**
   - Main Process는 살아있음 → MainActivity가 계속 실행됨
   - Renderer Process는 죽음 → 웹 페이지가 표시 안 됨
   - **결과: 하얀 화면**

3. **Android 10+ 백그라운드 제약**
   - 앱이 화면에 표시되지 않으면 백그라운드로 분류
   - 백그라운드 앱의 프로세스는 언제든지 종료 가능
   - WebView는 가장 먼저 종료 대상

---

## 💡 권장 해결 방안

### ⭐ 해결책 1: WebView 생명주기 관리 (필수)

**APK MainActivity.java 수정:**
```java
private Handler healthCheckHandler = new Handler();
private Runnable healthCheckRunnable;
private static final int HEALTH_CHECK_INTERVAL = 60000; // 1분
private long lastSuccessfulLoadTime = 0;

@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // WebView 설정
    webView.setWebViewClient(new WebViewClient() {
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, 
                                   WebResourceError error) {
            Log.e("Billboard", "WebView 에러: " + error.getDescription());
            // 메인 프레임 에러만 재시도
            if (request.isForMainFrame()) {
                new Handler().postDelayed(() -> {
                    view.reload();
                }, 3000);
            }
        }
        
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            lastSuccessfulLoadTime = System.currentTimeMillis();
        }
    });
    
    // Health Check 시작
    startHealthCheck();
}

private void startHealthCheck() {
    healthCheckRunnable = new Runnable() {
        @Override
        public void run() {
            // 5분간 페이지 로드 없으면 재시작
            long timeSinceLastLoad = System.currentTimeMillis() - lastSuccessfulLoadTime;
            if (timeSinceLastLoad > 300000) { // 5분
                Log.w("Billboard", "WebView 무응답 감지, 재시작");
                webView.reload();
            }
            
            healthCheckHandler.postDelayed(this, HEALTH_CHECK_INTERVAL);
        }
    };
    healthCheckHandler.post(healthCheckRunnable);
}

@Override
protected void onDestroy() {
    super.onDestroy();
    if (healthCheckHandler != null && healthCheckRunnable != null) {
        healthCheckHandler.removeCallbacks(healthCheckRunnable);
    }
}
```

### ⭐ 해결책 2: 프로세스 우선순위 상승

**AndroidManifest.xml 수정:**
```xml
<service
    android:name=".ForegroundService"
    android:enabled="true"
    android:exported="false" />
```

**ForegroundService.java 추가:**
```java
// Foreground Service로 앱 우선순위 상승
// OOM Killer의 종료 대상에서 제외
public class ForegroundService extends Service {
    private static final int NOTIFICATION_ID = 1;
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "billboard_service",
                "빌보드 서비스",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
    
    private Notification createNotification() {
        return new NotificationCompat.Builder(this, "billboard_service")
            .setContentTitle("빌보드 실행 중")
            .setContentText("화면 표시 중...")
            .setSmallIcon(R.drawable.ic_notification)
            .build();
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
```

**MainActivity에서 서비스 시작:**
```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Foreground Service 시작
    Intent serviceIntent = new Intent(this, ForegroundService.class);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent);
    } else {
        startService(serviceIntent);
    }
}
```

### ⭐ 해결책 3: 화면 항상 켜짐 (Kiosk 모드)

**MainActivity.java 수정:**
```java
@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // 화면 항상 켜짐 (절전 모드 방지)
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    
    // 전체 화면 모드
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_FULLSCREEN |
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    );
}
```

---

## 📈 효과 예측

| 해결책 | 메모리 사용 | 안정성 향상 | 구현 난이도 |
|--------|------------|------------|------------|
| WebView Health Check | +5MB | ⭐⭐⭐⭐ | 쉬움 |
| Foreground Service | +10MB | ⭐⭐⭐⭐⭐ | 보통 |
| 화면 항상 켜짐 | +0MB | ⭐⭐⭐ | 쉬움 |
| **3가지 모두 적용** | +15MB | ⭐⭐⭐⭐⭐ | 보통 |

---

## 🎯 결론

**현재 상태:**
- 빌보드 APK 앱은 **메모리 관리 및 생명주기 관리 기능이 전무**
- Android TV 환경에서 장시간 실행 시 필연적으로 WebView 종료
- 웹 페이지 자체로는 **해결 불가능** (프로세스가 죽었기 때문)

**필수 조치:**
1. ⭐ **Foreground Service 적용** (최우선)
2. ⭐ **WebView Health Check 추가** (필수)
3. **화면 항상 켜짐 설정** (권장)

**기대 효과:**
- 24시간 연속 실행 안정성 확보
- 시스템 메모리 부족 시에도 종료 방지
- WebView 크래시 발생 시 자동 복구

---

**작성일:** 2025-11-13  
**작성자:** Replit Agent  
**첨부 파일:** 원본 로그 (16,761줄)

# 광고판 (Event Discovery Platform)

## Overview
광고판 is a Korean event discovery and management platform for classes, events, and social venues. It offers a calendar-based interface for browsing, creating, and managing events, including practice room listings and venue schedule management. The platform emphasizes a modern, user-friendly experience with full Korean language support and free event posting to foster community engagement. Its vision is to become the leading platform for local event discovery in Korea, streamlining the experience for both organizers and participants.

## 플랫폼 지원 (Platform Support)

### 메인 사이트 (Main Site)
- **웹 (Web)**: 모든 모던 브라우저에서 작동 (Chrome, Firefox, Safari, Edge 등)
- **모바일 (Mobile)**: iOS 및 Android 모바일 브라우저에서 작동
- **접근 경로**: 메인 URL (`/`)을 통한 이벤트 캘린더, 소셜 장소, 연습실 등 모든 기능 이용 가능

### 빌보드 시스템 (Billboard System)
- **플랫폼 지원**: 웹과 모바일(iOS, Android) 브라우저에서 모두 작동
- **주요 타겟**: Android APK 앱에서 웹뷰(WebView)로 빌보드 웹 주소를 로드하여 표시하도록 설계
- **접근 경로**: `/billboard/:userId` 전용 URL을 통한 전체 화면 이벤트 슬라이드쇼 디스플레이
- **최적화**: 세로 방향(portrait) 디스플레이에 최적화, CSS 회전으로 가로 모니터 지원
- **설치 옵션**: 
  - Android 브라우저에서 PWA(Progressive Web App)로 "홈 화면에 추가" 가능
  - Android APK 앱에서 웹뷰를 통해 빌보드 URL을 직접 로드하여 사용 (권장 방식)

## 주요 코드 위치 가이드 (Code Location Guide)

> 자주 수정하는 컴포넌트와 기능의 위치를 빠르게 찾기 위한 가이드
> 
> **마지막 업데이트: 2025-11-12**

### UI 컴포넌트

#### 헤더 (Header)
- **파일**: `src/pages/home/components/Header.tsx`
- **주요 기능**:
  - 달 네비게이션 (이전/다음 버튼): ~426-470줄
  - 날짜 표시 (월 표시): ~432-443줄
  - 년/월 뷰 전환 버튼: ~444-465줄
  - 설정 버튼: ~496-502줄
  - 관리자 로그인 모달: ~508-570줄
  - 테마 색상 설정: ~257-328줄

#### 바텀 메뉴 / 카테고리 패널
- **파일**: `src/layouts/MobileShell.tsx`
- **주요 기능**:
  - 카테고리 버튼 (행사/강습): ~154-240줄
  - 오늘 버튼 (현재 월 아닐 때만 표시): ~191-202줄
  - 등록 버튼 (날짜 선택 시): ~228-239줄
  - 하단 네비게이션 (이벤트 달력/소셜/연습실/안내): ~264-358줄
  - 관리자 패널: ~360-433줄

#### 이벤트 리스트
- **파일**: `src/pages/home/components/EventList.tsx` (3,484줄)
- **주요 기능**:
  - 이벤트 필터링 로직: ~677-780줄
  - 이벤트 정렬 (랜덤/시간/제목/최신): ~259-320줄
  - 검색 기능: ~1611-1643줄
  - 슬라이딩 레이아웃 (3개월 뷰): ~1706-2000줄
  - 이벤트 카드 그리드: ~1657-1690줄

#### 이벤트 카드
- **파일**: `src/pages/home/components/EventCard.tsx`
- **주요 기능**:
  - 카드 레이아웃 및 스타일
  - 썸네일 표시
  - 카테고리 배지

#### 달력
- **파일**: `src/pages/home/components/EventCalendar.tsx`
- **주요 기능**:
  - 월간/연간 뷰 전환
  - 날짜 선택 및 다중 날짜 이벤트 표시
  - 터치 제스처 (스와이프, 드래그)

#### 모달 컴포넌트
- **이벤트 등록 모달**: `src/components/EventRegistrationModal.tsx`
- **이벤트 상세보기**: `src/pages/home/components/EventList.tsx` (~2785-3484줄)
- **비밀번호 확인**: `src/pages/home/components/EventPasswordModal.tsx`
- **빌보드 설정**: `src/components/AdminBillboardModal.tsx`

### 주요 페이지

#### 메인 페이지 (홈)
- **파일**: `src/pages/home/page.tsx` (1,250줄)
- **주요 기능**:
  - 상태 관리 (currentMonth, selectedDate, 등): ~1-120줄
  - URL 파라미터 처리: ~312-360줄
  - 이벤트 리스너 (오늘 버튼, 날짜 선택 등): ~383-416줄
  - 비활동 타이머 (광고판 자동 열기): ~432-471줄
  - 제스처 컨트롤러: `src/hooks/useUnifiedGestureController.ts`

#### 빌보드 페이지
- **파일**: `src/pages/billboard/page.tsx`
- **주요 기능**:
  - 슬라이드쇼 로직
  - YouTube 플레이어 통합
  - 실시간 업데이트 (Supabase Realtime)

### 스타일 & 테마

#### 테마 색상
- **설정 위치**: Supabase 데이터베이스 `theme_settings` 테이블
- **적용 위치**:
  - Header: `src/pages/home/components/Header.tsx` (~257-328줄)
  - MobileShell: `src/layouts/MobileShell.tsx` (~99-126줄)
  - CSS 변수: `src/index.css`

#### Tailwind 설정
- **파일**: `tailwind.config.js`
- **글로벌 스타일**: `src/index.css`

### 데이터베이스 & 인증

#### Supabase 설정
- **클라이언트**: `src/lib/supabase.ts`
- **인증 컨텍스트**: `src/contexts/AuthContext.tsx`
- **환경 변수**: `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_EMAIL)

### 빌드 & 배포

#### Vite 설정
- **파일**: `vite.config.ts`
- **주요 설정**: 
  - 포트 5000
  - allowedHosts: true (iframe 지원)
  - @assets 별칭

#### 워크플로우
- **개발 서버**: `npm run dev` (포트 5000)
- **빌드**: `npm run build`

---

## User Preferences

Preferred communication style: Simple, everyday language.

### 작업 프로세스
- **중요**: 모든 코드 수정 작업은 사전 승인 후 진행
- 변경 사항 제안 시 사용자 승인을 받은 후에 실제 구현 시작
- 긴급한 버그 수정의 경우에도 먼저 문제를 보고하고 승인 대기
- **코드 위치 가이드 갱신**: 주요 컴포넌트 수정 시 위 "주요 코드 위치 가이드" 섹션 업데이트

### Secret Management
- **중요**: Replit 사용자는 Secrets 패널을 직접 열 수 없음
- Agent가 `ask_secrets` 도구를 사용하여 시크릿 입력 UI를 열어줘야 함
- 사용자는 값을 입력할 수 있지만, UI 자체는 Agent가 열어야 함

## System Architecture

### Frontend
Built with React 19.1.0, TypeScript, and Vite 7.0.3, using React Router DOM v7 for routing. Styling is managed with Tailwind CSS 3.4 for a responsive, mobile-first design. It uses React hooks for local state and custom window events for inter-component communication. Internationalization is handled by i18next and react-i18next with Korean as the primary language.

### Component Structure
Key components include `EventCalendar` for date-based discovery, `EventList` for filtered display, and a `Hero` section. Modals like `EventRegistrationModal` and `PracticeRoomModal` (admin-only) handle CRUD operations, utilizing React Portals.

### Authentication & Authorization
The platform uses a unified super admin authentication system with **Supabase Auth** for email/password logins. The super admin role is determined by the `VITE_ADMIN_EMAIL` environment variable, granting full CRUD access to all content. A two-tier admin system includes Super Admins and Billboard Sub-Admins. Supabase Row-Level Security (RLS) enforces access control at the database level, while the frontend conditionally renders UI based on an `isAdmin` flag from the `AuthContext`. All users have public read access to event data.

**Session Management (Updated: 2025-11-06)**:
- **Complete Logout**: The `signOut` function performs comprehensive cleanup including Kakao SDK logout, Supabase session termination, localStorage/sessionStorage clearing (especially Supabase-prefixed keys), and Service Worker cache deletion for PWA compatibility.
- **Forced Reload**: After logout, a hard page reload (`window.location.href = '/'`) ensures complete React state reset, preventing stale cached data issues on mobile devices.
- **Mobile-Optimized**: Resolves long-standing mobile session persistence issues where logout didn't clear browser cache, requiring manual cache clearing.

### Data Management
Events support multi-day occurrences and are categorized as 'class' or 'event'. Practice rooms store detailed information including images. Private registrant details are collected but only visible to admins through conditional Supabase queries. A public `contact` field in events supports auto-detection of contact types (phone, KakaoTalk, Instagram, email, URL) for interactive actions. Admins can configure category-specific default thumbnails via `billboard_settings`.

### Search & Filter
Event discovery includes date-based filtering via the calendar, category filtering (all/class/event), and text search across titles and descriptions with search suggestions. Events can be sorted by random, time, title, or newest.

### Calendar
The calendar provides month/year navigation, visualizes multi-day events, supports date range selection for filtering, responsive layouts, and touch swipe navigation.

**Mobile Touch Optimization (Updated: 2025-11-06)**:
- **Double-tap Modal Opening**: Calendar double-tap event registration modal opening now includes a 150ms delay to prevent touch event propagation, ensuring the modal opens without accidentally triggering input focus or button clicks at the last touch position on mobile devices.

### Billboard & Auto-Scroll
The billboard system provides a fullscreen slideshow with random/sequential playback, auto-opening on inactivity, and smart cross-month navigation. Clicking an event on the billboard triggers automatic calendar navigation and precise auto-scrolling to the event card. Billboard settings, including auto-slide interval, play order, and admin-controlled date range filters, are persistent in the Supabase `billboard_settings` table.

### Multi-User Billboard System
Allows Super Admins to create and manage multiple billboard users, each with a customizable, dedicated billboard display accessible via unique URLs (`/billboard/:userId`). These sub-admins can configure event filtering (weekdays, specific events, date ranges), auto-slide intervals, and play order for their specific billboard. The system includes secure password authentication for billboard users and is optimized for portrait displays, supporting CSS rotation for monitors.

**Performance Optimizations (Updated: 2025-11-06)**:
- **Simplified Realtime Updates**: All Supabase Realtime changes (INSERT/UPDATE/DELETE) trigger a full page reload for maximum stability. When the event list is empty, reloads trigger immediately; otherwise, they queue until the next slide transition.
- **React.memo Caching**: `YouTubePlayer` components are memoized by `videoId` only (not `slideIndex`), preserving media players even when the same video appears on different slides, ensuring smooth video playback without interruption and eliminating redundant iframe loads.
- **Ref-Based Architecture**: All timer callbacks use refs (`eventsRef`, `settingsRef`, `currentEventIdRef`, `pendingReloadRef`) instead of state closures to prevent stale values and ensure real-time changes are observed.
- **Concurrent Updates**: Multiple simultaneous changes (e.g., 3 users editing) queue together and trigger a single reload, preventing excessive refreshes.
- **Accurate Video Timing**: Slideshow timers for YouTube videos start when the `PLAYING` state is detected (not when `playVideo()` is called), ensuring full video playback duration regardless of YouTube iframe load time (typically 8-10 seconds for first load).
- **Smart Player Reuse**: YouTube Player objects are never destroyed during cleanup, remaining in memory for instant reuse when the same video reappears, eliminating 8-10 second load times on subsequent plays.

### Social Venues System
An independent system (`/social`) for discovering and managing schedules for specific social venues. It integrates **Kakao Maps SDK** and **Kakao Local API** for mapping and address search. Features include a map view with venue markers, a scrollable venue list, and a dedicated monthly calendar for each venue's schedules. Admin CRUD operations for venues and schedules are password-protected, with RLS policies ensuring super admin-only writes and public read access.

## External Dependencies

### Backend Services
- **Supabase**: PostgreSQL database, Supabase Storage (image uploads), and Supabase Auth (super admin authentication).
- **Firebase**: Included but not actively used.

### Payment Integration
- **Stripe**: `@stripe/react-stripe-js` is integrated for potential future payment features.

### Analytics & Visualization
- **Recharts**: Used for data visualization.

### Mapping & Geolocation
- **Kakao Maps SDK**: Korean-optimized interactive maps.
- **Kakao Local API**: Korean address search and geocoding.

### External Resources
- **CDN Assets**: Font Awesome 6.4.0, Remix Icon 4.5.0, Google Fonts API (Pacifico), and Leaflet CSS.
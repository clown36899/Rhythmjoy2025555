# 광고판 (Event Discovery Platform)

## Overview
광고판 is a Korean event discovery and management platform for classes, events, and social venues. It provides a calendar-based interface for browsing, creating, and managing events, including practice room listings and venue schedule management. The platform aims to be a user-friendly solution for local event discovery in Korea, offering free event posting and full Korean language support to foster community engagement.

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
The frontend is built with React 19.1.0, TypeScript, and Vite 7.0.3, utilizing React Router DOM v7 for navigation. Tailwind CSS 3.4 is used for responsive, mobile-first styling. The application employs React hooks for state management, custom window events for inter-component communication, and i18next with react-i18next for internationalization, primarily in Korean. Key components include `EventCalendar`, `EventList`, and modals for CRUD operations using React Portals.

### Authentication & Authorization
The platform uses Supabase Auth for a unified super admin authentication system, determined by the `VITE_ADMIN_EMAIL` environment variable. This grants full CRUD access. A two-tier admin system supports Super Admins and Billboard Sub-Admins. Supabase Row-Level Security (RLS) enforces database-level access control, and the frontend conditionally renders UI based on an `isAdmin` flag. All users have public read access to event data. Session management includes comprehensive logout procedures (Kakao SDK, Supabase, localStorage/sessionStorage, Service Worker cache) followed by a hard page reload to ensure complete state reset, particularly for mobile devices.

### Data Management
Events support multi-day occurrences and are categorized. Practice rooms include detailed information. Private registrant details are collected for admin view only. A public `contact` field in events supports auto-detection of contact types. Admins can configure category-specific default thumbnails via `billboard_settings`.

### Search & Filter
Event discovery features date-based filtering via the calendar, category filtering (all/class/event), and text search across titles and descriptions with suggestions. Events can be sorted by random, time, title, or newest.

### Calendar
The calendar offers month/year navigation, visualizes multi-day events, supports date range selection, and features responsive layouts with touch swipe navigation. Mobile optimization includes a 150ms delay for double-tap event registration modal opening to prevent accidental input focus.

### Billboard & Auto-Scroll
The billboard system provides a fullscreen slideshow with random/sequential playback, auto-opening on inactivity, and smart cross-month navigation. Event clicks on the billboard trigger automatic calendar navigation and auto-scrolling to the event card. Billboard settings (auto-slide interval, play order, date range filters) are persistent in Supabase.

This system supports multi-user billboards, allowing Super Admins to create dedicated billboard displays for sub-admins via unique URLs (`/billboard/:userId`). Sub-admins can customize event filtering, auto-slide intervals, and play order. It's optimized for portrait displays with CSS rotation support.

**Performance & Memory Optimizations (Updated: 2025-11-13)**:
- **Realtime Updates**: Full page reloads for Supabase changes ensure stability; queued until next slide transition when events exist
- **React.memo Caching**: `YouTubePlayer` components memoized by `videoId` to preserve players across slides
- **Ref-Based Architecture**: Timer callbacks use refs to prevent stale closure values
- **Smart Player Reuse**: YouTube Player objects retained in memory for instant reuse, eliminating 8-10s load times
- **Video End Handling**: Videos ending before configured duration immediately transition to next slide (no loop replay) to prevent memory buildup
- **CPU Optimization**: Billboard logging disabled in production (`ENABLE_BILLBOARD_LOGS = false`) for 20-30% CPU reduction
- **APK WebView Compatibility**: Designed for long-running Android APK WebView environments with strict memory management (target 50-60MB)

**Known Issues & Solutions (Updated: 2025-11-13)**:
- **YouTube Thumbnail Display (Resolved)**: Changed thumbnail URL from `maxresdefault.jpg` to `hqdefault.jpg` in `src/utils/videoEmbed.ts` to ensure compatibility with all YouTube videos (many lack max-resolution thumbnails, causing 404 errors)

### Social Venues System
An independent system (`/social`) manages social venue schedules, integrating Kakao Maps SDK and Kakao Local API for mapping and address search. It includes a map view, a scrollable venue list, and monthly calendars for schedules. Admin CRUD operations for venues and schedules are password-protected, with RLS ensuring super admin-only writes and public read access.

## External Dependencies

### Backend Services
- **Supabase**: PostgreSQL database, Supabase Storage (image uploads), and Supabase Auth (super admin authentication).

### Payment Integration
- **Stripe**: Integrated for potential future payment features.

### Analytics & Visualization
- **Recharts**: Used for data visualization.

### Mapping & Geolocation
- **Kakao Maps SDK**: Korean-optimized interactive maps.
- **Kakao Local API**: Korean address search and geocoding.

### External Resources
- **CDN Assets**: Font Awesome 6.4.0, Remix Icon 4.5.0, Google Fonts API (Pacifico), and Leaflet CSS.
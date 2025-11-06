# 광고판 (Event Discovery Platform)

## Overview
광고판 is a Korean event discovery and management platform for classes, events, and social venues. It offers a calendar-based interface for browsing, creating, and managing events, including practice room listings and venue schedule management. The platform emphasizes a modern, user-friendly experience with full Korean language support and free event posting to foster community engagement. Its vision is to become the leading platform for local event discovery in Korea, streamlining the experience for both organizers and participants.

## User Preferences

Preferred communication style: Simple, everyday language.

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
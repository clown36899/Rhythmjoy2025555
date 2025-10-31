# 광고판 (Event Discovery Platform)

## Overview

광고판 is a Korean event discovery and management platform focused on classes (강습), events (행사), and social venues (소셜 장소). It provides a calendar-based interface for event browsing, creation, and management, including practice room listings and venue schedule management. The platform aims to be a modern, easy-to-use application with full Korean language support and free event posting to foster community engagement. Its business vision is to become the leading platform for local event discovery in Korea, offering a streamlined experience for both organizers and participants.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The application is built with React 19.1.0 and TypeScript, using Vite 7.0.3 for fast development and bundling. React Router DOM v7 handles client-side routing. Styling is managed with Tailwind CSS 3.4, ensuring a responsive, mobile-first design without reliance on third-party UI frameworks. The architecture uses React hooks for local state management and custom window events for inter-component communication, avoiding global state libraries. Internationalization is implemented using i18next and react-i18next, with Korean as the primary language.

### Component Architecture
Key components include the `EventCalendar` for date-based discovery, `EventList` for filtered event display, and a `Hero` section. `EventRegistrationModal` allows event creation with image upload and multi-link support, while `PracticeRoomModal` handles CRUD operations for practice rooms (admin-only). Modals utilize React Portals for overlay UI. The home page integrates these components, offering a comprehensive event discovery experience.

### Authentication & Authorization System
**Unified Super Admin Authentication** (October 2025):
- **Supabase Auth Integration**: Email/password authentication via Supabase Auth
- **Environment-Based Access Control**: Super admin role determined by `VITE_ADMIN_EMAIL` environment variable
- **Two-Tier Admin System**:
  - **Super Admin**: Full CRUD access to all content (events, social venues, practice rooms, billboard settings). Authenticated via Supabase Auth with email matching `VITE_ADMIN_EMAIL`.
  - **Billboard Sub-Admins**: Limited access to manage only their own billboard displays. Uses legacy salt+SHA-256 password hashing (separate from Supabase Auth).
- **Security Architecture**:
  - **Frontend Layer**: `AuthContext` provides `useAuth()` hook with `isAdmin` flag. UI elements conditionally rendered based on admin status.
  - **Database Layer**: Supabase Row-Level Security (RLS) policies enforce super admin email restrictions on INSERT/UPDATE/DELETE operations via `auth.jwt()->>'email'` checks.
  - **Public Read Access**: All users can read events, social venues, and schedules. Only authenticated super admin can mutate data.
- **Login UI**: Settings modal offers tabbed login (Super Admin / Billboard Admin) with appropriate form fields (email+password for super, password-only for billboard users).

### Data Layer
Events support multi-day occurrences with `start_date` and `end_date` fields, alongside a legacy `date` field for backward compatibility. Events are categorized as 'class' (purple) or 'event' (blue). Practice rooms include details like name, address, description, images, and links. Image handling involves file upload previews and storage via Supabase.

**Registrant Information Privacy**: Events include private registrant fields (`organizer_name`, `organizer_phone`) that are required during registration but only visible in admin mode. Non-admin users never receive these fields via network requests—EventList uses conditional Supabase queries that explicitly exclude sensitive columns when `isAdminMode=false`. Billboard queries also exclude registrant data for all users.

**Contact Information & Auto-Linking**: Events include a public `contact` field for participant inquiries. The system automatically detects contact types (phone numbers, KakaoTalk IDs, Instagram handles, email, URLs) and generates appropriate actions—clicking opens the respective app (phone dialer, Instagram, etc.) or copies text to clipboard. Multiple contact methods can be comma-separated, each rendered as an individual interactive button with auto-detected icons and action types.

**Category-Specific Default Thumbnails**: Admin can configure separate default thumbnails for events without images via `billboard_settings` table (`default_thumbnail_class` for 강습, `default_thumbnail_event` for 행사). The `getEventThumbnail` utility applies these defaults to event banners and detail views (but NOT to billboard displays). Defaults display even when a video URL is present, ensuring consistent visual presentation across the main site.

### Search & Filter Architecture
Event discovery features date-based filtering via calendar selection, category filtering (all/class/event), and text search across titles and descriptions. Search suggestions are generated from existing event titles. Events can be sorted by random, time, title, or newest.

### Calendar Implementation
The calendar provides month/year navigation and visualizes multi-day events as horizontal bars spanning dates, with distinct styling for start, middle, end, and single-day events. It supports date range selection for filtering the event list, responsive grid layouts, and touch swipe navigation on mobile.

### Billboard & Auto-Scroll System
The billboard (fullscreen slideshow) features random/sequential playback, auto-opening on inactivity, and smart cross-month navigation. When clicking "상세보기" on a billboard event:
1. **Cross-month navigation**: Calendar automatically switches to the event's month before highlighting
2. **Reliable auto-scroll**: Uses nonce-based re-triggering, requestAnimationFrame (2 frames) for layout stabilization, automatic scroll container detection, and data-attribute selectors for robustness
3. **Scroll positioning**: Event card positioned exactly 5px below category panel using container-relative coordinates
4. **User interaction**: Highlight dismisses on click/wheel/keydown/touch or after 3 seconds, with listener registration delayed 600ms to avoid conflicts with scroll animation

**Billboard Settings (DB-Persisted)**: All billboard configuration is stored in Supabase `billboard_settings` table (single-row, id=1) including enabled state, auto-slide interval, inactivity timeout, transition duration, play order (sequential/random), and admin-controlled date range filters (start/end dates with optional on-screen display). Settings use upsert operations to ensure persistence even if the initial row is missing. The system no longer filters events to "today or later" by default—admins have full control over the displayed date range.

### Multi-User Billboard System
A hierarchical management system allows super admins to create and manage multiple billboard users, each with their own customizable billboard display accessible via unique URLs (`/billboard/:userId`). Key features:

**Billboard Users (Sub-admins)**:
- Each user has a dedicated billboard page with portrait (vertical) layout optimized for 40-inch monitors
- Customizable event filtering per user:
  - Exclude specific weekdays (e.g., remove weekends)
  - Exclude individual events by ID
  - Date range filtering (start/end dates)
  - Auto-slide interval and play order (sequential/random)
- Secure password authentication using salt + 10,000-iteration SHA-256 hashing
- Each billboard user gets a shareable URL for their customized billboard

**Super Admin Controls**:
- Create/delete billboard users via "빌보드 사용자 관리" in admin settings
- Edit settings for all billboard users
- Copy shareable URLs for distribution
- Full CRUD access to all billboard configurations

**Portrait Billboard Display**:
- Optimized for vertical monitors (1080x1920 or similar)
- CSS rotation (90deg) for monitors without auto-rotation detection
- Works with monitors physically rotated but recognized as landscape by the system
- Fullscreen event slideshow with automatic transitions
- Event information overlay (title, time, location, price)
- User name and slide count indicator
- Filtering applied in real-time based on user settings

**Data Model**:
- `billboard_users` table: user credentials and metadata
- `billboard_user_settings` table: per-user filtering and display preferences
- Row-level security policies ensure public read access for active billboards

### Social Venues System
A separate venue management system (`/social`) allows users to discover and manage schedules for specific locations. This system is completely independent from the main events calendar:

**Architecture**:
- Dedicated route (`/social`, `/social/:placeId`) with its own page and components
- **Kakao Maps SDK**: Korean-optimized mapping with road/satellite view toggle
- **Kakao Local API**: Accurate Korean address search and geocoding
- Bottom navigation integration with green highlight color
- API Keys: Uses `VITE_KAKAO_JAVASCRIPT_KEY` and `VITE_KAKAO_REST_API_KEY` environment variables

**Features**:
- **Map View**: Seoul-centered map displaying all registered venues as markers
- **Venue List**: Scrollable list of venues with addresses and descriptions
- **Venue Calendar**: Full-screen monthly calendar for each venue showing daily schedules
- **Admin CRUD**: Password-protected venue and schedule creation/editing/deletion

**Data Model**:
- `social_places` table: venue information (name, address, lat/lng, contact, description)
- `social_schedules` table: venue-specific schedules (title, date, time range, description)
- Foreign key relationship: `social_schedules.place_id` → `social_places.id`
- **RLS Policies**: Public read access, super admin-only writes (enforced by `auth.jwt()->>'email'` matching `VITE_ADMIN_EMAIL`)

**User Experience**:
- Click venue on map or list → view monthly calendar
- Admin mode: click dates to add/edit schedules, manage venues
- Automatic address geocoding when creating venues
- Deep-linkable URLs for sharing specific venue calendars

## External Dependencies

### Backend Services
- **Supabase**: Primary backend for PostgreSQL database (event/practice room/social venue data), Supabase Storage (image uploads), and **Supabase Auth** (super admin authentication with email/password).
- **Firebase**: Included (v12.0.0) but not actively used, likely for future features like analytics.

### Payment Integration
- **Stripe**: `@stripe/react-stripe-js` (v4.0.2) is integrated, suggesting future support for paid events or premium features.

### Analytics & Visualization
- **Recharts (v3.2.0)**: Included for data visualization, likely planned for admin dashboards or event statistics.

### Mapping & Geolocation
- **Kakao Maps SDK**: Korean-optimized interactive maps with road/satellite views
- **Kakao Local API**: Korean address search and geocoding service
- Platform registration required at https://developers.kakao.com/

### External Resources
- **CDN Assets**: Font Awesome 6.4.0, Remix Icon 4.5.0, Google Fonts API (Pacifico font), and Leaflet CSS from CDN.
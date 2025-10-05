# 광고판 (Event Discovery Platform)

## Overview

광고판 is a Korean event discovery and management platform that allows users to browse, create, and manage events such as classes (강습) and events (행사). The application features a calendar-based interface for event discovery, with support for practice room listings and admin capabilities for content management. Built as a modern single-page application, it emphasizes ease of use with Korean language support and free event posting for the community.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 19.1.0 with TypeScript for type-safe component development
- Vite 7.0.3 as the build tool and dev server for fast HMR (Hot Module Replacement)
- React Router DOM v7 for client-side routing with basename support for flexible deployment paths
- SWC plugin for faster compilation compared to Babel

**State Management & Data Flow:**
- Local component state using React hooks (useState, useEffect, useRef)
- Event-driven communication between components using custom window events (e.g., 'eventDeleted')
- Props drilling for parent-child component communication
- No global state management library (Redux, Zustand, etc.) - relies on React's built-in capabilities

**UI & Styling:**
- Tailwind CSS 3.4 for utility-first styling with PostCSS processing
- Responsive design patterns with mobile-first approach
- Custom component library without third-party UI frameworks
- Font Awesome and Remix Icon for iconography
- Google Fonts (Pacifico) for custom typography

**Developer Experience:**
- Auto-import configuration using unplugin-auto-import for React hooks and React Router hooks
- TypeScript strict mode enabled with comprehensive linting rules
- ESLint 9.30 with React-specific plugins for code quality
- Source maps enabled for debugging

**Route Structure:**
- Centralized route configuration in `src/router/config.tsx`
- Global navigation instance exposed via `window.REACT_APP_NAVIGATE` for programmatic navigation
- 404 fallback page for unmatched routes

### Internationalization (i18n)

**Implementation:**
- i18next with react-i18next for translation management
- Browser language detection for automatic locale selection
- Modular translation files organized by language in `src/i18n/local/`
- Dynamic import of translation modules using Vite's glob import
- English as fallback language with Korean (ko) as primary

### Component Architecture

**Page Structure:**
- Home page as the main entry point with three core sub-components:
  - **EventCalendar**: Month/day view with event indicators
  - **EventList**: Filtered event display with search and sorting
  - **Hero**: Landing section with CTAs

**Shared Components:**
- **EventRegistrationModal**: Form for creating new events with image upload and multi-link support
- **PracticeRoomModal**: CRUD interface for practice room listings (admin-only editing)
- **Header/Footer**: Consistent layout elements

**Modal Pattern:**
- React Portal-based modals for overlay UI
- Controlled component pattern with isOpen/onClose props
- Form state management within modal components

**Admin Mode:**
- Toggleable admin interface for content management
- Password-protected event editing and deletion
- Separate admin UI flows within existing components

### Data Layer

**Event Data Model:**
```typescript
{
  id: number
  title: string
  date: string
  time: string
  location: string
  category: 'class' | 'event'
  description: string
  organizer: string
  image: string (URL)
  link1-3: optional URLs
  link_name1-3: optional link labels
  password: string (for editing)
  created_at/updated_at: timestamps
}
```

**Practice Room Model:**
- Name, address, description
- Multiple images array
- Address link and additional resource link
- Optional metadata (hourly rate, capacity, contact)

**Image Handling:**
- File upload with preview functionality
- Image storage via Supabase Storage
- Preview URLs generated using `URL.createObjectURL()`

### Search & Filter Architecture

**Event Discovery:**
- Date-based filtering (calendar selection)
- Category filtering (all/class/event)
- Text search across event titles and descriptions
- Dynamic category badge display based on available events for selected date
- Search suggestions generated from existing event titles

**Sorting Options:**
- Random (default for variety)
- By time (chronological)
- By title (alphabetical)
- By newest (creation date)

### Calendar Implementation

**Features:**
- Month/year navigation with dropdown selectors
- Visual indicators for events on specific dates (colored dots for categories)
- Date selection triggering filtered event list view
- Responsive grid layout adapting to screen size
- Height measurement using ResizeObserver for layout calculations
- Touch swipe navigation on mobile (swipe left/right to change months)

## External Dependencies

### Backend Services

**Supabase (Primary Backend):**
- PostgreSQL database for event and practice room data storage
- Supabase Auth (configured but authentication flow not fully implemented in visible code)
- Supabase Storage for image uploads
- Real-time subscriptions capability (available but not actively used)
- Client initialized with environment variables: `VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`

**Firebase:**
- Package included (v12.0.0) but no visible implementation in provided code
- Likely reserved for future authentication or analytics features

### Payment Integration

**Stripe:**
- @stripe/react-stripe-js (v4.0.2) integrated
- Payment flow implementation not visible in provided files
- Suggests future paid event or premium features

### Analytics & Visualization

**Recharts (v3.2.0):**
- Chart library for data visualization
- No visible usage in current codebase
- Likely planned for admin analytics or event statistics dashboard

### External Resources

**CDN Assets:**
- Font Awesome 6.4.0 for icons
- Remix Icon 4.5.0 for additional iconography
- Google Fonts API for Pacifico font family

### Development & Build

**Vite Configuration:**
- Environment-based configuration with `BASE_PATH` and `IS_PREVIEW` variables
- Global constants defined via `define` config
- Custom preview inject script at `/preview-inject/index.ts`

**TypeScript:**
- Strict mode with comprehensive compiler options
- Separate configs for app code and Node.js tooling
- Bundler module resolution for modern import patterns

## Recent Changes (2025-10-05)

### Replit Environment Setup
- Configured Vite server for Replit (port 5000, host 0.0.0.0)
- Added HMR configuration for Replit proxy (clientPort: 443)
- Removed non-existent preview-inject script reference from index.html
- Added TypeScript global declarations for __BASE_PATH__ and __IS_PREVIEW__
- Created .gitignore file for Node.js projects

### Internationalization Setup
- Created translation files for English and Korean
- Set up basic translation structure in `src/i18n/local/en/` and `src/i18n/local/ko/`

### Supabase Configuration
- Added fallback values for Supabase environment variables to prevent initialization errors
- App runs without Supabase credentials (shows placeholder errors in console)

### Deployment Configuration
- Configured autoscale deployment for static website
- Build command: `npm run build`
- Preview command: `npx vite preview --host 0.0.0.0 --port 5000`

### Mobile UX Improvements
- **Input Field Auto-scroll**: All input fields in event registration modal now automatically scroll into view when focused on mobile, preventing keyboard overlap
- **Calendar Border**: Added subtle gray-800 1px border at bottom of calendar for visual separation
- **Touch Swipe Navigation**: Added swipe gesture support to calendar - swipe left for next month, swipe right for previous month (mobile only)
- **Calendar Animation**: Removed calendar reload animation when switching months for instant display

### Fullscreen Billboard Feature
- **FullscreenBillboard Component**: Created React Portal-based fullscreen overlay for event image slideshow
- **Smart Filtering**: Only displays events with dates on or after today (현재 날짜 이후 이벤트만 표시)
- **Auto-display**: Billboard automatically shows on first visit, rotates through all event images with configurable slide interval
- **Interactive Billboard**: 
  - Image click: Opens event detail modal for the displayed event
  - Background click: Closes billboard
- **Dismissal Logic**: localStorage tracks daily dismissal - clicking/touching billboard closes it for the day
- **Progress Indicator**: Visual dots at bottom (bottom-16 with padding to prevent cutoff) show current image position in slideshow
- **Header Control**: Image icon button in header (desktop & mobile) allows manual reopening of billboard
- **Event Communication**: Uses window custom events ('eventSelected') to communicate between billboard and event list components
- **Category Persistence**: Category filter (강습/행사) now persists when navigating between months
- **SSR-Safe**: All window object access properly guarded with typeof checks
- **Inactivity Timer**: Automatically reopens billboard after configurable period of user inactivity (10 minutes default)

### Admin Billboard Controls (2025-10-05)
- **Settings Modal**: AdminBillboardModal component provides comprehensive billboard configuration in admin mode
- **Billboard Enable/Disable**: Toggle to activate or deactivate entire billboard feature
- **Auto-slide Interval**: Slider-based control (1-30 seconds, 500ms steps)
- **Inactivity Timeout**: Slider-based control (0-60 minutes, 1 minute steps)
- **Auto-open on Load**: Toggle for automatic billboard display on first page visit
- **Transition Speed**: Slider-based control (0.1-2 seconds, 50ms steps)
- **Settings Persistence**: All configurations saved to localStorage and survive page refreshes
- **Settings Hook**: useBillboardSettings custom hook manages state and persistence
- **Interval Cleanup**: Proper timer cleanup prevents overlapping intervals when settings change
- **Mobile Support**: Admin modal fully responsive and accessible on mobile devices
- **Access Flow**: Gear icon → password entry → "광고판 설정" button → modal opens

### QR Code Sharing Feature (2025-10-05)
- **QRCodeModal Component**: React Portal-based modal for sharing the website
- **Device Detection**: Automatically detects mobile vs desktop (user agent + screen width)
- **Mobile Experience**:
  - Web URL copy button with clipboard API
  - "홈 화면에 바로가기 추가" button with installation instructions
  - Responsive layout optimized for small screens
- **Desktop Experience**:
  - QR code display using qrcode.react library (200x200px, high error correction)
  - Visual QR code for mobile scanning
  - URL copy button for convenience
- **Header Integration**: Replaced logo with QR button (purple QR icon + "즐거찾기" text)
- **Smart URL**: Uses current page URL without query parameters
- **Visual Feedback**: Copy button shows success state for 2 seconds

## Required Setup

To fully enable all features, add the following environment variables in the Secrets tab:
- `VITE_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `VITE_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous/public API key
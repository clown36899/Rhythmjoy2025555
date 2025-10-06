# 광고판 (Event Discovery Platform)

## Overview

광고판 is a Korean event discovery and management platform focused on classes (강습) and events (행사). It provides a calendar-based interface for event browsing, creation, and management, including practice room listings. The platform aims to be a modern, easy-to-use single-page application with full Korean language support and free event posting to foster community engagement. Its business vision is to become the leading platform for local event discovery in Korea, offering a streamlined experience for both organizers and participants.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The application is built with React 19.1.0 and TypeScript, using Vite 7.0.3 for fast development and bundling. React Router DOM v7 handles client-side routing. Styling is managed with Tailwind CSS 3.4, ensuring a responsive, mobile-first design without reliance on third-party UI frameworks. The architecture uses React hooks for local state management and custom window events for inter-component communication, avoiding global state libraries. Internationalization is implemented using i18next and react-i18next, with Korean as the primary language.

### Component Architecture
Key components include the `EventCalendar` for date-based discovery, `EventList` for filtered event display, and a `Hero` section. `EventRegistrationModal` allows event creation with image upload and multi-link support, while `PracticeRoomModal` handles CRUD operations for practice rooms (admin-only). Modals utilize React Portals for overlay UI. An admin mode provides content management capabilities, including password-protected event editing and deletion. The home page integrates these components, offering a comprehensive event discovery experience.

### Data Layer
Events support multi-day occurrences with `start_date` and `end_date` fields, alongside a legacy `date` field for backward compatibility. Events are categorized as 'class' (purple) or 'event' (blue). Practice rooms include details like name, address, description, images, and links. Image handling involves file upload previews and storage via Supabase.

### Search & Filter Architecture
Event discovery features date-based filtering via calendar selection, category filtering (all/class/event), and text search across titles and descriptions. Search suggestions are generated from existing event titles. Events can be sorted by random, time, title, or newest.

### Calendar Implementation
The calendar provides month/year navigation and visualizes multi-day events as horizontal bars spanning dates, with distinct styling for start, middle, end, and single-day events. It supports date range selection for filtering the event list, responsive grid layouts, and touch swipe navigation on mobile.

## External Dependencies

### Backend Services
- **Supabase**: Primary backend for PostgreSQL database (event/practice room data), Supabase Storage (image uploads), and configured (but not fully implemented) Supabase Auth.
- **Firebase**: Included (v12.0.0) but not actively used, likely for future features like authentication or analytics.

### Payment Integration
- **Stripe**: `@stripe/react-stripe-js` (v4.0.2) is integrated, suggesting future support for paid events or premium features.

### Analytics & Visualization
- **Recharts (v3.2.0)**: Included for data visualization, likely planned for admin dashboards or event statistics.

### External Resources
- **CDN Assets**: Font Awesome 6.4.0, Remix Icon 4.5.0, and Google Fonts API (Pacifico font).
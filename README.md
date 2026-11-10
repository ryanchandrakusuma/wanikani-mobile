# WaniKani Mobile

A personal WaniKani app for Android and iPad, built with Expo (React Native) and TypeScript.
Lessons and reviews sync to your real WaniKani account, and the app is designed to work offline.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go (same Wi-Fi as the PC)
npx expo start --tunnel # if the phone can't connect
```

On first launch, paste a WaniKani API token
(WaniKani → Settings → API Tokens). Give it permission to start assignments,
create reviews, and create/update study materials.

## Checks

```bash
npm test           # unit tests (Jest + React Native Testing Library)
npm run typecheck  # TypeScript
npm run lint       # ESLint
```

## Layout

```
src/app/      screens (Expo Router: every file is a route; keep tests out of here)
src/api/      WaniKani API client and types
src/auth/     token storage and auth state
src/db/       SQLite schema (versioned migrations) and queries
src/sync/     downloads WaniKani data into SQLite (incremental via updated_after)
src/theme/    colors and spacing
src/utils/    small helpers
__tests__/    unit tests, mirroring src/ (db/sync tests use a real in-memory SQLite)
```

## Plan

1. ✅ Setup and auth (token login, API client with rate-limit retry)
2. ✅ Local database (SQLite) and sync
3. Home screen: lesson/review counts, forecast, navigation
4. Lesson window
5. Review window
6. Offline outbox sync and conflict handling
7. Local notifications
8. Dashboard: item spread, review forecast, daily history
9. Backup export/import (activity log + outbox, merges phone and iPad)
10. iPad build via EAS

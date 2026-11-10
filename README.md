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
src/app/          routes only (Expo Router: every file is a route). Layouts live here;
                  each screen file is a one-line re-export of a page from src/pages/
src/app/(tabs)/   bottom tabs: Home, Dashboard, Settings
src/pages/        the screen code (HomePage, LessonsPage, SettingsPage, ...)
src/contexts/     React providers: Auth, Sync, Settings (daily lesson limit, default 15)
src/api/          WaniKani API client and types
src/auth/         token storage (secure store)
src/components/   shared UI (Panel, Row, SubjectGlyph, Mnemonic, AudioButton, ComingSoon)
src/db/           SQLite schema (versioned migrations), queries, lessons, settings
src/lessons/      lesson tabs per item type, batches of 5, lesson view
src/outbox/       sends finished lessons to WaniKani (queued offline)
src/quiz/         answer checking (typos, synonyms, kana) and quiz queue
src/subjects/     typed subject model and mnemonic markup
src/sync/         downloads WaniKani data into SQLite (incremental via updated_after)
src/todo/         lesson/review to-do list hook
src/theme/        colors and spacing
src/utils/        small helpers
__tests__/    unit tests, mirroring src/ (db/sync tests use a real in-memory SQLite)
```

## Plan

1. ✅ Setup and auth (token login, API client with rate-limit retry)
2. ✅ Local database (SQLite) and sync
3. ✅ Home screen: lesson/review to-do list, 24h forecast, tabs, daily lesson limit
4. ✅ Lesson window: batches of 5, required quiz, daily limit with "Do more anyway", sent to WaniKani
5. Review window
6. Offline outbox sync and conflict handling
7. Local notifications
8. Dashboard: item spread, review forecast, daily history
9. Backup export/import (activity log + outbox, merges phone and iPad)
10. iPad build via EAS

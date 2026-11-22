# YeeBuddy

Personal workout journal built with an Expo React Native app, Express REST API, and Supabase.

## Run locally

1. Create a Supabase project and run [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) in its SQL Editor.
2. Copy `server/.env.example` to `server/.env`, then add the Supabase URL, anon key, and **server-only** service-role key.
3. Copy `mobile/.env.example` to `mobile/.env`. Set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP when using a physical device. Never put the service-role key here.
4. Install dependencies with `npm install` from this folder.
5. Start the API with `npm run server`, then the mobile client with `npm start`.

## Architecture

- `mobile/`: React Native (JavaScript) app with Supabase Auth. Business data goes only through the Express API.
- `server/`: authenticated Express REST API. It verifies Supabase access tokens before using the server-side Supabase client.
- `supabase/`: PostgreSQL schema, RLS policies, atomic nested-workout function, and 25 seeded exercises.

## API overview

All `/api/v1/*` endpoints require `Authorization: Bearer <Supabase access token>`.

- `GET/PATCH /profile`, `PATCH /settings`, `GET /dashboard`
- `GET/POST /exercises`, `GET /exercises/:id`
- `GET/POST /workouts`, `GET/PATCH/DELETE /workouts/:id`
- `GET/POST/DELETE /body-weight`
- `GET /progress/summary?range=30`

Run `npm test` after installation to validate the workout input rules.

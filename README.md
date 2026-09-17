# Campus Access

Digital campus entry/exit management for IIM Calcutta. Students present a personal QR identity at the gate. Security records ENTRY or EXIT through a validated server-side operation. Current INSIDE / OUTSIDE / UNKNOWN status is always derived from the latest valid movement of the campus day (`Asia/Kolkata`).

This repository was empty. The app is a Next.js App Router MVP with Supabase Auth, PostgreSQL, RLS, and Realtime.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- Supabase: Postgres, Auth, RLS, Realtime, RPCs
- Deployable to Vercel

## Folder structure

```text
src/
  app/                 login, student, security, admin, export API
  components/          layout, student, security, admin, ui
  lib/                 supabase, auth, admin, csv, utils
  services/            campus board/summary
  types/               database and movement types
  config/              campus + navigation
supabase/migrations/   schema, indexes, RLS, RPCs
scripts/seed.mjs       demo users, gates, QR codes, sample logs
```

## Setup

A dedicated Supabase project is required. This account currently has two active free projects (`CURRENTA`, `PersonalTracker`), so a new project could not be created automatically.

1. Pause or upgrade an unused project, then create a project named **CampusAccess** in `ap-south-1`.
2. Copy `.env.example` to `.env.local` and fill in the project URL, publishable/anon key, and **server-only** service role key.
3. Apply `supabase/migrations/20260917140000_initial_schema.sql` in the SQL editor, or run `npx supabase db push` after linking.
4. `npm install`
5. `npm run seed`
6. `npm run dev`

## Demo accounts

Password for all seeded accounts: `CampusAccess!2026`

| Role | Email |
| --- | --- |
| Admin | `admin@campus.local` |
| Security (Main Gate) | `security1@example.com` |
| Security (Lake Gate) | `security2@example.com` |
| Student | `0308@campus.local` (Vaibhav Bhatt, roll 0308/63, batch 63) |

Other seeded students are fictional.

## Security model

- Roles live in `profiles`, not in user-editable metadata.
- Students cannot insert movement records.
- Security records movement only through `record_campus_movement`.
- Consecutive duplicate ENTRY/ENTRY or EXIT/EXIT is rejected.
- Logs are immutable. Admin corrections insert a new override event.
- QR payloads contain `IIMC:<random token>` only.

## Routes

- `/login`
- `/student`, `/student/qr`, `/student/history`, `/student/profile`
- `/security`, `/security/scan`, `/security/students`, `/security/activity`
- `/admin`, `/admin/students`, `/admin/security`, `/admin/gates`, `/admin/logs`, `/admin/reports`, `/admin/settings`

# Virtual Hamroh V3.1

Virtual Hamroh is an Uzbek-language AI companion built with React, Vite, Express, TypeScript and Gemini.

## V3.1 changes

- Server API validation with Zod.
- Persistent data API for chat, reminders, moods and memories.
- Supabase PostgreSQL support for Render production deployments.
- In-memory fallback for local development when Supabase is not configured.
- Stable anonymous `userId` stored in the browser.
- Chat, reminder and mood synchronization.
- AI response schema validation.
- Recent long-term memories are injected into the AI context.
- Reminder and mood delete operations sync to the server.

## Local run

```bash
npm install
cp .env.example .env
npm run dev
```

## Render + Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. In Render Environment Variables add:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy with:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Never expose it in React/Vite client code.

## Important architecture note

The current anonymous `userId` is a V3.1 bridge. It is not authentication. Anyone who clears browser storage gets a new identity. The next recommended version is real authentication plus a memory management UI and a proper Action Router.

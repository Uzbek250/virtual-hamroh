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


## V3.1.1 TTS patch

This release fixes Gemini TTS playback when Gemini returns raw PCM/L16 audio.
The server converts raw PCM to a browser-compatible WAV container before sending
it to the frontend. The TTS timeout is increased to 5 seconds and the browser
falls back to Web Speech when Gemini TTS is unavailable.

After deploying, no new environment variable is required.

## V3.2 Live voice conversation

Added a direct, real-time voice conversation mode using the Gemini Live API,
separate from the existing text chat + TTS flow.

- Browser connects to `/live` (WebSocket) on the same server — not directly
  to Gemini, so the API key never reaches the client.
- The server proxies that connection to Gemini's `BidiGenerateContent`
  WebSocket, using the same `GEMINI_API_KEY` pool as the rest of the app.
- Microphone audio is captured and resampled to 16kHz PCM16 in an
  AudioWorklet (`public/worklets/mic-processor.js`), streamed to the
  server, and Gemini's 24kHz PCM16 audio replies are played back through
  another AudioWorklet (`public/worklets/player-processor.js`).
- No new environment variables are required — it reuses `GEMINI_API_KEY`
  (and `GEMINI_API_KEY_2`, `_3`, ... if configured).
- Click "Jonli suhbatni boshlash" on the main screen to start; the button
  is independent of the existing text chat mic button.

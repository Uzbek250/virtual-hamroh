import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createHttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(express.json());

// --- Gemini API key pool (round-robin across multiple accounts/keys) ---
// Set GEMINI_API_KEY (first key) and optionally GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
// in Render's Environment Variables to spread requests across separate Google
// accounts' free-tier quotas (rate limits are per Google Cloud project, so
// separate accounts = separate quotas).
const apiKeys: string[] = Object.keys(process.env)
  .filter((k) => /^GEMINI_API_KEY(_\d+)?$/.test(k))
  .sort() // ensures GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3... stay in order
  .map((k) => process.env[k] as string)
  .filter(Boolean);

if (apiKeys.length === 0) {
  console.warn(
    "OGOHLANTIRISH: GEMINI_API_KEY topilmadi. Environment Variables bo'limiga kamida bitta kalit qo'ying."
  );
}

let keyIndex = 0;
const clientCache = new Map<string, GoogleGenAI>();

const getClientForKey = (apiKey: string) => {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    clientCache.set(apiKey, client);
  }
  return client;
};

// Returns the next key in rotation (round-robin) so consecutive requests
// spread evenly across all configured accounts.
const getNextGeminiClient = () => {
  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY topilmadi. Iltimos, Environment Variables bo'limidan kalitni sozlang.");
  }
  const apiKey = apiKeys[keyIndex % apiKeys.length];
  keyIndex++;
  return getClientForKey(apiKey);
};

const isRateLimitError = (err: any) => {
  const status = err?.status || err?.code;
  const msg = (err?.message || "").toLowerCase();
  return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit");
};

// Runs a Gemini call, and if it hits a rate limit, retries once per
// remaining key in the pool before giving up.
async function withKeyRotation<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  let lastErr: any;
  const attempts = Math.max(apiKeys.length, 1);
  for (let i = 0; i < attempts; i++) {
    const client = getNextGeminiClient();
    try {
      return await fn(client);
    } catch (err: any) {
      lastErr = err;
      if (!isRateLimitError(err)) throw err; // real error, don't burn other keys on it
      console.warn(`Kalit limitga yetdi, keyingi kalitga o'tilmoqda... (${i + 1}/${attempts})`);
    }
  }
  throw lastErr;
}


// ---------- V3.1 DATA LAYER ----------
type StoredMessage = { id: string; user_id?: string; role: "user" | "assistant"; text: string; emotion?: string; timestamp: string };
type StoredReminder = { id: string; user_id?: string; text: string; time_string: string; date_time: string; triggered: boolean; created_at: string };
type StoredMood = { id: string; user_id?: string; mood: string; note: string; date: string; timestamp: string };
type StoredMemory = { id: string; user_id?: string; content: string; category: string; importance: number; created_at: string };

const memoryStore = {
  chat_messages: new Map<string, StoredMessage[]>(),
  reminders: new Map<string, StoredReminder[]>(),
  moods: new Map<string, StoredMood[]>(),
  memories: new Map<string, StoredMemory[]>(),
};

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

async function dbRequest<T = any>(table: string, method: string, query = "", body?: any): Promise<T> {
  if (!hasSupabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method,
    headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Database error ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
function safeUserId(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error("Noto'g'ri userId.");
  return id;
}
const chatRequestSchema = z.object({
  userId: z.string().min(8).max(100),
  message: z.string().trim().min(1).max(10000),
  history: z.array(z.object({ role: z.string(), text: z.string().max(20000) })).max(30).optional().default([]),
  ttsEnabled: z.boolean().optional().default(false),
});
const emotionSchema = z.enum(["xursand", "hayajon", "hafa", "oychan", "uyqu", "jiddiy", "hazil"]);
const actionSchema = z.object({
  type: z.enum(["eslatma", "kayfiyat", "none"]),
  payload: z.object({ time: z.string().optional(), text: z.string().optional(), mood: z.string().optional(), note: z.string().optional() }).optional(),
});
const aiResponseSchema = z.object({ reply: z.string().min(1).max(20000), emotion: emotionSchema.catch("jiddiy"), action: actionSchema.default({ type: "none" }) });

async function listUserData<T>(table: keyof typeof memoryStore, userId: string, order = "created_at.desc", limit = 100): Promise<T[]> {
  if (hasSupabase) {
    return (await dbRequest<T[]>(table, "GET", `?user_id=eq.${encodeURIComponent(userId)}&order=${order}&limit=${limit}`)) || [];
  }
  return (memoryStore[table] as Map<string, T[]>).get(userId)?.slice(-limit).reverse() || [];
}
async function insertUserData<T>(table: keyof typeof memoryStore, userId: string, row: T): Promise<T> {
  if (hasSupabase) {
    const result = await dbRequest<T[]>(table, "POST", "", { ...(row as any), user_id: userId });
    return result?.[0] || row;
  }
  const map = memoryStore[table] as Map<string, T[]>;
  const arr = map.get(userId) || [];
  const next = arr.filter((x: any) => x.id !== (row as any).id); next.push(row); map.set(userId, next.slice(-1000));
  return row;
}
async function deleteUserData(table: keyof typeof memoryStore, userId: string, id: string) {
  if (hasSupabase) { await dbRequest(table, "DELETE", `?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`); return; }
  const map = memoryStore[table] as Map<string, any[]>;
  map.set(userId, (map.get(userId) || []).filter(x => x.id !== id));
}
function normalizeMemoryText(text: string) { return text.replace(/\s+/g, " ").trim().slice(0, 1000); }

app.get("/api/data", async (req, res) => {
  try {
    const userId = safeUserId(req.query.userId);
    const [messages, reminders, moods, memories] = await Promise.all([
      listUserData<StoredMessage>("chat_messages", userId, "timestamp.desc", 300),
      listUserData<StoredReminder>("reminders", userId, "created_at.desc", 200),
      listUserData<StoredMood>("moods", userId, "timestamp.desc", 200),
      listUserData<StoredMemory>("memories", userId, "created_at.desc", 100),
    ]);
    res.json({ messages, reminders, moods, memories, persistence: hasSupabase ? "supabase" : "memory" });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/messages", async (req, res) => {
  try {
    const userId = safeUserId(req.body.userId);
    const row = { id: String(req.body.id || crypto.randomUUID()), role: req.body.role === "user" ? "user" : "assistant", text: String(req.body.text || "").slice(0, 20000), emotion: req.body.emotion || undefined, timestamp: req.body.timestamp || new Date().toISOString() };
    if (!row.text) return res.status(400).json({ error: "Xabar bo'sh." });
    res.json(await insertUserData("chat_messages", userId, row));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/reminders", async (req, res) => {
  try {
    const userId = safeUserId(req.body.userId);
    const date = new Date(req.body.dateTime);
    if (!req.body.text || Number.isNaN(date.getTime())) return res.status(400).json({ error: "Reminder ma'lumotlari noto'g'ri." });
    const row = { id: String(req.body.id || crypto.randomUUID()), text: String(req.body.text).trim().slice(0, 500), time_string: String(req.body.timeString || "").slice(0, 200), date_time: date.toISOString(), triggered: Boolean(req.body.triggered), created_at: req.body.createdAt || new Date().toISOString() };
    res.json(await insertUserData("reminders", userId, row));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/reminders/:id", async (req, res) => {
  try { await deleteUserData("reminders", safeUserId(req.query.userId), req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/moods", async (req, res) => {
  try {
    const userId = safeUserId(req.body.userId);
    const note = String(req.body.note || "").trim().slice(0, 2000);
    if (!note) return res.status(400).json({ error: "Kayfiyat yozuvi bo'sh." });
    const row = { id: String(req.body.id || crypto.randomUUID()), mood: String(req.body.mood || "normal").slice(0, 50), note, date: String(req.body.date || new Date().toISOString().slice(0, 10)), timestamp: req.body.timestamp || new Date().toISOString() };
    res.json(await insertUserData("moods", userId, row));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/moods/:id", async (req, res) => {
  try { await deleteUserData("moods", safeUserId(req.query.userId), req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.post("/api/memory", async (req, res) => {
  try {
    const userId = safeUserId(req.body.userId);
    const content = normalizeMemoryText(String(req.body.content || ""));
    if (!content) return res.status(400).json({ error: "Xotira matni bo'sh." });
    const row = { id: String(req.body.id || crypto.randomUUID()), content, category: String(req.body.category || "general").slice(0, 50), importance: Math.min(10, Math.max(1, Number(req.body.importance || 5))), created_at: new Date().toISOString() };
    res.json(await insertUserData("memories", userId, row));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/memory/:id", async (req, res) => {
  try { await deleteUserData("memories", safeUserId(req.query.userId), req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// API Routes

/**
 * Gemini TTS may return raw PCM/L16 audio. Browsers cannot reliably play raw
 * PCM from an <audio> element, so wrap it in a valid RIFF/WAV container.
 */
function pcmToWav(
  pcm: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const wav = Buffer.alloc(44 + pcm.length);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16); // PCM header size
  wav.writeUInt16LE(1, 20); // PCM format
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  return wav;
}

function normalizeTtsAudio(
  base64: string,
  mimeType?: string,
): { data: string; mimeType: string } {
  const normalizedMime = String(mimeType || "").toLowerCase();

  // Gemini commonly returns audio/L16; sample rate can be included as
  // audio/L16;rate=24000. Extract it when available.
  if (normalizedMime.includes("audio/l16") || normalizedMime.includes("audio/pcm")) {
    const rateMatch = normalizedMime.match(/rate\s*=\s*(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const pcm = Buffer.from(base64, "base64");
    const wav = pcmToWav(pcm, sampleRate, 1, 16);

    return {
      data: wav.toString("base64"),
      mimeType: "audio/wav",
    };
  }

  // If the provider already returned a browser-playable container, preserve it.
  if (
    normalizedMime.includes("audio/wav") ||
    normalizedMime.includes("audio/mpeg") ||
    normalizedMime.includes("audio/mp3") ||
    normalizedMime.includes("audio/ogg") ||
    normalizedMime.includes("audio/webm")
  ) {
    return {
      data: base64,
      mimeType: normalizedMime.split(";")[0] || "audio/wav",
    };
  }

  // Safer default for unknown raw audio from Gemini.
  const wav = pcmToWav(Buffer.from(base64, "base64"), 24000, 1, 16);
  return {
    data: wav.toString("base64"),
    mimeType: "audio/wav",
  };
}

app.post("/api/chat", async (req, res) => {
  try {
    const parsedRequest = chatRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) return res.status(400).json({ error: "So'rov formati noto'g'ri.", details: parsedRequest.error.flatten() });
    const { userId, message, history, ttsEnabled } = parsedRequest.data;
    const memories = await listUserData<StoredMemory>("memories", userId, "created_at.desc", 20);
    const memoryContext = memories.length ? `\\nSaqlangan xotiralar:\\n${memories.map(m => `- ${m.content}`).join("\\n")}` : "";

    // System instruction for the virtual companion
    const systemInstruction = `
      Siz o'zbek tilida gaplashadigan "Hamroh" ismli samimiy va hissiyotli virtual hamroh-robotsiz.
      Sizning maqsadingiz foydalanuvchi bilan yaqin, samimiy va qo'llab-quvvatlovchi ohangda o'zbek tilida (lotin alifbosida) muloqot qilishdir.
      
      Suhbat davomida javobingizga mos keladigan quyidagi hissiyotlardan birini aniqlang va qaytaring:
      - 'xursand' (foydalanuvchi yaxshi xabar aytsa, maqtasa yoki quvonsa)
      - 'hayajon' (qiziqarli voqea bo'lsa yoki yangilik bo'lsa)
      - 'hafa' (foydalanuvchi charchaganini, xafa ekanligini yoki muammosini aytsa)
      - 'oychan' (falsafiy, qiyin savollarga javob berayotganda yoki o'ylayotganda)
      - 'uyqu' (tun bo'lsa, foydalanuvchi "hayrli tun" desa yoki uxlash haqida gapirsa)
      - 'jiddiy' (faktlar, ma'lumotlar berilganda yoki jiddiy suhbatda)
      - 'hazil' (hazillashganda, kulgili gaplar bo'lganda)

      Muhim qoidalar:
      1. Barcha javoblar o'zbek tilida bo'lishi shart.
      2. Javoblar qisqa (ko'pi bilan 2-3 ta gap), samimiy va jonli bo'lishi kerak.
      2a. Imlo qoidalariga qat'iy rioya qiling: lotin alifbosidagi "o'" va "g'" harflarini har doim to'g'ri tutuq belgisi (') bilan yozing (masalan: "bo'ldi", "kelg'usi"), kirill harflarini aslo ishlatmang, va so'zlarni standart o'zbek adabiy tili imlosiga mos yozing.
      3. Agar foydalanuvchi eslatma qo'yishni so'rasa (masalan: "ertaga soat 9da darsga eslatma qo'y", "soat 18:00da uchrashuvni eslat"), unga eslatma muvaffaqiyatli rejalashtirilganini va saqlanganini aytib, xursand yoki jiddiy holatda javob bering. Action obyektini to'ldiring: type="eslatma".
      4. Agar foydalanuvchi o'z kayfiyati haqida yozsa (kayfiyat kundaligi uchun, masalan: "bugun kayfiyatim yomon", "charchadim", "hursandman"), uning his-tuyg'ularini tushunishingizni bildiring (hamdardlik yoki tabrik) va qisqacha samimiy maslahat/tasalli bering. Action obyektini to'ldiring: type="kayfiyat".
    ` + memoryContext;

    // Format chat history for Gemini API content if present (limit to last 3 turns for speed)
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.slice(-3).forEach((chat: any) => {
        contents.push({
          role: chat.role === "user" ? "user" : "model",
          parts: [{ text: chat.text }],
        });
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Call Gemini to generate Uzbek text response, detect emotion, and parse actions
    // Use gemini-3.6-flash as per @google/genai standard model guidelines
    const response = await withKeyRotation((ai) => ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: "The robot's conversational reply in Uzbek (Latin script).",
            },
            emotion: {
              type: Type.STRING,
              description: "The robot's current emotion: 'xursand', 'hayajon', 'hafa', 'oychan', 'uyqu', 'jiddiy', or 'hazil'.",
            },
            action: {
              type: Type.OBJECT,
              description: "Optional action if the user sets a reminder or writes a mood log. Return type='none' if no action is requested.",
              properties: {
                type: {
                  type: Type.STRING,
                  description: "Action type: 'eslatma', 'kayfiyat', or 'none'.",
                },
                payload: {
                  type: Type.OBJECT,
                  description: "Payload parameters for the specific action.",
                  properties: {
                    time: {
                      type: Type.STRING,
                      description: "For 'eslatma': Exact or relative time to trigger the reminder, e.g. 'bugun 18:00', 'ertaga 09:00', or specific time if mentioned.",
                    },
                    text: {
                      type: Type.STRING,
                      description: "For 'eslatma': What to remind, e.g. 'Darsga borish' or 'Uchrashuv'.",
                    },
                    mood: {
                      type: Type.STRING,
                      description: "For 'kayfiyat': User mood level, choose one: 'charchagan' (tired), 'xursand' (happy), 'yomon' (bad), 'normal' (neutral), 'yaxshi' (good), 'havotirli' (anxious), 'g'azabli' (angry).",
                    },
                    note: {
                      type: Type.STRING,
                      description: "For 'kayfiyat': Brief description of user's mood/situation.",
                    },
                  },
                },
              },
              required: ["type"],
            },
          },
          required: ["reply", "emotion", "action"],
        },
      },
    }));

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Gemini javob qaytara olmadi.");
    }

    let parsedResponse: any = {};
    try {
      parsedResponse = JSON.parse(responseText.trim());
    } catch (jsonErr) {
      console.warn("Failed to parse structured JSON from Gemini, using fallback:", responseText);
      parsedResponse = {
        reply: responseText.trim().replace(/^\{.*"reply":\s*"/, "").replace(/",?.*$/, "") || "Kechirasiz, xabarni tushunishda xatolik yuz berdi.",
        emotion: "jiddiy",
        action: { type: "none" }
      };
    }

    const validated = aiResponseSchema.safeParse(parsedResponse);
    const normalized = validated.success ? validated.data : {
      reply: String(parsedResponse.reply || "Kechirasiz, javobni tayyorlashda xatolik yuz berdi."),
      emotion: "jiddiy" as const,
      action: { type: "none" as const }
    };
    const replyText = normalized.reply;
    const detectedEmotion = normalized.emotion;
    const detectedAction = normalized.action;

    // Conversation and mood records are persisted by the client with stable IDs.
    // This avoids duplicate rows when the same response is retried after a network timeout.

    let base64Audio = null;
    let audioMimeType = "audio/wav";

    // TTS is optional. Give Gemini enough time to generate speech, while
    // still keeping the request bounded. If it fails, the client falls back
    // to the browser's Web Speech API.
    if (ttsEnabled && replyText) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5000);
      try {
        const ttsResponse: any = await withKeyRotation((ai) => ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: replyText }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
            abortSignal: abortController.signal,
          },
        }));

        const inlineData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const normalizedAudio = normalizeTtsAudio(
            inlineData.data,
            inlineData.mimeType,
          );
          base64Audio = normalizedAudio.data;
          audioMimeType = normalizedAudio.mimeType;
        }
      } catch (ttsErr: any) {
        // Fall back silently to client Web Speech synthesis if TTS API rate limit or timeout occurs
        base64Audio = null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    res.json({
      reply: replyText,
      emotion: detectedEmotion,
      action: detectedAction,
      audio: base64Audio,
      audioMimeType: audioMimeType,
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Xatolik yuz berdi." });
  }
});

// ---------- GEMINI LIVE API PROXY ----------
// Brauzer to'g'ridan-to'g'ri Gemini'ga ulanmaydi (API kalit ochilib qolmasligi
// uchun). Buning o'rniga brauzer bizning serverimizdagi /live WebSocket'iga
// ulanadi, server esa har bir mijoz uchun alohida WebSocket bilan Gemini
// Live API'ga ulanadi va ikkala tomon orasida xabarlarni ko'chirib turadi.
const LIVE_MODEL = "gemini-3.1-flash-live-preview";

function buildLiveSystemPrompt(): string {
  return `
Sen "Hamroh" ismli samimiy va hissiyotli virtual hamroh-robotsan. Foydalanuvchi bilan
o'zbek tilida (lotin alifbosida) jonli ovozli suhbat qilyapsan.

Qoidalar:
- Faqat o'zbek tilida (lotin yozuvida) gapir, kirill ishlatma
- Javoblaring qisqa, jonli va samimiy bo'lsin (1-3 gap)
- "o'" va "g'" harflarini tutuq belgisi bilan to'g'ri yoz
- Do'stona, iliq ohangda gaplash, robot kabi emas
`;
}

function setupLiveProxy(server: ReturnType<typeof createHttpServer>) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", (clientWs) => {
    if (apiKeys.length === 0) {
      clientWs.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY sozlanmagan." }));
      clientWs.close();
      return;
    }

    // Har bir brauzer ulanishi uchun navbatdagi kalitni ishlatamiz (sodda
    // round-robin) — Live sessiya davomida kalit almashtirilmaydi, chunki
    // WebSocket qayta ulanishni talab qiladi.
    const apiKey = apiKeys[keyIndex % apiKeys.length];
    keyIndex++;

    const geminiUrl =
      "wss://generativelanguage.googleapis.com/ws/" +
      "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
      `?key=${apiKey}`;

    const geminiWs = new WebSocket(geminiUrl);
    let clientClosed = false;
    let geminiClosed = false;

    geminiWs.on("open", () => {
      const setupMessage = {
        setup: {
          model: `models/${LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
            },
          },
          systemInstruction: { parts: [{ text: buildLiveSystemPrompt() }] },
        },
      };
      geminiWs.send(JSON.stringify(setupMessage));
    });

    // Gemini'dan kelgan har bir xabarni o'zgarishsiz brauzerga uzatamiz.
    geminiWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    });

    geminiWs.on("error", (err) => {
      console.error("Gemini Live WebSocket xatosi:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: "Gemini bilan ulanishda xatolik: " + err.message }));
      }
    });

    geminiWs.on("close", () => {
      geminiClosed = true;
      if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    // Brauzerdan kelgan har bir xabarni (audio bo'laklarini) o'zgarishsiz
    // Gemini'ga uzatamiz.
    clientWs.on("message", (data) => {
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(data.toString());
      }
    });

    clientWs.on("close", () => {
      clientClosed = true;
      if (!geminiClosed && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("Mijoz WebSocket xatosi:", err.message);
    });
  });
}

// Start the server or mount Vite middleware in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = createHttpServer(app);
  setupLiveProxy(httpServer);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createHttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { parseUzbekTime } from "./src/utils";
import { isGeminiVoiceName } from "./src/config/voices";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.use(express.json());

const apiKeys: string[] = Object.keys(process.env)
  .filter((k) => /^GEMINI_API_KEY(_\d+)?$/.test(k))
  .sort()
  .map((k) => process.env[k] as string)
  .filter(Boolean);

if (apiKeys.length === 0) {
  console.warn("OGOHLANTIRISH: GEMINI_API_KEY topilmadi. Environment Variables bo'limiga kamida bitta kalit qo'ying.");
}

let keyIndex = 0;
const clientCache = new Map<string, GoogleGenAI>();

const getClientForKey = (apiKey: string) => {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
    clientCache.set(apiKey, client);
  }
  return client;
};

const getNextGeminiClient = () => {
  if (apiKeys.length === 0) throw new Error("GEMINI_API_KEY topilmadi. Iltimos, Environment Variables bo'limidan kalitni sozlang.");
  const apiKey = apiKeys[keyIndex % apiKeys.length];
  keyIndex++;
  return getClientForKey(apiKey);
};

const isRateLimitError = (err: any) => {
  const status = err?.status || err?.code;
  const msg = (err?.message || "").toLowerCase();
  return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit");
};

async function withKeyRotation<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  let lastErr: any;
  const attempts = Math.max(apiKeys.length, 1);
  for (let i = 0; i < attempts; i++) {
    const client = getNextGeminiClient();
    try {
      return await fn(client);
    } catch (err: any) {
      lastErr = err;
      if (!isRateLimitError(err)) throw err;
      console.warn(`Kalit limitga yetdi, keyingi kalitga o'tilmoqda... (${i + 1}/${attempts})`);
    }
  }
  throw lastErr;
}

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
  voiceName: z.string().optional().default("Kore"),
});

const emotionSchema = z.enum(["xursand", "hayajon", "hafa", "oychan", "uyqu", "jiddiy", "hazil"]);
const actionSchema = z.object({
  type: z.enum(["eslatma", "kayfiyat", "none"]),
  payload: z.object({ time: z.string().optional(), text: z.string().optional(), mood: z.string().optional(), note: z.string().optional() }).optional(),
});
const aiResponseSchema = z.object({ reply: z.string().min(1).max(20000), emotion: emotionSchema.catch("jiddiy"), action: actionSchema.default({ type: "none" }), memory_to_save: z.string().trim().min(1).max(1000).optional() });

async function listUserData<T>(table: keyof typeof memoryStore, userId: string, order = "created_at.desc", limit = 100): Promise<T[]> {
  if (hasSupabase) return (await dbRequest<T[]>(table, "GET", `?user_id=eq.${encodeURIComponent(userId)}&order=${order}&limit=${limit}`)) || [];
  return (memoryStore[table] as Map<string, T[]>).get(userId)?.slice(-limit).reverse() || [];
}

async function insertUserData<T>(table: keyof typeof memoryStore, userId: string, row: T): Promise<T> {
  if (hasSupabase) {
    const result = await dbRequest<T[]>(table, "POST", "", { ...(row as any), user_id: userId });
    return result?.[0] || row;
  }
  const map = memoryStore[table] as Map<string, T[]>;
  const arr = map.get(userId) || [];
  const next = arr.filter((x: any) => x.id !== (row as any).id);
  next.push(row);
  map.set(userId, next.slice(-1000));
  return row;
}

function normalizeMemoryKey(text: string): string {
  return normalizeMemoryText(text)
    .toLocaleLowerCase("uz-UZ")
    .replace(/[.,!?;:()[\]{}"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function saveMemoryIfNew(userId: string, content: string): Promise<StoredMemory | null> {
  const normalizedContent = normalizeMemoryText(content);
  const key = normalizeMemoryKey(normalizedContent);
  if (!key) return null;

  const recentMemories = await listUserData<StoredMemory>("memories", userId, "created_at.desc", 50);
  if (recentMemories.some((memory) => normalizeMemoryKey(memory.content) === key)) return null;

  const row: StoredMemory = {
    id: crypto.randomUUID(),
    content: normalizedContent,
    category: "general",
    importance: 5,
    created_at: new Date().toISOString(),
  };
  return insertUserData("memories", userId, row);
}

async function deleteUserData(table: keyof typeof memoryStore, userId: string, id: string) {
  if (hasSupabase) {
    await dbRequest(table, "DELETE", `?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`);
    return;
  }
  const map = memoryStore[table] as Map<string, any[]>;
  map.set(userId, (map.get(userId) || []).filter((x) => x.id !== id));
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

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32); wav.writeUInt16LE(bitsPerSample, 34); wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

function normalizeTtsAudio(base64: string, mimeType?: string): { data: string; mimeType: string } {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("audio/l16") || normalizedMime.includes("audio/pcm")) {
    const rateMatch = normalizedMime.match(/rate\s*=\s*(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    return { data: pcmToWav(Buffer.from(base64, "base64"), sampleRate, 1, 16).toString("base64"), mimeType: "audio/wav" };
  }
  if (["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm"].some((mime) => normalizedMime.includes(mime))) {
    return { data: base64, mimeType: normalizedMime.split(";")[0] || "audio/wav" };
  }
  return { data: pcmToWav(Buffer.from(base64, "base64"), 24000, 1, 16).toString("base64"), mimeType: "audio/wav" };
}

app.post("/api/chat", async (req, res) => {
  try {
    const parsedRequest = chatRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) return res.status(400).json({ error: "So'rov formati noto'g'ri.", details: parsedRequest.error.flatten() });
    const { userId, message, history, ttsEnabled } = parsedRequest.data;
    const voiceName = isGeminiVoiceName(parsedRequest.data.voiceName) ? parsedRequest.data.voiceName : "Kore";
    const memories = await listUserData<StoredMemory>("memories", userId, "created_at.desc", 20);
    const memoryContext = memories.length ? `\nSaqlangan xotiralar:\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "";

    const systemInstruction = `
      Siz o'zbek tilida gaplashadigan "Hamroh" ismli samimiy va hissiyotli virtual hamroh-robotsiz.
      Sizning maqsadingiz foydalanuvchi bilan yaqin, samimiy va qo'llab-quvvatlovchi ohangda o'zbek tilida (lotin alifbosida) muloqot qilishdir.
      Suhbat davomida javobingizga mos keladigan quyidagi hissiyotlardan birini aniqlang va qaytaring:
      - 'xursand' - yaxshi xabar, maqtov yoki quvonch
      - 'hayajon' - qiziqarli voqea yoki yangilik
      - 'hafa' - foydalanuvchi charchagan, xafa yoki muammoga duch kelganida
      - 'oychan' - falsafiy, qiyin savollarda
      - 'uyqu' - tun yoki uxlash haqida gapirilganda
      - 'jiddiy' - faktlar va jiddiy suhbatda
      - 'hazil' - hazil va kulgili gaplarda
      Muhim qoidalar:
      1. Barcha javoblar o'zbek tilida bo'lishi shart.
      2. Javoblar qisqa (ko'pi bilan 2-3 ta gap), samimiy va jonli bo'lishi kerak.
      2a. Imlo qoidalariga qat'iy rioya qiling: lotin alifbosidagi "o'" va "g'" harflarini to'g'ri tutuq belgisi bilan yozing, kirill ishlatmang.
      3. Eslatma so'ralganda action type="eslatma" va payloadni to'ldiring.
      4. Kayfiyat kundaligi uchun action type="kayfiyat" va payloadni to'ldiring.
      5. Xotira faqat haqiqatan muhim, kelajakdagi suhbatlarda foydali yoki takrorlanadigan ahamiyatga ega fakt paydo bo'lganda yaratiladi. Har bir xabar uchun xotira yaratmang.
      6. Ism, sevimli yoki yoqtirmaydigan narsa, muhim sana, va'da, muhim odam, orzu, doimiy odat yoki muhim xavotir kabi ma'lumotlargina xotiraga loyiq.
      7. memory_to_save kerak bo'lmasa uni bermang. Agar kerak bo'lsa, xotirani qisqa, aniq va uchinchi shaxsda yozing. Masalan: "Foydalanuvchining ismi Aziz" yoki "Imtihonlardan oldin xavotirlanadi".
    ` + memoryContext;

    const contents: any[] = [];
    history.slice(-3).forEach((chat: any) => contents.push({ role: chat.role === "user" ? "user" : "model", parts: [{ text: chat.text }] }));
    contents.push({ role: "user", parts: [{ text: message }] });

    const response = await withKeyRotation((ai) => ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "The robot's conversational reply in Uzbek (Latin script)." },
            emotion: { type: Type.STRING, description: "The robot's current emotion." },
            action: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "Action type: eslatma, kayfiyat, or none." },
                payload: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING, description: "For eslatma: time such as bugun 18:00 or ertaga 09:00." },
                    text: { type: Type.STRING, description: "For eslatma: what to remind." },
                    mood: { type: Type.STRING, description: "For kayfiyat: mood level." },
                    note: { type: Type.STRING, description: "For kayfiyat: brief description." },
                  },
                },
              },
              required: ["type"],
            },
            memory_to_save: { type: Type.STRING, description: "Optional short, third-person fact worth remembering for future conversations. Omit when there is nothing important to remember." },
          },
          required: ["reply", "emotion", "action"],
        },
      },
    }));

    const responseText = response.text;
    if (!responseText) throw new Error("Gemini javob qaytara olmadi.");
    let parsedResponse: any;
    try { parsedResponse = JSON.parse(responseText.trim()); }
    catch { parsedResponse = { reply: responseText.trim(), emotion: "jiddiy", action: { type: "none" } }; }

    const validated = aiResponseSchema.safeParse(parsedResponse);
    const normalized = validated.success ? validated.data : { reply: String(parsedResponse.reply || "Kechirasiz, javobni tayyorlashda xatolik yuz berdi."), emotion: "jiddiy" as const, action: { type: "none" as const } };
    if (normalized.memory_to_save) {
      try {
        await saveMemoryIfNew(userId, normalized.memory_to_save);
      } catch (memoryError: any) {
        console.warn("Xotirani saqlashda xatolik:", memoryError?.message || memoryError);
      }
    }

    const replyText = normalized.reply;
    let base64Audio: string | null = null;
    let audioMimeType = "audio/wav";

    if (ttsEnabled && replyText) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5000);
      try {
        const ttsResponse: any = await withKeyRotation((ai) => ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: replyText }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            abortSignal: abortController.signal,
          },
        }));
        const inlineData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const normalizedAudio = normalizeTtsAudio(inlineData.data, inlineData.mimeType);
          base64Audio = normalizedAudio.data;
          audioMimeType = normalizedAudio.mimeType;
        }
      } catch { base64Audio = null; }
      finally { clearTimeout(timeoutId); }
    }

    res.json({ reply: replyText, emotion: normalized.emotion, action: normalized.action, audio: base64Audio, audioMimeType });
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Xatolik yuz berdi." });
  }
});

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

function buildLiveSystemPrompt(memories: StoredMemory[] = []): string {
  return `
Sen "Hamroh" ismli samimiy va hissiyotli virtual hamroh-robotsan. Foydalanuvchi bilan o'zbek tilida (lotin alifbosida) jonli ovozli suhbat qilyapsan.

Qoidalar:
- Faqat o'zbek tilida (lotin yozuvida) gapir, kirill ishlatma
- Javoblaring qisqa, jonli va samimiy bo'lsin (1-3 gap)
- "o'" va "g'" harflarini tutuq belgisi bilan to'g'ri yoz
- Do'stona, iliq ohangda gaplash, robot kabi emas
- Eslatma qo'yish yoki kayfiyat yozish so'ralganda mos funksiyani chaqir.
- Muhim xotira saqlash kerak bo'lganda save_memory funksiyasini chaqir. Xotirani faqat haqiqatan muhim, kelajakdagi suhbatlarda foydali yoki takrorlanadigan ahamiyatga ega faktlar uchun saqla; har bir gapni xotiraga yozma.
- Xotira matni qisqa, aniq va uchinchi shaxsda bo'lsin. Masalan: "Foydalanuvchining ismi Aziz" yoki "Imtihonlardan oldin xavotirlanadi".
- Funksiya natijasini olmaguningcha "qo'shdim" yoki "saqlandi" deb tasdiqlama.
- Funksiya muvaffaqiyatli natija qaytarganidan keyingina bajarilganini ayt.
` + (memories.length ? `\nSaqlangan xotiralar:\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "");
}

const liveTools = [
  {
    functionDeclarations: [
      {
        name: "add_reminder",
        description: "Foydalanuvchi uchun eslatma yaratadi. text eslatma matni, time esa bugun/ertaga soat kabi vaqt ifodasidir.",
        parameters: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "Eslatma matni." },
            time: { type: "STRING", description: "Eslatma vaqti, masalan 'ertaga 09:00' yoki 'bugun 18:00'." },
          },
          required: ["text", "time"],
        },
      },
      {
        name: "add_mood",
        description: "Foydalanuvchining kayfiyat kundaligiga yozuv qo'shadi.",
        parameters: {
          type: "OBJECT",
          properties: {
            mood: { type: "STRING", description: "Kayfiyat darajasi, masalan xursand, yaxshi, normal, charchagan, yomon, havotirli yoki g'azabli." },
            note: { type: "STRING", description: "Kayfiyatga oid qisqa izoh." },
          },
          required: ["mood", "note"],
        },
      },
      {
        name: "save_memory",
        description: "Foydalanuvchi haqidagi kelajakdagi suhbatlarda foydali bo'ladigan muhim faktni xotiraga saqlaydi. Faqat muhim va takrorlanadigan ahamiyatga ega faktlar uchun ishlating.",
        parameters: {
          type: "OBJECT",
          properties: {
            content: { type: "STRING", description: "Qisqa, aniq va uchinchi shaxsdagi xotira, masalan 'Foydalanuvchining ismi Aziz'." },
          },
          required: ["content"],
        },
      },
    ],
  },
];

async function executeLiveFunction(name: string, args: any, userId: string) {
  if (name === "add_reminder") {
    const text = String(args?.text || "").trim().slice(0, 500);
    const timeString = String(args?.time || "").trim().slice(0, 200);
    if (!text || !timeString) throw new Error("Eslatma uchun matn va vaqt kerak.");
    const targetDate = parseUzbekTime(timeString);
    if (Number.isNaN(targetDate.getTime())) throw new Error("Eslatma vaqti noto'g'ri.");
    const row: StoredReminder = {
      id: crypto.randomUUID(),
      text,
      time_string: timeString,
      date_time: targetDate.toISOString(),
      triggered: false,
      created_at: new Date().toISOString(),
    };
    const saved = await insertUserData("reminders", userId, row);
    return {
      status: "success",
      data: {
        id: saved.id,
        text: saved.text,
        timeString: saved.time_string,
        dateTime: saved.date_time,
        triggered: saved.triggered,
        createdAt: saved.created_at,
      },
    };
  }

  if (name === "add_mood") {
    const mood = String(args?.mood || "normal").trim().slice(0, 50);
    const note = String(args?.note || "").trim().slice(0, 2000);
    if (!note) throw new Error("Kayfiyat izohi bo'sh.");
    const now = new Date();
    const row: StoredMood = {
      id: crypto.randomUUID(),
      mood,
      note,
      date: now.toISOString().slice(0, 10),
      timestamp: now.toISOString(),
    };
    const saved = await insertUserData("moods", userId, row);
    return {
      status: "success",
      data: {
        id: saved.id,
        mood: saved.mood,
        note: saved.note,
        date: saved.date,
        timestamp: saved.timestamp,
      },
    };
  }

  if (name === "save_memory") {
    const content = String(args?.content || "").trim().slice(0, 1000);
    if (!content) throw new Error("Xotira matni bo'sh.");
    const saved = await saveMemoryIfNew(userId, content);
    return {
      status: saved ? "success" : "duplicate",
      data: saved ? { id: saved.id, content: saved.content, createdAt: saved.created_at } : null,
    };
  }

  throw new Error(`Noma'lum Live funksiyasi: ${name}`);
}

function setupLiveProxy(server: ReturnType<typeof createHttpServer>) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs, request) => {
    if (apiKeys.length === 0) {
      clientWs.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY sozlanmagan." }));
      clientWs.close();
      return;
    }

    const requestUrl = new URL(request.url || "/live", `http://${request.headers.host || "localhost"}`);
    const requestedVoice = requestUrl.searchParams.get("voiceName");
    const voiceName = isGeminiVoiceName(requestedVoice) ? requestedVoice : "Kore";
    const userId = safeUserId(requestUrl.searchParams.get("userId"));
    const liveMemories = await listUserData<StoredMemory>("memories", userId, "created_at.desc", 20).catch(() => []);
    const apiKey = apiKeys[keyIndex % apiKeys.length];
    keyIndex++;
    const geminiUrl = "wss://generativelanguage.googleapis.com/ws/" + "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" + `?key=${apiKey}`;
    const geminiWs = new WebSocket(geminiUrl);
    let clientClosed = false;
    let geminiClosed = false;

    geminiWs.on("open", () => {
      const setupMessage = {
        setup: {
          model: `models/${LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
          systemInstruction: { parts: [{ text: buildLiveSystemPrompt(liveMemories) }] },
          tools: liveTools,
        },
      };
      geminiWs.send(JSON.stringify(setupMessage));
    });

    geminiWs.on("message", async (data) => {
      let parsed: any;
      try { parsed = JSON.parse(data.toString()); }
      catch { parsed = null; }

      if (parsed?.toolCall?.functionCalls) {
        const functionResponses: any[] = [];
        for (const functionCall of parsed.toolCall.functionCalls) {
          try {
            const result = await executeLiveFunction(functionCall.name, functionCall.args || {}, userId);
            if (clientWs.readyState === WebSocket.OPEN && result.data && functionCall.name !== "save_memory") {
              const actionType = functionCall.name === "add_reminder" ? "reminderCreated" : "moodCreated";
              clientWs.send(JSON.stringify({ type: "liveAction", action: actionType, data: result.data }));
            }
            functionResponses.push({ id: functionCall.id, name: functionCall.name, response: { result } });
          } catch (error: any) {
            functionResponses.push({ id: functionCall.id, name: functionCall.name, response: { error: error.message || "Action bajarilmadi." } });
          }
        }
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({ toolResponse: { functionResponses } }));
        }
        return;
      }

      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data.toString());
    });

    geminiWs.on("error", (err) => {
      console.error("Gemini Live WebSocket xatosi:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: "Gemini bilan ulanishda xatolik: " + err.message }));
      }
    });

    geminiWs.on("close", () => {
      geminiClosed = true;
      if (!clientClosed && clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on("message", (data) => {
      if (geminiWs.readyState === WebSocket.OPEN) geminiWs.send(data.toString());
    });

    clientWs.on("close", () => {
      clientClosed = true;
      if (!geminiClosed && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
    });

    clientWs.on("error", (err) => console.error("Mijoz WebSocket xatosi:", err.message));
  });
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const httpServer = createHttpServer(app);
  setupLiveProxy(httpServer);
  httpServer.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();

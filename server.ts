import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

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

// Gemini's TTS models return raw headerless PCM audio (mimeType like
// "audio/L16;codec=pcm;rate=24000"), which browsers cannot play directly.
// This wraps the raw PCM bytes in a minimal 44-byte WAV header so the
// client's <audio> element can play it.
function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Parses "audio/L16;codec=pcm;rate=24000" style mime types into a sample rate.
function parsePcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? parseInt(match[1], 10) : 24000;
}

// API Routes
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Xabar matni kiritilmagan." });
    }

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
    `;

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

    const replyText = parsedResponse.reply || "Ajoyib!";
    const detectedEmotion = parsedResponse.emotion || "jiddiy";
    const detectedAction = parsedResponse.action || { type: "none" };

    // Text/emotion/action are returned immediately — TTS audio is fetched
    // separately via /api/tts so a slow voice generation never delays the
    // chat bubble from appearing.
    res.json({
      reply: replyText,
      emotion: detectedEmotion,
      action: detectedAction,
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message || "Xatolik yuz berdi." });
  }
});

// Separate TTS endpoint, called by the client after the text reply is
// already on screen. Kept independent from /api/chat so a slow or failing
// voice generation never blocks or breaks the text conversation.
app.post("/api/tts", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Matn kiritilmagan." });
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 8000);
  try {
    const ttsResponse: any = await withKeyRotation((ai) => ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
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
    if (!inlineData?.data) {
      return res.status(502).json({ error: "TTS audio qaytmadi." });
    }

    const rawMimeType: string = inlineData.mimeType || "audio/L16;codec=pcm;rate=24000";
    // Gemini TTS returns headerless PCM — wrap it as a real WAV file so the
    // browser's <audio> element can actually play it.
    let base64Audio: string;
    let audioMimeType: string;
    if (rawMimeType.includes("L16") || rawMimeType.includes("pcm")) {
      const pcmBuffer = Buffer.from(inlineData.data, "base64");
      const sampleRate = parsePcmSampleRate(rawMimeType);
      const wavBuffer = pcmToWav(pcmBuffer, sampleRate);
      base64Audio = wavBuffer.toString("base64");
      audioMimeType = "audio/wav";
    } else {
      base64Audio = inlineData.data;
      audioMimeType = rawMimeType;
    }

    res.json({ audio: base64Audio, audioMimeType });
  } catch (ttsErr: any) {
    console.error("TTS error:", ttsErr);
    res.status(502).json({ error: ttsErr.message || "Ovoz yaratishda xatolik." });
  } finally {
    clearTimeout(timeoutId);
  }
});

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

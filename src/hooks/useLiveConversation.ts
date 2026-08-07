import { useCallback, useEffect, useRef, useState } from "react";

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

interface UseLiveConversationResult {
  status: LiveStatus;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

// Kirish 16kHz, chiqish 24kHz — bular AudioWorklet fayllarida (mic-processor.js,
// player-processor.js) qattiq belgilangan va shu yerda resample amalga oshadi.

/**
 * Mimi bilan uzluksiz ovozli suhbatni boshqaradi: mikrofonni ochadi, PCM16
 * audio bo'laklarini backend orqali (server.ts dagi /live proxy) Gemini
 * Live API'ga oqizadi, va kelayotgan javob audiosini real vaqtda pleyback
 * qiladi. Backend WebSocket'i (wss emas, ws — brauzer bilan bir xil origin)
 * API kalitni frontendga chiqarmaydi.
 *
 * Eslatma: Live API faqat audio oqimi qaytaradi, matnli chat rejimidagi
 * kabi strukturaviy (emotion/action) JSON javob yo'q — shuning uchun bu
 * hook kayfiyatni aniqlamaydi.
 */
export function useLiveConversation(): UseLiveConversationResult {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const playerContextRef = useRef<AudioContext | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;

    micContextRef.current?.close().catch(() => {});
    micContextRef.current = null;

    playerContextRef.current?.close().catch(() => {});
    playerContextRef.current = null;
    playerNodeRef.current = null;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const start = useCallback(async () => {
    if (status === "connecting" || status === "listening" || status === "speaking") {
      return;
    }
    setErrorMessage(null);
    setStatus("connecting");

    try {
      // 1) Mikrofonga ruxsat so'raymiz avvaldan — WebSocket ulanishidan
      // oldin, shunda foydalanuvchi rad etsa server bilan bekorga
      // ulanmaymiz.
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      // 2) Pleyback uchun AudioContext va worklet tayyorlaymiz. Aniq
      // sampleRate belgilamaymiz (ba'zi brauzerlarda ishonchsiz) — worklet
      // o'zi 24kHz kirishni AudioContext'ning haqiqiy chastotasiga
      // moslashtiradi.
      const playerContext = new AudioContext();
      await playerContext.audioWorklet.addModule("/worklets/player-processor.js");
      const playerNode = new AudioWorkletNode(playerContext, "player-processor");
      playerNode.connect(playerContext.destination);
      playerContextRef.current = playerContext;
      playerNodeRef.current = playerNode;

      // 3) Mikrofon uchun AudioContext va worklet tayyorlaymiz. Xuddi
      // shunday — aniq sampleRate belgilamaymiz, worklet o'zi 16kHz'ga
      // resample qiladi.
      const micContext = new AudioContext();
      await micContext.audioWorklet.addModule("/worklets/mic-processor.js");
      const micSource = micContext.createMediaStreamSource(micStream);
      const micNode = new AudioWorkletNode(micContext, "mic-processor");
      micSource.connect(micNode);
      micContextRef.current = micContext;

      // 4) WebSocket ulanishini ochamiz (bizning /live proxy'imizga).
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Mikrofon bo'laklarini WebSocket ulanganidan keyingina yubora
        // boshlaymiz.
        micNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const base64 = arrayBufferToBase64(event.data);
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
              },
            }),
          );
        };
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (e) {
          console.error("Live xabarni o'qishda xatolik:", e);
        }
      };

      ws.onerror = () => {
        setStatus("error");
        setErrorMessage("Server bilan ulanishda xatolik yuz berdi.");
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === "error" ? prev : "idle"));
      };

      function handleServerMessage(data: any) {
        if (data.type === "error") {
          setStatus("error");
          setErrorMessage(data.message || "Noma'lum xatolik.");
          return;
        }

        if (data.setupComplete) {
          setStatus("listening");
          return;
        }

        const serverContent = data.serverContent;
        if (!serverContent) return;

        if (serverContent.interrupted) {
          playerNode.port.postMessage({ type: "clear" });
          setStatus("listening");
        }

        const parts = serverContent.modelTurn?.parts as any[] | undefined;
        if (parts) {
          for (const part of parts) {
            const base64Audio = part.inlineData?.data;
            if (base64Audio) {
              setStatus("speaking");
              const pcm16 = base64ToInt16Array(base64Audio);
              const float32 = int16ToFloat32(pcm16);
              playerNode.port.postMessage({ type: "push", samples: float32 }, [float32.buffer]);
            }
          }
        }

        if (serverContent.turnComplete) {
          setStatus("listening");
        }
      }
    } catch (err: any) {
      cleanup();
      setStatus("error");
      setErrorMessage(err?.message || "Mikrofonni ochib bo'lmadi.");
    }
  }, [status, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { status, errorMessage, start, stop };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function int16ToFloat32(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 0x8000;
  }
  return float32;
}

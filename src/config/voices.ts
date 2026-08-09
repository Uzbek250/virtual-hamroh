export const GEMINI_VOICES = [
  { name: "Kore", label: "Kore — Firm" },
  { name: "Puck", label: "Puck — Upbeat" },
  { name: "Charon", label: "Charon — Informative" },
  { name: "Zephyr", label: "Zephyr — Bright" },
  { name: "Fenrir", label: "Fenrir — Excitable" },
  { name: "Leda", label: "Leda — Youthful" },
  { name: "Orus", label: "Orus — Firm" },
  { name: "Aoede", label: "Aoede — Breezy" },
  { name: "Callirrhoe", label: "Callirrhoe — Easy-going" },
  { name: "Autonoe", label: "Autonoe — Bright" },
  { name: "Enceladus", label: "Enceladus — Breathy" },
  { name: "Iapetus", label: "Iapetus — Clear" },
  { name: "Umbriel", label: "Umbriel — Easy-going" },
  { name: "Algieba", label: "Algieba — Smooth" },
  { name: "Despina", label: "Despina — Smooth" },
  { name: "Erinome", label: "Erinome — Clear" },
  { name: "Algenib", label: "Algenib — Gravelly" },
  { name: "Rasalgethi", label: "Rasalgethi — Informative" },
  { name: "Laomedeia", label: "Laomedeia — Upbeat" },
  { name: "Achernar", label: "Achernar — Soft" },
  { name: "Alnilam", label: "Alnilam — Firm" },
  { name: "Schedar", label: "Schedar — Even" },
  { name: "Gacrux", label: "Gacrux — Mature" },
  { name: "Pulcherrima", label: "Pulcherrima — Forward" },
  { name: "Achird", label: "Achird — Friendly" },
  { name: "Zubenelgenubi", label: "Zubenelgenubi — Casual" },
  { name: "Vindemiatrix", label: "Vindemiatrix — Gentle" },
  { name: "Sadachbia", label: "Sadachbia — Lively" },
  { name: "Sadaltager", label: "Sadaltager — Knowledgeable" },
  { name: "Sulafat", label: "Sulafat — Warm" },
] as const;

export type GeminiVoiceName = (typeof GEMINI_VOICES)[number]["name"];

export function isGeminiVoiceName(value: unknown): value is GeminiVoiceName {
  return GEMINI_VOICES.some((voice) => voice.name === value);
}

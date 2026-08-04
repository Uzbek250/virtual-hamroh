export type EmotionType =
  | "xursand"
  | "hayajon"
  | "hafa"
  | "oychan"
  | "uyqu"
  | "jiddiy"
  | "hazil";

export type BotState = "idle" | "listening" | "speaking" | "thinking";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  emotion?: EmotionType;
  timestamp: string;
}

export interface Reminder {
  id: string;
  text: string;
  timeString: string; // User-facing relative/parsed time (e.g., 'bugun 18:00')
  dateTime: string;   // ISO string of the exact reminder alarm time
  triggered: boolean;
  createdAt: string;
}

export interface MoodEntry {
  id: string;
  mood: "charchagan" | "xursand" | "yomon" | "normal" | "yaxshi" | "havotirli" | "g'azabli";
  note: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
}

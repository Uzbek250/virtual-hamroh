import { MoodEntry, EmotionType } from "./types";

/**
 * Intelligent Uzbek time and date parser.
 * Conveys relative Uzbek time expressions like "ertaga soat 9:00da" or "bugun 18:00"
 * into a concrete Javascript Date object.
 */
export function parseUzbekTime(timeStr: string): Date {
  const now = new Date();
  const timeLower = timeStr.toLowerCase().trim();

  // Try to match HH:MM or H:MM patterns
  const timeRegex = /(\d{1,2})[:.-](\d{2})/;
  const match = timeLower.match(timeRegex);

  let hours = 9;
  let minutes = 0;
  let timeFound = false;

  if (match) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    timeFound = true;
  }

  const target = new Date();
  target.setSeconds(0, 0);

  if (timeFound) {
    target.setHours(hours, minutes);
  } else {
    // Default: 1 hour from now if no specific hour was parsed
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 1);
    return fallback;
  }

  // Adjust date for tomorrow or future days
  if (timeLower.includes("ertaga")) {
    target.setDate(target.getDate() + 1);
  } else if (timeLower.includes("bugun")) {
    // Keeps today's date
    // If the time already passed today, assume user means tomorrow or just let it stay
    if (target < now) {
      // Just keep it as today, or could push to tomorrow. Let's keep today
    }
  } else {
    // No explicit day mentioned, if the hour is in the past, assume tomorrow
    if (target < now) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target;
}

/**
 * Maps mood string to appropriate Emoji
 */
export function getMoodEmoji(mood: string): string {
  switch (mood.toLowerCase()) {
    case "xursand":
      return "😊";
    case "yaxshi":
      return "🙂";
    case "normal":
      return "😐";
    case "charchagan":
      return "😫";
    case "yomon":
      return "😢";
    case "havotirli":
      return "😰";
    case "g'azabli":
      return "😡";
    default:
      return "👤";
  }
}

/**
 * Maps mood to localized Uzbek title
 */
export function getMoodLabelUz(mood: string): string {
  switch (mood.toLowerCase()) {
    case "xursand":
      return "Xursand";
    case "yaxshi":
      return "Yaxshi";
    case "normal":
      return "Sokin / Oddiy";
    case "charchagan":
      return "Charchagan";
    case "yomon":
      return "Yomon / Xafa";
    case "havotirli":
      return "Xavotirda";
    case "g'azabli":
      return "G'azablangan";
    default:
      return "Nomalum";
  }
}

/**
 * Maps mood to Tailwind color classes
 */
export function getMoodColors(mood: string): { bg: string; text: string; border: string } {
  switch (mood.toLowerCase()) {
    case "xursand":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-800",
      };
    case "yaxshi":
      return {
        bg: "bg-teal-50 dark:bg-teal-950/20",
        text: "text-teal-700 dark:text-teal-400",
        border: "border-teal-200 dark:border-teal-800",
      };
    case "normal":
      return {
        bg: "bg-gray-50 dark:bg-gray-800/40",
        text: "text-gray-700 dark:text-gray-300",
        border: "border-gray-200 dark:border-gray-700",
      };
    case "charchagan":
      return {
        bg: "bg-amber-50 dark:bg-amber-950/20",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-800",
      };
    case "yomon":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        text: "text-blue-700 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-800",
      };
    case "havotirli":
      return {
        bg: "bg-indigo-50 dark:bg-indigo-950/20",
        text: "text-indigo-700 dark:text-indigo-400",
        border: "border-indigo-200 dark:border-indigo-800",
      };
    case "g'azabli":
      return {
        bg: "bg-rose-50 dark:bg-rose-950/20",
        text: "text-rose-700 dark:text-rose-400",
        border: "border-rose-200 dark:border-rose-800",
      };
    default:
      return {
        bg: "bg-slate-50 dark:bg-slate-800/40",
        text: "text-slate-700 dark:text-slate-300",
        border: "border-slate-200 dark:border-slate-700",
      };
  }
}

/**
 * Maps companion emotion to descriptive Uzbek text for status bubble
 */
export function getEmotionStatusUz(emotion: EmotionType, botState: string): string {
  if (botState === "listening") return "Sizni tinglayapman...";
  if (botState === "thinking") return "O'ylayapman...";
  if (botState === "speaking") return "Gapirayapman...";

  switch (emotion) {
    case "xursand":
      return "Juda xursandman! 😊";
    case "hayajon":
      return "Hayajondaman! 🌟";
    case "hafa":
      return "Sizga hamdardman... 😢";
    case "oychan":
      return "Fikrlayapman... 🤔";
    case "uyqu":
      return "Uxlayapman... Zzz 😴";
    case "hazil":
      return "Hazillashgandim! 😜";
    case "jiddiy":
    default:
      return "Sizni eshitaman! 🤖";
  }
}

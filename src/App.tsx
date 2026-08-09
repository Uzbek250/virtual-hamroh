import React, { useEffect, useRef, useState } from "react";
import { Message, Reminder, MoodEntry, EmotionType, BotState } from "./types";
import { parseUzbekTime } from "./utils";
import { useLiveConversation, LiveActionEvent } from "./hooks/useLiveConversation";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { syncUserCollection } from "./utils/persistence";
import { GeminiVoiceName, isGeminiVoiceName } from "./config/voices";
import AppHeader from "./components/AppHeader";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import ReminderPanel from "./components/ReminderPanel";
import MoodPanel from "./components/MoodPanel";
import ReminderModal from "./components/ReminderModal";
import MoodModal from "./components/MoodModal";
import ReminderAlert from "./components/ReminderAlert";
import Toast from "./components/Toast";

const INITIAL_MESSAGE: Message = {
  id: "init",
  role: "assistant",
  text: "Salom! Men sizning samimiy virtual robot hamrohingizman. O'zbek tilida muloqot qila olaman. Menga istalgan narsani yozishingiz, darslaringiz uchun eslatmalar qo'yishingiz ('ertaga soat 9da darsni eslat' kabi) yoki bugungi kayfiyatingiz bilan bo'lishishingiz mumkin! 😊",
  emotion: "xursand",
  timestamp: new Date().toISOString(),
};

export default function App() {
  const [userId] = useState(() => {
    const key = "hamroh_user_id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `u_${crypto.randomUUID()}`;
    localStorage.setItem(key, created);
    return created;
  });

  const hydratedRef = useRef(false);
  const [messages, setMessages] = useLocalStorage<Message[]>("hamroh_messages", [INITIAL_MESSAGE]);
  const [reminders, setReminders] = useLocalStorage<Reminder[]>("hamroh_reminders", []);
  const [moodEntries, setMoodEntries] = useLocalStorage<MoodEntry[]>("hamroh_moods", []);
  const [voiceName, setVoiceName] = useLocalStorage<GeminiVoiceName>("hamroh_voice", "Kore");
  const [currentMessage, setCurrentMessage] = useState("");
  const [emotion, setEmotion] = useState<EmotionType>("xursand");
  const [botState, setBotState] = useState<BotState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "reminders" | "mood">("chat");
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [manualReminderText, setManualReminderText] = useState("");
  const [manualReminderTime, setManualReminderTime] = useState("");
  const [showAddMoodModal, setShowAddMoodModal] = useState(false);
  const [manualMoodType, setManualMoodType] = useState<MoodEntry["mood"]>("normal");
  const [manualMoodNote, setManualMoodNote] = useState("");
  const [activeAlert, setActiveAlert] = useState<Reminder | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isGeminiVoiceName(voiceName)) setVoiceName("Kore");
  }, [voiceName, setVoiceName]);

  const handleLiveAction = (event: LiveActionEvent) => {
    if (event.type === "reminderCreated") {
      const reminder = event.data as Reminder;
      if (!reminder?.id || !reminder?.text || !reminder?.dateTime) return;
      setReminders((prev) => prev.some((item) => item.id === reminder.id) ? prev : [reminder, ...prev]);
      setToastMessage(`Eslatma saqlandi: "${reminder.text}"`);
      return;
    }

    const mood = event.data as MoodEntry;
    if (!mood?.id || !mood?.note) return;
    setMoodEntries((prev) => prev.some((item) => item.id === mood.id) ? prev : [mood, ...prev]);
    setToastMessage("Kayfiyat kundaligiga yozuv saqlandi.");
  };

  const live = useLiveConversation({ voiceName, onAction: handleLiveAction });

  useEffect(() => {
    if (live.status === "listening") setBotState("listening");
    else if (live.status === "speaking") setBotState("speaking");
    else if (live.status === "connecting") setBotState("thinking");
    else if (live.status === "idle" || live.status === "error") setBotState("idle");
  }, [live.status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/data?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(data.messages.slice().reverse().map((m: any) => ({ id: m.id, role: m.role, text: m.text, emotion: m.emotion, timestamp: m.timestamp })));
        }
        if (Array.isArray(data.reminders) && data.reminders.length) {
          setReminders(data.reminders.slice().reverse().map((r: any) => ({ id: r.id, text: r.text, timeString: r.timeString ?? r.time_string, dateTime: r.dateTime ?? r.date_time, triggered: Boolean(r.triggered), createdAt: r.createdAt ?? r.created_at })));
        }
        if (Array.isArray(data.moods) && data.moods.length) {
          setMoodEntries(data.moods.slice().reverse().map((m: any) => ({ id: m.id, mood: m.mood, note: m.note, date: m.date, timestamp: m.timestamp })));
        }
      } catch (error) {
        console.warn("Persistent data load failed:", error);
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [userId, setMessages, setReminders, setMoodEntries]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void syncUserCollection({ endpoint: "/api/reminders", userId, items: reminders, toPayload: (r) => ({ id: r.id, text: r.text, timeString: r.timeString, dateTime: r.dateTime, triggered: r.triggered, createdAt: r.createdAt }) });
  }, [reminders, userId]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    void syncUserCollection({ endpoint: "/api/moods", userId, items: moodEntries, toPayload: (m) => ({ id: m.id, mood: m.mood, note: m.note, date: m.date, timestamp: m.timestamp }) });
  }, [moodEntries, userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = "uz-UZ";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => { setIsRecording(true); setBotState("listening"); };
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) setCurrentMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = (err: any) => { console.error("Speech recognition error:", err); setIsRecording(false); setBotState("idle"); };
    rec.onend = () => { setIsRecording(false); setBotState("idle"); };
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch {} };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      setReminders((prev) => prev.map((rem) => {
        const remTime = new Date(rem.dateTime);
        if (!rem.triggered && now >= remTime) {
          setActiveAlert(rem);
          playAlarmSound();
          return { ...rem, triggered: true };
        }
        return rem;
      }));
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [setReminders]);

  const showToast = (message: string) => setToastMessage(message);

  const playAlarmSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
        const freq = i % 2 === 0 ? 659.25 : 783.99;
        osc.frequency.setValueAtTime(freq, now + i * 0.4);
        gain.gain.setValueAtTime(0, now + i * 0.4);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.4 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.35);
        osc.start(now + i * 0.4); osc.stop(now + i * 0.4 + 0.4);
      }
    } catch (error) { console.error("Audio chime failed:", error); }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      showToast("Kechirasiz, ushbu brauzerda ovoz kiritish qo'llab-quvvatlanmaydi. Iltimos Chrome brauzeridan foydalaning.");
      return;
    }
    if (isRecording) recognitionRef.current.stop();
    else { currentAudioRef.current?.pause(); recognitionRef.current.start(); }
  };

  const stopAudio = () => {
    currentAudioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setBotState("idle");
  };

  const playSpeechFallback = (text: string) => {
    if (!("speechSynthesis" in window)) { setBotState("idle"); return; }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const uzVoice = voices.find((v) => v.lang.startsWith("uz") || v.lang.includes("UZ"));
      if (uzVoice) utterance.voice = uzVoice; else utterance.lang = "uz-UZ";
      utterance.onstart = () => setBotState("speaking");
      utterance.onend = () => setBotState("idle");
      utterance.onerror = () => setBotState("idle");
      window.speechSynthesis.speak(utterance);
    } catch (error) { console.error("Local SpeechSynthesis failed:", error); setBotState("idle"); }
  };

  const syncMessage = async (message: Message) => {
    await syncUserCollection({ endpoint: "/api/messages", userId, items: [message], toPayload: (m) => ({ id: m.id, role: m.role, text: m.text, emotion: m.emotion, timestamp: m.timestamp }) });
  };

  const handleAddManualReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReminderText || !manualReminderTime) return;
    const parsedTime = new Date(manualReminderTime);
    if (Number.isNaN(parsedTime.getTime())) { showToast("Noto'g'ri sana/vaqt kiritildi."); return; }
    const newRem: Reminder = {
      id: crypto.randomUUID(), text: manualReminderText,
      timeString: parsedTime.toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      dateTime: parsedTime.toISOString(), triggered: false, createdAt: new Date().toISOString(),
    };
    setReminders((prev) => [newRem, ...prev]);
    setManualReminderText(""); setManualReminderTime(""); setShowAddReminderModal(false);
    const message: Message = { id: crypto.randomUUID(), role: "assistant", text: `Eslatma qo'shildi: "${newRem.text}" - ${newRem.timeString}`, emotion: "xursand", timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, message]); void syncMessage(message); setEmotion("xursand");
  };

  const handleAddManualMood = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMoodNote) return;
    const newEntry: MoodEntry = { id: crypto.randomUUID(), mood: manualMoodType, note: manualMoodNote, date: new Date().toISOString().split("T")[0], timestamp: new Date().toISOString() };
    setMoodEntries((prev) => [newEntry, ...prev]);
    setManualMoodNote(""); setShowAddMoodModal(false);
    const message: Message = { id: crypto.randomUUID(), role: "assistant", text: "Kayfiyat kundaligingizga yangi yozuv saqlandi! Maslahat: Har doim o'zingizni asrang, men siz bilanman! ❤️", emotion: "xursand", timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, message]); void syncMessage(message); setEmotion("xursand");
  };

  const handleDeleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    fetch(`/api/reminders/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(console.warn);
  };
  const handleDeleteMood = (id: string) => {
    setMoodEntries((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/moods/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(console.warn);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentMessage.trim() || isLoading) return;
    const userText = currentMessage.trim();
    setCurrentMessage(""); stopAudio();
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: userText, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]); void syncMessage(userMsg); setIsLoading(true); setBotState("thinking");
    const historyPayload = messages.slice(-5).map((m) => ({ role: m.role, text: m.text }));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, message: userText, history: historyPayload, ttsEnabled, voiceName }) });
      if (!response.ok) throw new Error("Server xatosi yoki ulanish uzildi.");
      const data = await response.json();
      const robotReply = data.reply;
      const robotEmotion = data.emotion as EmotionType;
      const robotAction = data.action;
      setEmotion(robotEmotion);
      const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", text: robotReply, emotion: robotEmotion, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMsg]); void syncMessage(assistantMsg);
      if (robotAction && robotAction.type !== "none") {
        const payload = robotAction.payload;
        if (robotAction.type === "eslatma" && payload) {
          const rawTime = payload.time || "ertaga 09:00";
          const parsedTargetTime = parseUzbekTime(rawTime);
          setReminders((prev) => [...prev, { id: crypto.randomUUID(), text: payload.text || "Vazifani bajarish", timeString: rawTime, dateTime: parsedTargetTime.toISOString(), triggered: false, createdAt: new Date().toISOString() }]);
        } else if (robotAction.type === "kayfiyat" && payload) {
          setMoodEntries((prev) => [...prev, { id: crypto.randomUUID(), mood: (payload.mood || "normal") as MoodEntry["mood"], note: payload.note || userText, date: new Date().toISOString().split("T")[0], timestamp: new Date().toISOString() }]);
        }
      }
      if (data.audio && ttsEnabled) {
        try {
          const binary = atob(data.audio); const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: data.audioMimeType || "audio/wav" }));
          const audio = new Audio(); currentAudioRef.current = audio; setBotState("speaking");
          audio.onended = () => { setBotState("idle"); URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; };
          audio.onerror = () => { setBotState("idle"); URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; playSpeechFallback(robotReply); };
          audio.src = url; audio.load(); audio.play().catch(() => { setBotState("idle"); URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; playSpeechFallback(robotReply); });
        } catch { playSpeechFallback(robotReply); }
      } else if (ttsEnabled && robotReply) playSpeechFallback(robotReply);
      else setBotState("idle");
    } catch (err: any) {
      console.error("Chat error:", err);
      const errorMessage: Message = { id: crypto.randomUUID(), role: "assistant", text: `Muloqot qilishda xatolik yuz berdi: ${err.message || "Tizim ulanishida muammo bor"}. Secrets panelidan API kalitini tekshirib ko'ring!`, emotion: "hafa", timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, errorMessage]); void syncMessage(errorMessage); setEmotion("hafa"); setBotState("idle");
    } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen bg-sky-100 text-slate-800 flex flex-col font-sans relative overflow-hidden selection:bg-indigo-100 antialiased">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-200/40 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-200/50 rounded-full blur-3xl -z-10" />
      <AppHeader ttsEnabled={ttsEnabled} onToggleTts={() => { const value = !ttsEnabled; setTtsEnabled(value); if (!value) stopAudio(); }} reminderCount={reminders.filter((r) => !r.triggered).length} moodCount={moodEntries.length} onOpenReminders={() => setActiveTab("reminders")} onOpenMood={() => setActiveTab("mood")} onToggleSidebar={() => setShowSidebar((v) => !v)} />
      <main className="flex-1 flex w-full max-w-7xl mx-auto overflow-hidden relative">
        <Sidebar activeTab={activeTab} showSidebar={showSidebar} reminderCount={reminders.filter((r) => !r.triggered).length} moodCount={moodEntries.length} voiceName={isGeminiVoiceName(voiceName) ? voiceName : "Kore"} onVoiceChange={setVoiceName} onSelectTab={setActiveTab} onClose={() => setShowSidebar(false)} />
        <div className="flex-1 flex flex-col overflow-hidden bg-transparent relative">
          {activeTab === "chat" && <ChatWindow emotion={emotion} botState={botState} live={live} messages={messages} isLoading={isLoading} chatEndRef={chatEndRef} currentMessage={currentMessage} isRecording={isRecording} onCurrentMessageChange={setCurrentMessage} onToggleRecording={toggleRecording} onSendMessage={handleSendMessage} onStopAudio={stopAudio} />}
          {activeTab === "reminders" && <ReminderPanel reminders={reminders} onAdd={() => setShowAddReminderModal(true)} onDelete={handleDeleteReminder} />}
          {activeTab === "mood" && <MoodPanel entries={moodEntries} onAdd={() => setShowAddMoodModal(true)} onDelete={handleDeleteMood} />}
        </div>
      </main>
      <ReminderModal open={showAddReminderModal} text={manualReminderText} time={manualReminderTime} onTextChange={setManualReminderText} onTimeChange={setManualReminderTime} onSubmit={handleAddManualReminder} onClose={() => setShowAddReminderModal(false)} />
      <MoodModal open={showAddMoodModal} mood={manualMoodType} note={manualMoodNote} onMoodChange={setManualMoodType} onNoteChange={setManualMoodNote} onSubmit={handleAddManualMood} onClose={() => setShowAddMoodModal(false)} />
      <ReminderAlert reminder={activeAlert} onDismiss={() => setActiveAlert(null)} />
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}

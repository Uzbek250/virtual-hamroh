import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Message,
  Reminder,
  MoodEntry,
  EmotionType,
  BotState,
} from "./types";
import {
  parseUzbekTime,
  getMoodEmoji,
  getMoodLabelUz,
  getMoodColors,
  getEmotionStatusUz,
} from "./utils";
import CompanionAvatar from "./components/CompanionAvatar";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Send,
  Calendar,
  Bell,
  Plus,
  Trash2,
  Check,
  MessageSquare,
  Sparkles,
  Clock,
  Heart,
  AlertCircle,
  X,
  PlusCircle,
  Menu,
} from "lucide-react";

export default function App() {
  // State variables
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      role: "assistant",
      text: "Salom! Men sizning samimiy virtual robot hamrohingizman. O'zbek tilida muloqot qila olaman. Menga istalgan narsani yozishingiz, darslaringiz uchun eslatmalar qo'yishimni so'rashingiz ('ertaga soat 9da darsni eslat' kabi) yoki bugungi kayfiyatingiz bilan bo'lishishingiz mumkin! 😊",
      emotion: "xursand",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [emotion, setEmotion] = useState<EmotionType>("xursand");
  const [botState, setBotState] = useState<BotState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Reminders and Mood log loaded from localStorage
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("hamroh_reminders");
    return saved ? JSON.parse(saved) : [];
  });
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>(() => {
    const saved = localStorage.getItem("hamroh_moods");
    return saved ? JSON.parse(saved) : [];
  });

  // UI Tabs & Sidebar control
  const [activeTab, setActiveTab] = useState<"chat" | "reminders" | "mood">("chat");
  const [showSidebar, setShowSidebar] = useState(false);

  // Manual entry modal states
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [manualReminderText, setManualReminderText] = useState("");
  const [manualReminderTime, setManualReminderTime] = useState("");

  const [showAddMoodModal, setShowAddMoodModal] = useState(false);
  const [manualMoodType, setManualMoodType] = useState<MoodEntry["mood"]>("normal");
  const [manualMoodNote, setManualMoodNote] = useState("");

  // Alert/Alarm modal
  const [activeAlert, setActiveAlert] = useState<Reminder | null>(null);

  // References
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem("hamroh_reminders", JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem("hamroh_moods", JSON.stringify(moodEntries));
  }, [moodEntries]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize Speech Recognition on Mount
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = "uz-UZ";
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsRecording(true);
        setBotState("listening");
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setCurrentMessage((prev) => (prev ? prev + " " + transcript : transcript));
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech recognition error:", err);
        setIsRecording(false);
        setBotState("idle");
      };

      rec.onend = () => {
        setIsRecording(false);
        setBotState("idle");
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Reminder alarm ticker (checks every second)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setReminders((prev) =>
        prev.map((rem) => {
          const remTime = new Date(rem.dateTime);
          // If due and not triggered
          if (!rem.triggered && now >= remTime) {
            // Trigger visual and auditory alert
            setActiveAlert(rem);
            playAlarmSound();
            return { ...rem, triggered: true };
          }
          return rem;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Play alarm sound using Web Audio API
  const playAlarmSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Play elegant alarm chiming pattern
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        // Alternating chime notes
        const freq = i % 2 === 0 ? 659.25 : 783.99; // E5 and G5
        osc.frequency.setValueAtTime(freq, now + i * 0.4);

        gain.gain.setValueAtTime(0, now + i * 0.4);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.4 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.35);

        osc.start(now + i * 0.4);
        osc.stop(now + i * 0.4 + 0.4);
      }
    } catch (e) {
      console.error("Audio chime failed:", e);
    }
  };

  // Toggle Voice Input Recording
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Kechirasiz, ushbu brauzerda ovoz kiritish qo'llab-quvvatlanmaydi. Iltimos Chrome brauzeridan foydalaning.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      recognitionRef.current.start();
    }
  };

  // Stop current text-to-speech audio playback
  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setBotState("idle");
  };

  // Play audio using local browser SpeechSynthesis as fallback
  const playSpeechFallback = (text: string) => {
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        const voices = window.speechSynthesis.getVoices();
        const uzVoice = voices.find(v => v.lang.startsWith("uz") || v.lang.includes("UZ"));
        if (uzVoice) {
          utterance.voice = uzVoice;
        } else {
          utterance.lang = "uz-UZ";
        }
        
        utterance.onstart = () => setBotState("speaking");
        utterance.onend = () => setBotState("idle");
        utterance.onerror = () => setBotState("idle");
        
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("Local SpeechSynthesis failed:", err);
        setBotState("idle");
      }
    } else {
      setBotState("idle");
    }
  };

  // Process manual form additions
  const handleAddManualReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualReminderText || !manualReminderTime) return;

    const parsedTime = new Date(manualReminderTime);
    if (isNaN(parsedTime.getTime())) {
      alert("Noto'g'ri sana/vaqt kiritildi.");
      return;
    }

    const newRem: Reminder = {
      id: Math.random().toString(36).substring(2, 9),
      text: manualReminderText,
      timeString: parsedTime.toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      dateTime: parsedTime.toISOString(),
      triggered: false,
      createdAt: new Date().toISOString(),
    };

    setReminders((prev) => [newRem, ...prev]);
    setManualReminderText("");
    setManualReminderTime("");
    setShowAddReminderModal(false);

    // Prompt user on screen
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        role: "assistant",
        text: `Eslatma qo'shildi: "${newRem.text}" - ${newRem.timeString}`,
        emotion: "xursand",
        timestamp: new Date().toISOString(),
      },
    ]);
    setEmotion("xursand");
  };

  const handleAddManualMood = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMoodNote) return;

    const newEntry: MoodEntry = {
      id: Math.random().toString(36).substring(2, 9),
      mood: manualMoodType,
      note: manualMoodNote,
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
    };

    setMoodEntries((prev) => [newEntry, ...prev]);
    setManualMoodNote("");
    setShowAddMoodModal(false);

    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        role: "assistant",
        text: `Kayfiyat kundaligingizga yangi yozuv saqlandi! Maslahat: Har doim o'zingizni asrang, men siz bilanman! ❤️`,
        emotion: "xursand",
        timestamp: new Date().toISOString(),
      },
    ]);
    setEmotion("xursand");
  };

  // Delete handlers
  const handleDeleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteMood = (id: string) => {
    setMoodEntries((prev) => prev.filter((m) => m.id !== id));
  };

  // Main chat submit logic
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentMessage.trim() || isLoading) return;

    const userText = currentMessage.trim();
    setCurrentMessage("");
    stopAudio();

    // Add user message to log
    const userMsg: Message = {
      id: Math.random().toString(),
      role: "user",
      text: userText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBotState("thinking");

    // Format prompt history (last 5 messages)
    const historyPayload = messages.slice(-5).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          ttsEnabled: ttsEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error("Server xatosi yoki ulanish uzildi.");
      }

      const data = await response.json();
      const robotReply = data.reply;
      const robotEmotion = data.emotion as EmotionType;
      const robotAction = data.action;

      // Update state
      setEmotion(robotEmotion);

      // Save assistant message
      const assistantMsg: Message = {
        id: Math.random().toString(),
        role: "assistant",
        text: robotReply,
        emotion: robotEmotion,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Check and execute action detected by AI
      if (robotAction && robotAction.type !== "none") {
        const payload = robotAction.payload;

        if (robotAction.type === "eslatma" && payload) {
          const rawTime = payload.time || "ertaga 09:00";
          const parsedTargetTime = parseUzbekTime(rawTime);

          const newReminder: Reminder = {
            id: Math.random().toString(36).substring(2, 9),
            text: payload.text || "Vazifani bajarish",
            timeString: rawTime,
            dateTime: parsedTargetTime.toISOString(),
            triggered: false,
            createdAt: new Date().toISOString(),
          };
          setReminders((prev) => [newReminder, ...prev]);
        } else if (robotAction.type === "kayfiyat" && payload) {
          const newMood: MoodEntry = {
            id: Math.random().toString(36).substring(2, 9),
            mood: (payload.mood || "normal") as MoodEntry["mood"],
            note: payload.note || userText,
            date: new Date().toISOString().split("T")[0],
            timestamp: new Date().toISOString(),
          };
          setMoodEntries((prev) => [newMood, ...prev]);
        }
      }

      // Voice output play back
      if (data.audio && ttsEnabled) {
        try {
          const binary = atob(data.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const mimeType = data.audioMimeType || "audio/mp3";
          const blob = new Blob([bytes], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);

          currentAudioRef.current = audio;
          setBotState("speaking");
          audio.play().catch((playErr) => {
            console.error("Audio playback error, falling back to Web Speech:", playErr);
            playSpeechFallback(robotReply);
          });

          audio.onended = () => {
            setBotState("idle");
          };
        } catch (decodeErr) {
          console.error("Audio decoding error, falling back to Web Speech:", decodeErr);
          playSpeechFallback(robotReply);
        }
      } else if (ttsEnabled && robotReply) {
        // Fallback directly to local speech synthesis if server didn't generate audio (e.g. 503 error)
        playSpeechFallback(robotReply);
      } else {
        setBotState("idle");
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: "assistant",
          text: `Muloqot qilishda xatolik yuz berdi: ${err.message || "Tizim ulanishida muammo bor"}. Secrets panelidan API kalitini tekshirib ko'ring!`,
          emotion: "hafa",
          timestamp: new Date().toISOString(),
        },
      ]);
      setEmotion("hafa");
      setBotState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sky-100 text-slate-800 flex flex-col font-sans relative overflow-hidden selection:bg-indigo-100 antialiased">
      {/* Visual background accents */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-200/40 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-200/50 rounded-full blur-3xl -z-10" />

      {/* Header section */}
      <header className="border-b border-sky-200 bg-white/50 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden p-1.5 hover:bg-sky-100 rounded-lg transition-colors text-slate-600"
            id="mobile-menu-btn"
          >
            <Menu size={22} />
          </button>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg text-white">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-indigo-900 leading-none">
              OMON <span className="text-sky-500 text-xs font-semibold tracking-normal uppercase ml-1">Virtual Hamroh</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Virtual intellektual yordamchi</p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Audio voice response toggle */}
          <button
            onClick={() => {
              const val = !ttsEnabled;
              setTtsEnabled(val);
              if (!val) stopAudio();
            }}
            className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 border font-bold text-xs ${
              ttsEnabled
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm"
                : "bg-white/60 text-slate-500 border-sky-200"
            }`}
            title={ttsEnabled ? "Gemini ovozi yoqilgan" : "Gemini ovozi o'chirilgan"}
            id="tts-toggle-btn"
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden sm:inline">{ttsEnabled ? "Ovozlangan" : "Mute"}</span>
          </button>

          {/* Quick Stats badges */}
          <div className="hidden sm:flex items-center gap-2">
            <span
              onClick={() => setActiveTab("reminders")}
              className="bg-white/80 border border-sky-200 text-indigo-900 text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm"
              id="header-reminders-badge"
            >
              <Bell size={13} className="text-amber-500" />
              {reminders.filter((r) => !r.triggered).length}
            </span>
            <span
              onClick={() => setActiveTab("mood")}
              className="bg-white/80 border border-sky-200 text-indigo-900 text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm"
              id="header-moods-badge"
            >
              <Heart size={13} className="text-rose-500" />
              {moodEntries.length}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Workspace Grid */}
      <main className="flex-1 flex w-full max-w-7xl mx-auto overflow-hidden relative">
        {/* Navigation Sidebar/Drawer for mobile and responsive panel for Desktop */}
        <div
          className={`fixed inset-y-0 left-0 transform ${
            showSidebar ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0 md:static transition-transform duration-300 ease-in-out z-40 w-72 bg-white/95 md:bg-white/30 backdrop-blur-md border-r border-sky-200 p-6 flex flex-col gap-6 md:flex`}
          id="workspace-sidebar"
        >
          {/* Mobile close sidebar button */}
          <div className="flex md:hidden justify-between items-center pb-2 border-b border-sky-100">
            <span className="font-bold text-slate-700">Ilova bo'limlari</span>
            <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-sky-100 rounded-lg">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">
              Muloqot va Xizmatlar
            </span>
            <button
              onClick={() => {
                setActiveTab("chat");
                setShowSidebar(false);
              }}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
              }`}
              id="tab-chat-btn"
            >
              <MessageSquare size={18} />
              Robot bilan suhbat
            </button>

            <button
              onClick={() => {
                setActiveTab("reminders");
                setShowSidebar(false);
              }}
              className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "reminders"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
              }`}
              id="tab-reminders-btn"
            >
              <span className="flex items-center gap-3">
                <Bell size={18} />
                Eslatmalar
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "reminders" ? "bg-white/20 text-white" : "bg-sky-200 text-indigo-900"
                }`}
              >
                {reminders.filter((r) => !r.triggered).length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab("mood");
                setShowSidebar(false);
              }}
              className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "mood"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-600 hover:bg-white/50 hover:text-slate-900"
              }`}
              id="tab-mood-btn"
            >
              <span className="flex items-center gap-3">
                <Heart size={18} />
                Kayfiyat Kundaligi
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "mood" ? "bg-white/20 text-white" : "bg-sky-200 text-indigo-900"
                }`}
              >
                {moodEntries.length}
              </span>
            </button>
          </div>

          <div className="mt-auto border-t border-sky-200/60 pt-4 flex flex-col gap-2.5">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-sky-200/60 shadow-sm animate-pulse">
              <h4 className="text-xs font-black text-indigo-900 mb-1 flex items-center gap-1 uppercase tracking-wider">
                <Clock size={12} className="text-indigo-600" />
                Maslahat / Ma'lumot
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                Suhbat chog'ida "Bugun darsga tayyorlandim" deb yozing, va u kayfiyat kundaligiga tushadi!
              </p>
            </div>
            <div className="text-[10px] text-indigo-900/60 pl-1 font-bold">
              Hamroh v1.0.0 • 2026 O'zbekiston
            </div>
          </div>
        </div>

        {/* Dynamic Workspace Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-transparent relative">
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden md:flex-row">
              {/* Center Screen: Interactive Virtual Robot & Text Output */}
              <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto max-w-2xl mx-auto w-full gap-4 relative">
                {/* Robot companion view */}
                <div className="flex flex-col items-center justify-center pt-2 relative">
                  {/* Speech Cloud Bubble */}
                  <div className="mb-6 relative max-w-sm w-full">
                    <div className="bg-indigo-600 text-white px-6 py-3.5 rounded-3xl rounded-bl-none text-sm md:text-base font-semibold shadow-2xl relative z-10 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-300 animate-ping" />
                        <span>{getEmotionStatusUz(emotion, botState)}</span>
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-6 w-5 h-5 bg-indigo-600 transform rotate-45 z-0" />
                  </div>

                  {/* Character visual */}
                  <CompanionAvatar emotion={emotion} botState={botState} />
                </div>

                {/* Interactive Speech Log Block */}
                <div className="flex-1 min-h-[160px] bg-white/40 backdrop-blur-md border border-sky-200/60 rounded-3xl p-4 md:p-6 overflow-y-auto flex flex-col gap-4 scrollbar-thin scrollbar-thumb-indigo-200 shadow-inner">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[85%] ${
                        m.role === "user" ? "self-end items-end" : "self-start items-start"
                      }`}
                    >
                      <div
                        className={`py-2.5 px-4 rounded-2xl text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-indigo-600 text-white font-medium rounded-tr-none shadow-md"
                            : "bg-white text-slate-700 border border-sky-100 rounded-tl-none shadow-md"
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="text-[10px] text-indigo-950/60 mt-1 px-1 font-bold">
                        {new Date(m.timestamp).toLocaleTimeString("uz-UZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.emotion && m.role === "assistant" && ` • ${m.emotion}`}
                      </span>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="self-start flex flex-col gap-2 bg-white/80 border border-sky-200 p-4 rounded-3xl rounded-tl-none shadow-md">
                      <div className="flex gap-2 items-center">
                        <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce"></div>
                        <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                        <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                        <span className="ml-2 text-indigo-500 font-bold text-xs uppercase tracking-wider">O'ylayapman...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Text and speech recording Input Bar */}
                <form
                  onSubmit={handleSendMessage}
                  className="bg-white/90 backdrop-blur-md border border-sky-200/80 rounded-3xl p-2.5 flex items-center gap-2.5 shadow-xl relative"
                >
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`p-3.5 rounded-2xl transition-all ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600"
                    }`}
                    title={isRecording ? "Yozib olishni to'xtatish" : "Ovoz orqali kiritish"}
                    id="mic-btn"
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder={
                      isRecording
                        ? "Ovozli xabarni tinglayapman..."
                        : "O'zbek tilida nimadir yozing..."
                    }
                    className="flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-slate-400 text-slate-800 font-medium"
                    disabled={isRecording || isLoading}
                    id="chat-input"
                  />

                  {botState === "speaking" && (
                    <button
                      type="button"
                      onClick={stopAudio}
                      className="p-1.5 px-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-colors uppercase tracking-wider"
                      id="stop-audio-btn"
                    >
                      Ovozni o'chirish
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={!currentMessage.trim() || isLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-2xl transition-all disabled:opacity-40 shadow-md"
                    id="send-btn"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === "reminders" && (
            <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-sky-200/60">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-indigo-900 flex items-center gap-2">
                    <Bell className="text-amber-500" />
                    Eslatmalar Ro'yxati
                  </h2>
                  <p className="text-xs md:text-sm text-slate-600 font-medium mt-1">
                    Muloqot darchasida aytilgan yoki qo'lda kiritilgan eslatmalaringiz
                  </p>
                </div>
                <button
                  onClick={() => setShowAddReminderModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                  id="add-reminder-btn"
                >
                  <Plus size={16} />
                  Yangi qo'shish
                </button>
              </div>

              {reminders.length === 0 ? (
                <div className="bg-white/40 border border-sky-200/60 rounded-3xl p-10 text-center text-slate-400">
                  <Clock size={40} className="mx-auto mb-3 text-indigo-400" />
                  <p className="text-sm font-bold text-indigo-950">Hech qanday eslatmalar yo'q.</p>
                  <p className="text-xs mt-1 text-slate-500">
                    Robotga "ertaga soat 9da eslatma qo'y" deb ayting yoki tugma orqali qo'shing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {reminders.map((rem) => (
                    <div
                      key={rem.id}
                      className={`p-5 rounded-3xl border transition-all ${
                        rem.triggered
                          ? "bg-white/30 border-sky-200/40 opacity-70"
                          : "bg-white border-sky-200 shadow-xl"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p
                            className={`text-sm font-extrabold leading-tight ${
                              rem.triggered ? "line-through text-slate-400" : "text-indigo-950"
                            }`}
                          >
                            {rem.text}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mt-2">
                            <Clock size={12} className="text-amber-500" />
                            <span>{new Date(rem.dateTime).toLocaleString("uz-UZ", {
                              day: "numeric",
                              month: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}</span>
                            {rem.triggered && (
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase ml-1">
                                Faollashgan
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteReminder(rem.id)}
                          className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                          id={`delete-reminder-${rem.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "mood" && (
            <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-sky-200/60">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-indigo-900 flex items-center gap-2">
                    <Heart className="text-rose-500 fill-rose-100" />
                    Kunlik Kayfiyat Kundaligi
                  </h2>
                  <p className="text-xs md:text-sm text-slate-600 font-medium mt-1">
                    O'z his-tuyg'ularingizni va kunlik vaziyatlaringizni kuzatib boring
                  </p>
                </div>
                <button
                  onClick={() => setShowAddMoodModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                  id="add-mood-btn"
                >
                  <Plus size={16} />
                  Yozuv qo'shish
                </button>
              </div>

              {moodEntries.length === 0 ? (
                <div className="bg-white/40 border border-sky-200/60 rounded-3xl p-10 text-center text-slate-400">
                  <Calendar size={40} className="mx-auto mb-3 text-indigo-400" />
                  <p className="text-sm font-bold text-indigo-950">Kundalikda hech qanday yozuv yo'q.</p>
                  <p className="text-xs mt-1 text-slate-500">
                    Suhbat chog'ida kayfiyatingiz haqida gapiring ("bugun charchadim" va h.k.) yoki tugma orqali yozing.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {moodEntries.map((entry) => {
                    const colors = getMoodColors(entry.mood);
                    return (
                      <div
                        key={entry.id}
                        className={`p-5 rounded-3xl border ${colors.border} ${colors.bg} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all shadow-xl`}
                      >
                        <div className="flex gap-3.5 items-start">
                          <div className="text-3xl p-1 select-none">{getMoodEmoji(entry.mood)}</div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colors.border} ${colors.text} bg-white`}>
                                {getMoodLabelUz(entry.mood)}
                              </span>
                              <span className="text-[11px] text-slate-400 font-bold">
                                {new Date(entry.timestamp).toLocaleString("uz-UZ", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 font-semibold mt-1.5 leading-relaxed">
                              {entry.note}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteMood(entry.id)}
                          className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-white/40 transition-colors self-end sm:self-center"
                          id={`delete-mood-${entry.id}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Manual Reminder Addition Modal */}
      <AnimatePresence>
        {showAddReminderModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-sky-100"
              id="add-reminder-modal"
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-sky-100">
                <h3 className="text-base font-black text-indigo-900 uppercase tracking-wide">Yangi eslatma qo'shish</h3>
                <button
                  onClick={() => setShowAddReminderModal(false)}
                  className="p-1.5 hover:bg-sky-100 rounded-lg transition-colors text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddManualReminder} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Eslatma matni</label>
                  <input
                    type="text"
                    required
                    value={manualReminderText}
                    onChange={(e) => setManualReminderText(e.target.value)}
                    placeholder="Masalan: Ertangi darsga borish"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-slate-800 font-medium"
                    id="manual-reminder-text"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Trigger vaqti</label>
                  <input
                    type="datetime-local"
                    required
                    value={manualReminderTime}
                    onChange={(e) => setManualReminderTime(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-slate-800 font-medium"
                    id="manual-reminder-time"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-sm transition-all shadow-md"
                  id="manual-reminder-submit"
                >
                  Eslatmani saqlash
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Manual Mood Log Addition Modal */}
        {showAddMoodModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-sky-100"
              id="add-mood-modal"
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-sky-100">
                <h3 className="text-base font-black text-indigo-900 uppercase tracking-wide">Kunlik kayfiyatingizni yozing</h3>
                <button
                  onClick={() => setShowAddMoodModal(false)}
                  className="p-1.5 hover:bg-sky-100 rounded-lg transition-colors text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddManualMood} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-2">Hozirgi holatingiz</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: "xursand", label: "Xursand", emoji: "😊" },
                        { id: "yaxshi", label: "Yaxshi", emoji: "🙂" },
                        { id: "normal", label: "Oddiy", emoji: "😐" },
                        { id: "charchagan", label: "Charchagan", emoji: "😫" },
                        { id: "yomon", label: "Xafa", emoji: "😢" },
                        { id: "havotirli", label: "Xavotir", emoji: "😰" },
                        { id: "g'azabli", label: "Asabiy", emoji: "😡" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setManualMoodType(m.id)}
                        className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                          manualMoodType === m.id
                            ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-extrabold"
                            : "bg-stone-50 border-stone-200 text-slate-500 hover:bg-stone-100"
                        }`}
                      >
                        <span className="text-xl select-none">{m.emoji}</span>
                        <span className="text-[10px] font-bold">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Nimalar sodir bo'ldi (eslatma)?</label>
                  <textarea
                    required
                    rows={3}
                    value={manualMoodNote}
                    onChange={(e) => setManualMoodNote(e.target.value)}
                    placeholder="Masalan: Bugun imtihonni yaxshi topshirdim, kayfiyatim a'lo."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-slate-800 font-medium"
                    id="manual-mood-note"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-sm transition-all shadow-md"
                  id="manual-mood-submit"
                >
                  Kundalikka qo'shish
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Triggered Alarm Reminder Overlay Modal */}
        {activeAlert && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border-2 border-indigo-400 flex flex-col items-center gap-4"
              id="active-alert-modal"
            >
              <div className="h-16 w-16 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-500 flex items-center justify-center animate-bounce">
                <Bell size={32} />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">⏰ Eslatma Vaqti Keldi!</span>
                <h3 className="text-lg font-extrabold text-slate-800 mt-1 leading-snug">
                  {activeAlert.text}
                </h3>
                <p className="text-xs text-slate-400 font-bold mt-2">
                  Rejalashtirilgan vaqt: {activeAlert.timeString}
                </p>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-sm transition-all shadow-md shadow-indigo-600/10"
                id="active-alert-dismiss"
              >
                Tushundim, Bajarildi! ✅
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

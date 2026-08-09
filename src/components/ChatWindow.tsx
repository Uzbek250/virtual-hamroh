import { FormEvent, RefObject } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, Send } from "lucide-react";
import CompanionAvatar from "./CompanionAvatar";
import { EmotionType, BotState, Message } from "../types";
import { getEmotionStatusUz } from "../utils";

interface LiveState {
  status: "idle" | "connecting" | "listening" | "speaking" | "error";
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

interface ChatWindowProps {
  emotion: EmotionType;
  botState: BotState;
  live: LiveState;
  messages: Message[];
  isLoading: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  currentMessage: string;
  isRecording: boolean;
  onCurrentMessageChange: (value: string) => void;
  onToggleRecording: () => void;
  onSendMessage: (e?: FormEvent) => void;
  onStopAudio: () => void;
}

export default function ChatWindow({
  emotion, botState, live, messages, isLoading, chatEndRef, currentMessage, isRecording,
  onCurrentMessageChange, onToggleRecording, onSendMessage, onStopAudio,
}: ChatWindowProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden md:flex-row">
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto max-w-2xl mx-auto w-full gap-4 relative">
        <div className="flex flex-col items-center justify-center pt-2 relative">
          <div className="mb-6 relative max-w-sm w-full">
            <div className="bg-indigo-600 text-white px-6 py-3.5 rounded-3xl rounded-bl-none text-sm md:text-base font-semibold shadow-2xl relative z-10 text-center">
              <div className="flex items-center justify-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-300 animate-ping" /><span>{getEmotionStatusUz(emotion, botState)}</span></div>
            </div>
            <div className="absolute -bottom-2 left-6 w-5 h-5 bg-indigo-600 transform rotate-45 z-0" />
          </div>

          <CompanionAvatar emotion={emotion} botState={botState} />

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={live.status === "idle" || live.status === "error" ? live.start : live.stop}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm shadow-xl transition-all ${live.status === "listening" || live.status === "speaking" || live.status === "connecting" ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
              id="live-conversation-btn"
            >
              {live.status === "listening" || live.status === "speaking" || live.status === "connecting" ? <><PhoneOff size={18} /> Suhbatni tugatish</> : <><PhoneCall size={18} /> Jonli suhbatni boshlash</>}
            </button>
            {live.status === "connecting" && <span className="text-xs text-indigo-500 font-semibold">Ulanmoqda...</span>}
            {live.status === "listening" && <span className="text-xs text-emerald-600 font-semibold">Eshityapman...</span>}
            {live.status === "speaking" && <span className="text-xs text-indigo-600 font-semibold">Gapiryapman...</span>}
            {live.status === "error" && live.errorMessage && <span className="text-xs text-red-500 font-semibold max-w-xs text-center">{live.errorMessage}</span>}
          </div>
        </div>

        <div className="flex-1 min-h-[160px] bg-white/40 backdrop-blur-md border border-sky-200/60 rounded-3xl p-4 md:p-6 overflow-y-auto flex flex-col gap-4 scrollbar-thin scrollbar-thumb-indigo-200 shadow-inner">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col max-w-[85%] ${m.role === "user" ? "self-end items-end" : "self-start items-start"}`}>
              <div className={`py-2.5 px-4 rounded-2xl text-sm leading-relaxed ${m.role === "user" ? "bg-indigo-600 text-white font-medium rounded-tr-none shadow-md" : "bg-white text-slate-700 border border-sky-100 rounded-tl-none shadow-md"}`}>{m.text}</div>
              <span className="text-[10px] text-indigo-950/60 mt-1 px-1 font-bold">{new Date(m.timestamp).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}{m.emotion && m.role === "assistant" && ` • ${m.emotion}`}</span>
            </div>
          ))}
          {isLoading && (
            <div className="self-start flex flex-col gap-2 bg-white/80 border border-sky-200 p-4 rounded-3xl rounded-tl-none shadow-md">
              <div className="flex gap-2 items-center"><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" /><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} /><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} /><span className="ml-2 text-indigo-500 font-bold text-xs uppercase tracking-wider">O'ylayapman...</span></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={onSendMessage} className="bg-white/90 backdrop-blur-md border border-sky-200/80 rounded-3xl p-2.5 flex items-center gap-2.5 shadow-xl relative">
          <button type="button" onClick={onToggleRecording} className={`p-3.5 rounded-2xl transition-all ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600"}`} title={isRecording ? "Yozib olishni to'xtatish" : "Ovoz orqali kiritish"} id="mic-btn">
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <input type="text" value={currentMessage} onChange={(e) => onCurrentMessageChange(e.target.value)} placeholder={isRecording ? "Ovozli xabarni tinglayapman..." : "O'zbek tilida nimadir yozing..."} className="flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-slate-400 text-slate-800 font-medium" disabled={isRecording || isLoading} id="chat-input" />
          {botState === "speaking" && <button type="button" onClick={onStopAudio} className="p-1.5 px-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-colors uppercase tracking-wider" id="stop-audio-btn">Ovozni o'chirish</button>}
          <button type="submit" disabled={!currentMessage.trim() || isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 rounded-2xl transition-all disabled:opacity-40 shadow-md" id="send-btn"><Send size={18} /></button>
        </form>
      </div>
    </div>
  );
}

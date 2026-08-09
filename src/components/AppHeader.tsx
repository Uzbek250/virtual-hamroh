import { Bell, Heart, Menu, Sparkles, Volume2, VolumeX } from "lucide-react";

interface AppHeaderProps {
  ttsEnabled: boolean;
  onToggleTts: () => void;
  reminderCount: number;
  moodCount: number;
  onOpenReminders: () => void;
  onOpenMood: () => void;
  onToggleSidebar: () => void;
}

export default function AppHeader({
  ttsEnabled,
  onToggleTts,
  reminderCount,
  moodCount,
  onOpenReminders,
  onOpenMood,
  onToggleSidebar,
}: AppHeaderProps) {
  return (
    <header className="border-b border-sky-200 bg-white/50 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onToggleSidebar} className="md:hidden p-1.5 hover:bg-sky-100 rounded-lg transition-colors text-slate-600" id="mobile-menu-btn">
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

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTts}
          className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 border font-bold text-xs ${
            ttsEnabled ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm" : "bg-white/60 text-slate-500 border-sky-200"
          }`}
          title={ttsEnabled ? "Gemini ovozi yoqilgan" : "Gemini ovozi o'chirilgan"}
          id="tts-toggle-btn"
        >
          {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span className="hidden sm:inline">{ttsEnabled ? "Ovozlangan" : "Mute"}</span>
        </button>
        <div className="hidden sm:flex items-center gap-2">
          <button onClick={onOpenReminders} className="bg-white/80 border border-sky-200 text-indigo-900 text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm" id="header-reminders-badge">
            <Bell size={13} className="text-amber-500" />
            {reminderCount}
          </button>
          <button onClick={onOpenMood} className="bg-white/80 border border-sky-200 text-indigo-900 text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm" id="header-moods-badge">
            <Heart size={13} className="text-rose-500" />
            {moodCount}
          </button>
        </div>
      </div>
    </header>
  );
}

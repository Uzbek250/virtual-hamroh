import { Bell, Clock, Heart, MessageSquare, X } from "lucide-react";

interface SidebarProps {
  activeTab: "chat" | "reminders" | "mood";
  showSidebar: boolean;
  reminderCount: number;
  moodCount: number;
  onSelectTab: (tab: "chat" | "reminders" | "mood") => void;
  onClose: () => void;
}

export default function Sidebar({ activeTab, showSidebar, reminderCount, moodCount, onSelectTab, onClose }: SidebarProps) {
  const select = (tab: "chat" | "reminders" | "mood") => {
    onSelectTab(tab);
    onClose();
  };

  return (
    <div
      className={`fixed inset-y-0 left-0 transform ${showSidebar ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static transition-transform duration-300 ease-in-out z-40 w-72 bg-white/95 md:bg-white/30 backdrop-blur-md border-r border-sky-200 p-6 flex flex-col gap-6 md:flex`}
      id="workspace-sidebar"
    >
      <div className="flex md:hidden justify-between items-center pb-2 border-b border-sky-100">
        <span className="font-bold text-slate-700">Ilova bo'limlari</span>
        <button onClick={onClose} className="p-1 hover:bg-sky-100 rounded-lg" aria-label="Yon panelni yopish"><X size={20} /></button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">Muloqot va Xizmatlar</span>
        <button onClick={() => select("chat")} className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === "chat" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:bg-white/50 hover:text-slate-900"}`} id="tab-chat-btn">
          <MessageSquare size={18} /> Robot bilan suhbat
        </button>
        <button onClick={() => select("reminders")} className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === "reminders" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:bg-white/50 hover:text-slate-900"}`} id="tab-reminders-btn">
          <span className="flex items-center gap-3"><Bell size={18} /> Eslatmalar</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === "reminders" ? "bg-white/20 text-white" : "bg-sky-200 text-indigo-900"}`}>{reminderCount}</span>
        </button>
        <button onClick={() => select("mood")} className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === "mood" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:bg-white/50 hover:text-slate-900"}`} id="tab-mood-btn">
          <span className="flex items-center gap-3"><Heart size={18} /> Kayfiyat Kundaligi</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === "mood" ? "bg-white/20 text-white" : "bg-sky-200 text-indigo-900"}`}>{moodCount}</span>
        </button>
      </div>

      <div className="mt-auto border-t border-sky-200/60 pt-4 flex flex-col gap-2.5">
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-sky-200/60 shadow-sm animate-pulse">
          <h4 className="text-xs font-black text-indigo-900 mb-1 flex items-center gap-1 uppercase tracking-wider"><Clock size={12} className="text-indigo-600" /> Maslahat / Ma'lumot</h4>
          <p className="text-xs text-slate-600 leading-relaxed font-semibold">Suhbat chog'ida "Bugun darsga tayyorlandim" deb yozing, va u kayfiyat kundaligiga tushadi!</p>
        </div>
        <div className="text-[10px] text-indigo-900/60 pl-1 font-bold">Virtual Hamroh V3.2 • 2026 O'zbekiston</div>
      </div>
    </div>
  );
}

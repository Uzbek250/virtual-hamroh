import { Bell, Clock, Plus, Trash2 } from "lucide-react";
import { Reminder } from "../types";

interface ReminderPanelProps {
  reminders: Reminder[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export default function ReminderPanel({ reminders, onAdd, onDelete }: ReminderPanelProps) {
  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-sky-200/60">
        <div><h2 className="text-xl md:text-2xl font-black text-indigo-900 flex items-center gap-2"><Bell className="text-amber-500" /> Eslatmalar Ro'yxati</h2><p className="text-xs md:text-sm text-slate-600 font-medium mt-1">Muloqot darchasida aytilgan yoki qo'lda kiritilgan eslatmalaringiz</p></div>
        <button onClick={onAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20" id="add-reminder-btn"><Plus size={16} /> Yangi qo'shish</button>
      </div>
      {reminders.length === 0 ? (
        <div className="bg-white/40 border border-sky-200/60 rounded-3xl p-10 text-center text-slate-400"><Clock size={40} className="mx-auto mb-3 text-indigo-400" /><p className="text-sm font-bold text-indigo-950">Hech qanday eslatmalar yo'q.</p><p className="text-xs mt-1 text-slate-500">Robotga "ertaga soat 9da eslatma qo'y" deb ayting yoki tugma orqali qo'shing.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{reminders.map((rem) => (
          <div key={rem.id} className={`p-5 rounded-3xl border transition-all ${rem.triggered ? "bg-white/30 border-sky-200/40 opacity-70" : "bg-white border-sky-200 shadow-xl"}`}>
            <div className="flex justify-between items-start gap-2"><div className="flex-1"><p className={`text-sm font-extrabold leading-tight ${rem.triggered ? "line-through text-slate-400" : "text-indigo-950"}`}>{rem.text}</p><div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mt-2"><Clock size={12} className="text-amber-500" /><span>{new Date(rem.dateTime).toLocaleString("uz-UZ", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span>{rem.triggered && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase ml-1">Faollashgan</span>}</div></div><button onClick={() => onDelete(rem.id)} className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-stone-50 transition-colors" id={`delete-reminder-${rem.id}`}><Trash2 size={16} /></button></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

import { Calendar, Heart, Plus, Trash2 } from "lucide-react";
import { MoodEntry } from "../types";
import { getMoodColors, getMoodEmoji, getMoodLabelUz } from "../utils";

interface MoodPanelProps {
  entries: MoodEntry[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export default function MoodPanel({ entries, onAdd, onDelete }: MoodPanelProps) {
  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-sky-200/60"><div><h2 className="text-xl md:text-2xl font-black text-indigo-900 flex items-center gap-2"><Heart className="text-rose-500 fill-rose-100" /> Kunlik Kayfiyat Kundaligi</h2><p className="text-xs md:text-sm text-slate-600 font-medium mt-1">O'z his-tuyg'ularingizni va kunlik vaziyatlaringizni kuzatib boring</p></div><button onClick={onAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20" id="add-mood-btn"><Plus size={16} /> Yozuv qo'shish</button></div>
      {entries.length === 0 ? (
        <div className="bg-white/40 border border-sky-200/60 rounded-3xl p-10 text-center text-slate-400"><Calendar size={40} className="mx-auto mb-3 text-indigo-400" /><p className="text-sm font-bold text-indigo-950">Kundalikda hech qanday yozuv yo'q.</p><p className="text-xs mt-1 text-slate-500">Suhbat chog'ida kayfiyatingiz haqida gapiring ("bugun charchadim" va h.k.) yoki tugma orqali yozing.</p></div>
      ) : (
        <div className="flex flex-col gap-4">{entries.map((entry) => { const colors = getMoodColors(entry.mood); return <div key={entry.id} className={`p-5 rounded-3xl border ${colors.border} ${colors.bg} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all shadow-xl`}><div className="flex gap-3.5 items-start"><div className="text-3xl p-1 select-none">{getMoodEmoji(entry.mood)}</div><div><div className="flex items-center gap-2 flex-wrap"><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colors.border} ${colors.text} bg-white`}>{getMoodLabelUz(entry.mood)}</span><span className="text-[11px] text-slate-400 font-bold">{new Date(entry.timestamp).toLocaleString("uz-UZ", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><p className="text-sm text-slate-700 font-semibold mt-1.5 leading-relaxed">{entry.note}</p></div></div><button onClick={() => onDelete(entry.id)} className="text-stone-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-white/40 transition-colors self-end sm:self-center" id={`delete-mood-${entry.id}`}><Trash2 size={16} /></button></div>; })}</div>
      )}
    </div>
  );
}

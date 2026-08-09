import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, X } from "lucide-react";

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          className="fixed top-20 right-4 z-[70] max-w-sm w-[calc(100%-2rem)] bg-white border border-sky-200 shadow-2xl rounded-2xl p-4 flex items-start gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="h-9 w-9 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle size={18} />
          </div>
          <p className="flex-1 text-sm font-semibold text-slate-700 leading-relaxed">{message}</p>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Xabarni yopish">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

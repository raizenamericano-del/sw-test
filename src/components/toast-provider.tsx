"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; title: string; message?: string }
interface ToastContextValue { toast: (kind: ToastKind, title: string, message?: string) => void }
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, kind, title, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);
  const remove = (id: number) => setItems((current) => current.filter((item) => item.id !== id));
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div className={`toast ${item.kind === "error" ? "error" : ""}`} key={item.id}>
            <div className="toast-icon">{item.kind === "error" ? <CircleAlert size={15} /> : <Check size={15} />}</div>
            <div className="toast-copy"><strong>{item.title}</strong>{item.message && <span>{item.message}</span>}</div>
            <button className="profile-logout" style={{ color: "#8d9a90", marginLeft: "auto" }} onClick={() => remove(item.id)} aria-label="Tutup notifikasi"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

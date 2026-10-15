"use client";

import { useState } from "react";
import { ArrowDownToLine, Check, Clock3, CloudUpload, Link2, Trash2, X } from "lucide-react";
import type { ActivityRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="page-eyebrow" style={{ marginBottom: 7 }}>{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-art">{icon}</div><h3>{title}</h3><p>{description}</p>{action && <div style={{ marginTop: 15 }}>{action}</div>}</div>;
}

export function ActivityFeed({ items }: { items: ActivityRecord[] }) {
  if (!items.length) return <EmptyState icon={<Clock3 size={25} strokeWidth={1.6} />} title="Belum ada aktivitas" description="Aktivitas admin yang tercatat akan muncul di sini. Tidak ada data aktivitas contoh." />;
  const iconFor = (type: ActivityRecord["type"]) => {
    if (type === "media_imported") return <CloudUpload size={14} />;
    if (type === "download_completed" || type === "download_failed") return <ArrowDownToLine size={14} />;
    if (type === "session_connected" || type === "session_disconnected") return <Link2 size={14} />;
    if (type === "media_deleted") return <Trash2 size={14} />;
    return <Check size={14} />;
  };
  return <div className="activity-list">{items.map((item) => <div className="activity-row" key={item.id}><div className="activity-icon">{iconFor(item.type)}</div><div className="activity-copy"><strong>{item.message}</strong><span>{formatDate(item.createdAt)}</span></div><span className="activity-time">{new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</span></div>)}</div>;
}

export function StatusBadge({ state, label }: { state: "good" | "warn" | "off"; label: string }) {
  return <span className={`service-state ${state === "good" ? "state-good" : state === "warn" ? "state-warn" : "state-off"}`}>{label}</span>;
}

export function ConfirmDialog({ title, description, confirmLabel = "Hapus media", onConfirm, onCancel, busy = false }: { title: string; description: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={{ width: "min(410px, 100%)", padding: 22 }}><button className="icon-button" onClick={onCancel} style={{ float: "right" }} aria-label="Tutup"><X size={15} /></button><div className="empty-art" style={{ width: 46, height: 46, borderRadius: 15, color: "#a24d47", background: "#fff1ee", borderColor: "#f5e1de", marginBottom: 13 }}><Trash2 size={19} /></div><h3 id="confirm-title" style={{ margin: 0, fontSize: 16, letterSpacing: "-.035em" }}>{title}</h3><p style={{ margin: "8px 0 0", fontSize: 11, color: "#849087", lineHeight: 1.55 }}>{description}</p><div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}><button className="button button-soft" onClick={onCancel} disabled={busy}>Batal</button><button className="button button-danger" onClick={onConfirm} disabled={busy}>{busy ? "Menghapus…" : confirmLabel}</button></div></section></div>;
}

export function PreviewDialog({ name, mimeType, contentUrl, onClose, onDownload, downloading = false }: { name: string; mimeType: string; contentUrl: string; onClose: () => void; onDownload: () => void; downloading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const video = mimeType.startsWith("video/");
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={`Preview ${name}`}><div className="modal-header"><h3>{name}</h3><button className="icon-button" onClick={onClose} aria-label="Tutup preview"><X size={15} /></button></div><div className="modal-media">{failed ? <div className="empty-state" style={{ minHeight: 200 }}><h3>Preview tidak tersedia</h3><p>File tidak dapat dimuat dari penyimpanan.</p></div> : video ? <video src={contentUrl} controls playsInline preload="metadata" onError={() => setFailed(true)} /> : <img src={contentUrl} alt={name} onError={() => setFailed(true)} />}</div><div className="modal-footer"><span>Preview privat · hanya untuk admin</span><button className="button button-dark button-sm" onClick={onDownload} disabled={downloading}><ArrowDownToLine size={13} />{downloading ? "Menyiapkan…" : "Unduh file"}</button></div></section></div>;
}

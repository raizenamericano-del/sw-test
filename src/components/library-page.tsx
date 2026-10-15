"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, FileVideo2, Grid2X2, Image, List, Plus, Search, Trash2, Upload, Video, Eye, RefreshCw, HardDrive, AlertTriangle } from "lucide-react";
import type { MediaRecord } from "@/lib/types";
import { formatBytes, formatDate } from "@/lib/format";
import { saveDownloadResponse } from "@/lib/client-download";
import { PageHeading, EmptyState, ConfirmDialog, PreviewDialog } from "./ui";
import { useToast } from "./toast-provider";

interface LibraryResponse { items: MediaRecord[]; total: number; maxUploadMb?: number }

export function LibraryPage() {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [fileLimit, setFileLimit] = useState(100);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("type", filter);
      const response = await fetch(`/api/library?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Media Library belum dapat dimuat.");
      setItems((payload as LibraryResponse).items);
      if ((payload as LibraryResponse).maxUploadMb) setFileLimit((payload as LibraryResponse).maxUploadMb!);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Media Library belum dapat dimuat.";
      setError(message);
      if (quiet) toast("error", "Gagal memperbarui library", message);
    } finally { setLoading(false); }
  }, [search, filter, toast]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (!cancelled && data?.preferences?.libraryView) setView(data.preferences.libraryView); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/library/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "Upload gagal.");
      toast("success", "Media tersimpan", `${payload.media?.fileName || file.name} berhasil ditambahkan ke Library.`);
      await load(true);
    } catch (cause) {
      toast("error", "Upload gagal", cause instanceof Error ? cause.message : "File tidak dapat disimpan.");
    } finally { setUploading(false); }
  }

  async function download(media: MediaRecord) {
    if (downloadingId) return;
    setDownloadingId(media.id);
    try {
      const response = await fetch(`/api/media/${media.id}/download`, { method: "POST" });
      await saveDownloadResponse(response, media.fileName);
      toast("success", "Unduhan selesai", `${media.fileName} sudah diterima browser.`);
    } catch (cause) {
      toast("error", "Unduhan gagal", cause instanceof Error ? cause.message : "Coba lagi sebentar.");
    } finally { setDownloadingId(null); }
  }

  async function deleteMedia() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/media/${deleteTarget.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "Media belum dapat dihapus.");
      toast("success", "Media dihapus", deleteTarget.fileName);
      setDeleteTarget(null);
      setPreview(null);
      await load(true);
    } catch (cause) { toast("error", "Tidak dapat menghapus", cause instanceof Error ? cause.message : "Coba lagi."); }
    finally { setDeleting(false); }
  }

  async function changeView(nextView: "grid" | "list") {
    setView(nextView);
    try {
      const current = await fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).catch(() => null);
      const prefs = current?.preferences;
      if (prefs) await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prefs, libraryView: nextView }) });
    } catch { /* view remains locally usable */ }
  }

  const visibleItems = useMemo(() => items, [items]);
  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Saved media" title="Media Library" description="Perpustakaan file privat untuk unggahan manual dan media Status yang admin simpan secara eksplisit dari event Baileys yang diterima. Tidak ada sinkronisasi otomatis." actions={<><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={uploadFile} style={{ display: "none" }} /><button className="button button-primary" onClick={() => fileInput.current?.click()} disabled={uploading}><Plus size={14} />{uploading ? "Mengunggah…" : "Tambahkan media"}</button></>} />
    <div className="callout info" style={{ marginBottom: 15 }}><HardDrive size={17} /><div><strong>Impor manual, dengan akses admin saja</strong><p>Terima foto JPG/PNG/WEBP/GIF atau video MP4/WEBM hingga {fileLimit} MB. Nama file dibersihkan; isi file diperiksa berdasarkan signature. Hindari mengunggah konten orang lain tanpa izin.</p></div></div>
    <section className="card card-pad">
      <div className="filters-row" style={{ marginTop: 0 }}>
        <div className="filter-tabs" role="tablist" aria-label="Filter media">{[{ id: "all", label: "Semua" }, { id: "image", label: "Foto" }, { id: "video", label: "Video" }].map((item) => <button key={item.id} className={`filter-tab ${filter === item.id ? "active" : ""}`} role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id as typeof filter)}>{item.label}</button>)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}><label className="search-box"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama file…" aria-label="Cari nama file" /></label><div style={{ display: "flex", gap: 4 }}><button className={`icon-button ${view === "grid" ? "active-view" : ""}`} onClick={() => void changeView("grid")} aria-label="Tampilan grid" title="Grid"><Grid2X2 size={15} /></button><button className={`icon-button ${view === "list" ? "active-view" : ""}`} onClick={() => void changeView("list")} aria-label="Tampilan list" title="List"><List size={15} /></button><button className="icon-button" onClick={() => void load(true)} aria-label="Refresh library" title="Refresh"><RefreshCw size={14} /></button></div></div>
      </div>
      {error && <div className="callout" style={{ marginBottom: 14 }}><AlertTriangle size={16} /><div><strong>Library belum dapat dimuat</strong><p>{error}</p></div></div>}
      {loading ? <div className="empty-state"><span className="spinner" /></div> : !visibleItems.length ? <EmptyState icon={filter === "video" ? <FileVideo2 size={25} /> : <Upload size={25} />} title={search ? "Tidak ada media yang cocok" : "Library masih kosong"} description={search ? "Coba kata pencarian lain atau hapus filter." : "Pilih file dari perangkat untuk mulai membangun koleksi. Tidak ada contoh atau media Status palsu."} action={!search ? <button className="button button-primary button-sm" onClick={() => fileInput.current?.click()} disabled={uploading}><Plus size={13} />Tambahkan media</button> : undefined} /> : view === "grid" ? <div className="media-grid">{visibleItems.map((media) => <article className="media-card" key={media.id}><div className="media-thumb">{media.mediaType === "video" ? <video src={`/api/media/${media.id}/content`} muted playsInline preload="metadata" /> : <img src={`/api/media/${media.id}/content`} alt={media.fileName} loading="lazy" />}<span className="media-type-tag">{media.mediaType === "video" ? <Video size={10} /> : <Image size={10} />}{media.mediaType === "video" ? "VIDEO" : "FOTO"}</span></div><div className="media-card-body"><div className="media-file-name" title={media.fileName}>{media.fileName}</div><div className="media-meta"><span>{formatBytes(media.byteSize)}</span><span>{formatDate(media.createdAt, { year: undefined, hour: undefined, minute: undefined })}</span></div><div className="media-actions"><button className="button button-soft button-sm" onClick={() => setPreview(media)}><Eye size={12} />Preview</button><button className="button button-dark button-sm" onClick={() => void download(media)} disabled={downloadingId === media.id}><ArrowDownToLine size={12} />{downloadingId === media.id ? "…" : "Unduh"}</button><button className="icon-button" onClick={() => setDeleteTarget(media)} aria-label={`Hapus ${media.fileName}`} title="Hapus"><Trash2 size={14} /></button></div></div></article>)}</div> : <div className="media-list">{visibleItems.map((media) => <article className="media-list-row" key={media.id}><div className="media-list-thumb">{media.mediaType === "video" ? <video src={`/api/media/${media.id}/content`} muted playsInline preload="metadata" /> : <img src={`/api/media/${media.id}/content`} alt="" loading="lazy" />}</div><div className="media-list-info"><strong>{media.fileName}</strong><span>{media.mediaType === "video" ? "Video" : "Foto"} · {formatBytes(media.byteSize)} · {formatDate(media.createdAt)}</span></div><div className="media-list-actions"><button className="icon-button" onClick={() => setPreview(media)} aria-label="Preview"><Eye size={14} /></button><button className="icon-button" onClick={() => void download(media)} aria-label="Unduh" disabled={downloadingId === media.id}><ArrowDownToLine size={14} /></button><button className="icon-button" onClick={() => setDeleteTarget(media)} aria-label="Hapus"><Trash2 size={14} /></button></div></article>)}</div>}
      {!!visibleItems.length && <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #eff2ee", color: "#9ba49d", fontSize: 9 }}>Menampilkan {visibleItems.length} media · maksimal 250 item terbaru per pencarian.</div>}
    </section>
    {preview && <PreviewDialog name={preview.fileName} mimeType={preview.mimeType} contentUrl={`/api/media/${preview.id}/content`} onClose={() => setPreview(null)} onDownload={() => void download(preview)} downloading={downloadingId === preview.id} />}
    {deleteTarget && <ConfirmDialog title="Hapus media?" description={`${deleteTarget.fileName} akan dihapus dari penyimpanan persisten dan Media Library. Riwayat unduhan lama tetap dicatat.`} onConfirm={() => void deleteMedia()} onCancel={() => !deleting && setDeleteTarget(null)} busy={deleting} />}
  </main>;
}

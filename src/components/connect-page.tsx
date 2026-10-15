"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CircleHelp, Clock3, Copy, Link2, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Video, X } from "lucide-react";
import { PageHeading, StatusBadge } from "./ui";
import { useToast } from "./toast-provider";
import { formatDate } from "@/lib/format";

interface SessionResponse {
  session: { state: "disconnected" | "connecting" | "connected"; connectedAt: string | null; lastConnectedAt: string | null; lastErrorCode: string | null };
  capabilities: { accountPairing: boolean; receivesStatuses: boolean; downloadsStatusMedia: boolean; persistentSessions: boolean; statusFeedExperimental: boolean; official: boolean };
  message: string;
}

export function ConnectPage() {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Status koneksi belum dapat dibaca.");
      const next = payload as SessionResponse;
      setData(next);
      if (next.session.state === "connected") setPairingCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status koneksi belum dapat dibaca.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function tryConnect() {
    const digits = phone.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) {
      toast("error", "Nomor belum valid", "Masukkan 8–15 digit termasuk kode negara, misalnya 62812….");
      return;
    }
    setBusy(true);
    setError("");
    setPairingCode("");
    try {
      const response = await fetch("/api/session/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: digits }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "Pairing code belum dapat dibuat.");
      const result = payload as { session: SessionResponse["session"]; pairingCode: string | null };
      setData((current) => current ? { ...current, session: result.session } : current);
      if (result.pairingCode) {
        setPairingCode(result.pairingCode);
        toast("success", "Pairing code diterima", "Masukkan hanya pada WhatsApp milik Anda. Jangan kirimkan kode ini ke operator.");
      } else if (result.session.state === "connected") {
        toast("success", "WhatsApp terhubung", "Backend mengonfirmasi sesi yang benar-benar terbuka.");
      } else {
        toast("info", "Koneksi sedang berjalan", "Belum ada pairing code atau koneksi terbuka. Periksa status sebentar lagi.");
      }
    } catch (cause) {
      toast("error", "Pairing tidak berhasil", cause instanceof Error ? cause.message : "Periksa koneksi server dan coba lagi.");
    } finally { setBusy(false); void refresh(); }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/session/disconnect", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "Sesi tidak dapat diperbarui.");
      setPairingCode("");
      toast("success", "Sesi diputus", "Kredensial lokal dihapus. Jika WhatsApp tidak dapat dijangkau, periksa perangkat tertaut di ponsel Anda.");
      await refresh();
    } catch (cause) { toast("error", "Tidak dapat memutus sesi", cause instanceof Error ? cause.message : "Coba lagi."); }
    finally { setBusy(false); }
  }

  async function copyPairingCode() {
    try {
      await navigator.clipboard.writeText(pairingCode);
      toast("success", "Kode disalin", "Jangan bagikan kode pairing ini kepada siapa pun.");
    } catch {
      toast("info", "Clipboard tidak tersedia", "Pilih kode pada layar dan masukkan langsung di ponsel Anda.");
    }
  }

  const state = data?.session.state ?? "disconnected";
  const connected = state === "connected";
  const caps = data?.capabilities;
  const capabilityCards = [
    { title: "Pairing code", detail: "Kode satu kali untuk pemilik akun", supported: caps?.accountPairing, icon: Link2, label: "Tersedia" },
    { title: "Menerima Status", detail: "Feed eksperimental; event masuk saja", supported: caps?.receivesStatuses, icon: Smartphone, label: "Eksperimental" },
    { title: "Unduh media Status", detail: "Hanya media yang benar-benar diterima", supported: caps?.downloadsStatusMedia, icon: Video, label: "Eksperimental" },
    { title: "Persistensi sesi", detail: "Kredensial disimpan terenkripsi AES-256-GCM", supported: caps?.persistentSessions, icon: LockKeyhole, label: "Aktif" },
  ];

  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Account" title="Koneksi WhatsApp" description="Baileys linked-device tidak resmi. Pairing code hanya ditampilkan kepada admin yang sedang masuk; sesi dinyatakan terhubung hanya setelah backend menerima event open." actions={<button className="button button-soft" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} />Periksa status</button>} />
    {error && <div className="callout" style={{ marginBottom: 14 }}><CircleHelp size={17} /><div><strong>Status sesi tidak dapat dimuat</strong><p>{error}</p></div></div>}

    <section className="card status-card">
      <div className="status-card-left"><div className="status-large-icon"><Smartphone size={23} /></div><div><div className="status-label">Kondisi akun</div><div className="status-value">{loading ? "Memeriksa…" : connected ? "Connected" : state === "connecting" ? "Connecting" : "Belum terhubung"}</div><div className="status-detail">{data?.session.lastConnectedAt ? `Koneksi terakhir ${formatDate(data.session.lastConnectedAt)}` : "Belum ada koneksi WhatsApp yang dikonfirmasi."}{data?.session.lastErrorCode ? ` · ${data.session.lastErrorCode}` : ""}</div></div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}><StatusBadge state={connected ? "good" : state === "connecting" ? "warn" : "off"} label={connected ? "Connected" : state === "connecting" ? "Connecting" : "Disconnected"} />{(connected || state === "connecting") && <button className="button button-soft" onClick={() => void disconnect()} disabled={busy || loading}><X size={14} />{state === "connecting" ? "Batalkan / putuskan" : "Putuskan"}</button>}</div>
    </section>

    <div className="callout" style={{ marginTop: 14 }}><ShieldAlert size={17} /><div><strong>Risiko dan batas integrasi tidak resmi</strong><p>{data?.message || "Baileys berkomunikasi dengan protokol WhatsApp Web, bukan API resmi Meta. Penggunaan otomatis dapat melanggar ketentuan atau menyebabkan perangkat dibatasi. Feed Status masuk belum dijamin stabil oleh upstream dan belum diuji dengan akun WhatsApp nyata dalam build ini."}</p></div></div>

    <section className="capability-grid" aria-label="Kemampuan provider">
      {capabilityCards.map((item) => { const Icon = item.icon; return <article className="card capability-card" key={item.title}><Icon size={16} /><strong>{item.title}</strong><span>{item.supported ? item.label : "Tidak tersedia"}</span></article>; })}
    </section>

    <section className="card card-pad">
      <div className="section-title-row"><div><h2 className="section-title">Hubungkan perangkat milik Anda</h2><p className="section-subtitle">Masukkan nomor akun dengan kode negara. Kode pairing dikembalikan satu kali ke browser admin dan tidak masuk log aplikasi.</p></div><ShieldCheck size={18} color="#54825b" /></div>
      <form onSubmit={(event) => { event.preventDefault(); void tryConnect(); }} style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 16 }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 240px", maxWidth: 380, color: "#758178", fontSize: 10, fontWeight: 650 }}>Nomor WhatsApp (kode negara)
          <input className="form-input" style={{ paddingLeft: 12, marginTop: 1 }} type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="62812…" aria-label="Nomor WhatsApp termasuk kode negara" disabled={busy || connected} />
        </label>
        <button className="button button-dark" style={{ alignSelf: "end", minHeight: 40 }} type="submit" disabled={busy || loading || connected || Boolean(pairingCode)}><Link2 size={14} />{busy ? "Menghubungkan…" : pairingCode ? "Menunggu pairing…" : state === "connecting" ? "Minta pairing code" : "Buat pairing code"}</button>
      </form>
      <p style={{ margin: "10px 0 0", color: "#89948b", fontSize: 10, lineHeight: 1.5 }}>Masukkan digit saja untuk proses pairing (contoh format Indonesia: 62…, tanpa tanda +). Kode tidak dibuat-buat: tombol menampilkan hanya kode yang dikembalikan Baileys.</p>
      {pairingCode && <div className="callout success" style={{ marginTop: 15 }}><Check size={17} /><div style={{ width: "100%" }}><strong>Pairing code — rahasiakan</strong><p>Di WhatsApp ponsel Anda: Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon, lalu masukkan kode ini. Jangan kirim ke operator, chat, issue GitHub, atau log.</p><div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}><code style={{ fontSize: 22, letterSpacing: ".15em", fontWeight: 800, color: "#294a33", background: "#fff", padding: "9px 14px", borderRadius: 10, border: "1px solid #dce9dc" }}>{pairingCode}</code><button className="button button-soft button-sm" type="button" onClick={() => void copyPairingCode()}><Copy size={13} />Salin kode</button></div></div></div>}
      <div className="steps-grid" style={{ marginTop: 18 }}>
        <article className="card step-card"><span className="step-number">01</span><h3>Pemilik akun saja</h3><p>Gunakan nomor akun Anda sendiri. Jangan sambungkan akun orang lain tanpa izin.</p></article>
        <article className="card step-card"><span className="step-number">02</span><h3>Masukkan kode di ponsel</h3><p>Pairing code bukan password aplikasi, OTP untuk operator, atau kode yang perlu dikirim ke pihak lain.</p></article>
        <article className="card step-card"><span className="step-number">03</span><h3>Konfirmasi status</h3><p>Dashboard berubah menjadi Connected hanya jika socket benar-benar terbuka; menampilkan kode saja tidak cukup.</p></article>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 19 }}><div style={{ color: "#89948b", fontSize: 10 }}>Satu proses aplikasi Railway disarankan untuk menjaga sesi WebSocket dan cache feed.</div><a className="button button-soft button-sm" href="https://baileys.wiki/authentication/pairing-code" target="_blank" rel="noreferrer">Dokumentasi pairing <ArrowUpRight size={13} /></a></div>
    </section>

    <section className="card card-pad" style={{ marginTop: 14 }}>
      <div className="section-title-row"><div><h2 className="section-title">Batas Status Center dan media</h2><p className="section-subtitle">Fitur yang dapat dijamin vs. yang bergantung pada protokol tidak resmi:</p></div><CircleHelp size={17} color="#819084" /></div>
      <div className="service-list">
        <div className="service-row"><div className="service-left"><Check size={15} color="#53845a" /><div className="service-label"><strong>Koneksi, autentikasi, dan enkripsi lokal</strong><span>Sesi baru dinyatakan aktif dari event socket. Kredensial auth disimpan AES-256-GCM dalam database.</span></div></div></div>
        <div className="service-row"><div className="service-left"><Clock3 size={15} color="#b9833f" /><div className="service-label"><strong>Feed Status tidak resmi dan eksperimental</strong><span>Aplikasi hanya memproses event status@broadcast yang nyata diterima; feed masuk, histori, serta persistensi Status tidak dijamin oleh upstream.</span></div></div></div>
        <div className="service-row"><div className="service-left"><X size={15} color="#b9833f" /><div className="service-label"><strong>Tidak ada bypass kontrol privasi</strong><span>Aplikasi tidak mencoba mengambil Status tersembunyi, tidak melakukan polling kontak, dan tidak memalsukan data.</span></div></div></div>
      </div>
      <div style={{ marginTop: 15 }}><Link className="button button-soft button-sm" href="/statuses">Buka Status Center <ArrowUpRight size={13} /></Link></div>
    </section>
  </main>;
}

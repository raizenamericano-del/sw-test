"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Fingerprint, Images, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => {
      if (response.ok && !cancelled) router.replace("/dashboard");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "Tidak dapat masuk. Periksa konfigurasi admin.");
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login gagal. Coba kembali.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-content">
          <div className="brand-lockup">
            <div className="brand-mark"><strong>IM</strong></div>
            <div className="brand-word"><div className="brand-name">IM STATUS</div><div className="brand-sub">HUB · PRIVATE WORKSPACE</div></div>
          </div>
          <h1>Media milikmu.<br /><span>Tetap tertata.</span></h1>
          <p>Ruang admin ringan untuk memantau koneksi resmi, mengelola media yang kamu simpan, dan melihat riwayat unduhan.</p>
          <div className="login-feature-list">
            <div className="login-feature"><span className="login-feature-icon"><ShieldCheck size={14} /></span> Admin-only access dengan sesi aman</div>
            <div className="login-feature"><span className="login-feature-icon"><Images size={14} /></span> Media Library dengan preview foto & video</div>
            <div className="login-feature"><span className="login-feature-icon"><Fingerprint size={14} /></span> Tanpa pairing palsu atau data Status buatan</div>
          </div>
        </div>
        <div className="login-footer"><Sparkles size={13} /> Dibuat untuk privasi, kejelasan, dan kontrol.</div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <div className="login-kicker">Administrator access</div>
          <h2>Masuk ke workspace</h2>
          <p>Gunakan satu akun admin yang dikonfigurasi di environment server.</p>
          <form onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="username">Username</label>
              <div className="form-input-wrap"><UserRound size={15} /><input id="username" className="form-input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" required /></div>
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="form-input-wrap"><LockKeyhole size={15} /><input id="password" className="form-input" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password admin" required /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="button button-primary login-submit" type="submit" disabled={loading}>{loading ? <span className="spinner" style={{ width: 15, height: 15, borderColor: "rgba(33,68,43,.24)", borderTopColor: "#21442b" }} /> : <>Masuk dengan aman <ArrowRight size={15} /></>}</button>
          </form>
          {process.env.NODE_ENV !== "production" && <div className="login-demo-note"><strong>Mode preview lokal</strong><br />Default: username <b>admin</b> · password <b>imhub-demo-2026</b>. Ganti lewat <code>.env.local</code> sebelum deploy.</div>}
          <div className="login-security"><ShieldCheck size={13} /> Cookie HttpOnly · SameSite Strict · admin tunggal</div>
        </div>
      </section>
    </main>
  );
}

import { useState, type FormEvent } from "react";
import { LockKeyhole, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AdminLogin() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/cx-admin-secret` },
        });
        if (error) setError(error.message);
        else if (!data.session) setSent(true);
      }
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="cx-auth-wrap">
        <div className="cx-auth-card">
          <div className="cx-auth-icon">
            <span>
              <MailCheck size={32} />
            </span>
          </div>
          <h2>Check your email</h2>
          <p>We sent a confirmation link to {email}. After confirming, an existing administrator must grant this account admin access.</p>
          <button type="button" className="cx-btn cx-btn-secondary cx-btn-block" onClick={() => { setSent(false); setMode("signin"); }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cx-auth-wrap">
      <form onSubmit={submit} className="cx-auth-card">
        <div className="cx-auth-icon">
          <span>
            <LockKeyhole size={32} />
          </span>
        </div>
        <h2>Admin Access</h2>
        <p>{mode === "signin" ? "Sign in with your administrator account." : "Create an account. Admin access must be granted separately."}</p>
        {error && <div className="cx-error" role="alert">{error}</div>}
        <div className="cx-form">
          <input className="cx-input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" />
          <input
            className="cx-input"
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
          />
          <button type="submit" className="cx-btn cx-btn-primary cx-btn-block" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Login" : "Create account"}
          </button>
        </div>
        <div className="cx-auth-switch">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => { setMode("signup"); setError(""); }}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => { setMode("signin"); setError(""); }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

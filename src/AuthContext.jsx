import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthCtx = createContext(null);

async function ensureProfile(user) {
  const { data } = await supabase.from("profiles").select("id, name, role, email").eq("id", user.id).maybeSingle();
  if (data) return data;
  const fallbackName = user.email ? user.email.split("@")[0] : "New user";
  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, name: fallbackName, role: "staff", email: user.email || "" })
    .select("id, name, role, email")
    .single();
  if (error) return { id: user.id, name: fallbackName, role: "staff", email: user.email || "" };
  return created;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setUser(session.user);
        const p = await ensureProfile(session.user);
        if (!cancelled) setProfile(p);
      }
      if (!cancelled) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const p = await ensureProfile(session.user);
        setProfile(p);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (data.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, name: name || email.split("@")[0], role: "staff", email });
    }
    return { data };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function listTeam() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, role, email, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((p) => ({ id: p.id, name: p.name, email: p.email || "", role: p.role }));
  }

  async function updateRole(userId, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) throw error;
  }

  return (
    <AuthCtx.Provider value={{ user, profile, loading, signIn, signUp, signOut, listTeam, updateRole }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [confirmNotice, setConfirmNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {
    width: "100%",
    border: "1px solid rgba(43,38,33,0.25)",
    background: "#FFFDF8",
    padding: "10px 12px",
    fontSize: "0.9rem",
    marginBottom: 12,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error } = await signUp(email, password, name);
        if (error) {
          setError(error.message);
        } else {
          setConfirmNotice(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#F6F1E4", color: "#2B2621", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
    >
      <div
        style={{
          background: "#FFFDF8",
          border: "1px solid rgba(43,38,33,0.15)",
          borderRadius: 12,
          boxShadow: "0 32px 70px rgba(43,38,33,0.2), 0 12px 24px rgba(43,38,33,0.12)",
          padding: 32,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <svg viewBox="0 0 60 40" width="30" height="20" xmlns="http://www.w3.org/2000/svg">
            <polygon points="4,36 19,9 34,36" fill="#C08A2E" opacity="0.85" />
            <polygon points="19,36 34,6 49,36" fill="#F6F1E4" opacity="0.9" stroke="#2B2621" strokeWidth="0.5" />
            <polygon points="34,36 49,13 58,36" fill="#C08A2E" opacity="0.7" />
          </svg>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h1>
        </div>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 20 }}>Three Peaks, One Great Taste — Ledger</p>

        {confirmNotice ? (
          <p style={{ fontSize: "0.85rem", background: "#F0EBDD", padding: 12, borderRadius: 6 }}>
            Check your email to confirm your account, then sign in below.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={inputStyle}
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={inputStyle}
              required
              minLength={6}
            />
            {error && <p style={{ color: "#A63D40", fontSize: "0.8rem", marginBottom: 10 }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              style={{ width: "100%", background: "#2B2621", color: "#F6F1E4", padding: "10px 0", fontSize: "0.9rem", opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {!confirmNotice && (
          <p style={{ fontSize: "0.8rem", marginTop: 16, textAlign: "center" }}>
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button onClick={() => { setMode("signup"); setError(""); }} style={{ background: "none", color: "#3A5A78", textDecoration: "underline", padding: 0 }}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => { setMode("signin"); setError(""); }} style={{ background: "none", color: "#3A5A78", textDecoration: "underline", padding: 0 }}>
                  Sign in
                </button>
              </>
            )}
          </p>
        )}

        {mode === "signup" && !confirmNotice && (
          <p style={{ fontSize: "0.72rem", marginTop: 10, color: "#2B2621", opacity: 0.55 }}>
            New accounts start as Staff. A Super Admin can upgrade your role afterward from the Team tab.
          </p>
        )}
      </div>
    </div>
  );
}

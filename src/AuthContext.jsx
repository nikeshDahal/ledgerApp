import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthCtx = createContext(null);

export function useAuth() {
  return useContext(AuthCtx);
}

async function ensureProfile(user) {
  const { data } = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle();
  if (data) return data;
  const fallbackName = user.email ? user.email.split("@")[0] : "New user";
  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, name: fallbackName, role: "staff" })
    .select("id, name, role")
    .single();
  if (error) return { id: user.id, name: fallbackName, role: "staff" };
  return created;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        setProfile(await ensureProfile(session.user));
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        setProfile(await ensureProfile(session.user));
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    if (data.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, name: name || email.split("@")[0], role: "staff" });
    }
    return { data };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthCtx.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>{children}</AuthCtx.Provider>
  );
}

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      const { error, data } = await signUp(email, password, name);
      if (error) setError(error.message);
      else if (data?.user && !data.session) setConfirmNotice(true);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F1E4", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "32px", width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.5rem", color: "#2B2621", marginBottom: 4 }}>Trikut Snacks</h1>
        <p style={{ fontSize: "0.8rem", color: "#2B2621", opacity: 0.6, marginBottom: 24 }}>
          {mode === "signin" ? "Sign in to the ledger" : "Create a staff account"}
        </p>

        {confirmNotice ? (
          <p style={{ fontSize: "0.85rem", color: "#2B2621" }}>
            Account created — check your email to confirm it, then sign in.
          </p>
        ) : (
          <form onSubmit={submit}>
            {mode === "signup" && (
              <div className="mb-3">
                <label style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, color: "#2B2621" }}>
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={fieldStyle}
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div className="mb-3">
              <label style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, color: "#2B2621" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div className="mb-4">
              <label style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, color: "#2B2621" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={fieldStyle}
                required
                minLength={6}
              />
            </div>

            {error && (
              <p style={{ fontSize: "0.78rem", color: "#A63D40", marginBottom: 12 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", background: "#2B2621", color: "#F6F1E4", padding: "10px", fontSize: "0.9rem" }}
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {!confirmNotice && (
          <p style={{ fontSize: "0.78rem", marginTop: 16, color: "#2B2621", opacity: 0.7 }}>
            {mode === "signin" ? "New staff member?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              style={{ textDecoration: "underline" }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        )}

        {mode === "signup" && !confirmNotice && (
          <p style={{ fontSize: "0.72rem", marginTop: 10, color: "#2B2621", opacity: 0.55 }}>
            New accounts start as Staff. A partner can upgrade your role afterward.
          </p>
        )}
      </div>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  border: "1px solid rgba(43,38,33,0.25)",
  background: "#fff",
  padding: "8px 10px",
  fontSize: "0.9rem",
  color: "#2B2621",
  marginTop: 4,
};

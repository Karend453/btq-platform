import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { signOut, updatePasswordFromRecovery } from "../../services/auth";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "form" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setPhase("invalid");
      return;
    }
    const fromHash =
      typeof window !== "undefined" && window.location.hash.includes("type=recovery");
    if (fromHash) setPhase("form");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPhase("form");
      }
    });

    const t = window.setTimeout(() => {
      setPhase((p) => (p === "loading" ? "invalid" : p));
    }, 8000);

    return () => {
      clearTimeout(t);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await updatePasswordFromRecovery(password);
    setLoading(false);
    if (result.success) {
      await signOut();
      navigate("/login", { replace: true });
    } else {
      setError(result.message);
    }
  };

  if (phase === "loading") {
    return (
      <div style={{ padding: 40 }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ marginBottom: 8 }}>Link invalid or expired</h2>
        <p style={{ marginBottom: 16, fontSize: 14, color: "#444" }}>
          Request a new reset link or try signing in.
        </p>
        <p style={{ fontSize: 14 }}>
          <Link to="/forgot-password">Forgot password</Link>
          {" · "}
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h2 style={{ marginBottom: 8 }}>Choose a new password</h2>
      <form onSubmit={handleSubmit}>
        {error && <p style={{ color: "red", marginBottom: 12 }}>{error}</p>}
        <input
          placeholder="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <br />
        <br />
        <input
          placeholder="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <br />
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
      <p style={{ marginTop: 24, fontSize: 14 }}>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

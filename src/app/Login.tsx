import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUserProfileRoleKey, signIn } from "../services/auth";
import { useAuth } from "./contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      const key = await getUserProfileRoleKey();
      if (cancelled) return;
      navigate(key === "btq_admin" ? "/back-office/org" : "/", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.success) {
      const key = await getUserProfileRoleKey();
      window.location.href = key === "btq_admin" ? "/back-office/org" : "/";
    } else {
      setError(result.message);
    }
  };

  if (authLoading) {
    return <div style={{ padding: 40 }}>Loading…</div>;
  }
  if (user) {
    return null;
  }

  return (
    <div style={{ padding: 40 }}>
      <form onSubmit={handleLogin}>
        <h2>BTQ Login</h2>
        {error && <p style={{ color: "red", marginBottom: 12 }}>{error}</p>}

        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <br />
        <br />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <br />
        <br />

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
      <div
        style={{
          marginTop: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <Link
          to="/forgot-password"
          style={{ color: "#64748b", textDecoration: "none" }}
        >
          Forgot password?
        </Link>
        <Link to="/pricing" style={{ color: "#64748b", textDecoration: "none" }}>
          Need an account? View plans
        </Link>
      </div>
    </div>
  );
}

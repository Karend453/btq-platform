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
      // TEMP DEBUG — remove after diagnosing profile role / RLS
      console.log("LOGIN role key", key);
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
      // TEMP DEBUG — remove after diagnosing profile role / RLS
      console.log("LOGIN role key", key);
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
    <div>
      <form onSubmit={handleLogin} style={{ padding: 40 }}>
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

      <div style={{ marginTop: 24, padding: "0 40px 40px" }}>
        <p style={{ fontWeight: 600 }}>New broker signup</p>
        <p style={{ marginTop: 8, maxWidth: 420, fontSize: 14, color: "#444" }}>
          Plan buttons go to the intake questionnaire first; Stripe Checkout runs only after you create
          your workspace.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link
            to="/signup?plan=core"
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}
          >
            Core
          </Link>
          <Link
            to="/signup?plan=growth"
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}
          >
            Growth
          </Link>
          <Link
            to="/signup?plan=pro"
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}
          >
            Pro
          </Link>
          <Link
            to="/pricing"
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}
          >
            All plans
          </Link>
        </div>
      </div>
    </div>
  );
}

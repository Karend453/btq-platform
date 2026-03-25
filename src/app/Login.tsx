import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "../services/auth";
import { useAuth } from "./contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.success) {
      window.location.href = "/";
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
        {loading ? "Signing in…" : "Login"}
      </button>
    </form>
  );
}
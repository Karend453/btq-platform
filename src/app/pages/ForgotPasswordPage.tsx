import React, { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../services/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.success) {
      setSent(true);
    } else {
      setError(result.message);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2 style={{ marginBottom: 8 }}>Reset password</h2>
      <p style={{ marginBottom: 16, maxWidth: 420, fontSize: 14, color: "#444" }}>
        Enter your account email. If it exists, we will send a link to choose a new password.
      </p>
      {sent ? (
        <p style={{ color: "#166534" }}>Check your email for a reset link.</p>
      ) : (
        <form onSubmit={handleSubmit}>
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
          <button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p style={{ marginTop: 24, fontSize: 14 }}>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

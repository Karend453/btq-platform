import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserProfileRoleKey, signIn, signOut } from "../../../services/auth";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Internal BTQ Back Office sign-in (same Supabase auth as `/login`).
 */
export function BackOfficeLogin() {
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
      if (key === "btq_admin") {
        navigate("/back-office/org", { replace: true });
        return;
      }
      await signOut();
      if (!cancelled) {
        setError("You are not authorized for BTQ Back Office.");
      }
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
      if (key === "btq_admin") {
        navigate("/back-office/org", { replace: true });
      } else {
        await signOut();
        setError("You are not authorized for BTQ Back Office.");
      }
    } else {
      setError(result.message);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-slate-600">
        Loading…
      </div>
    );
  }
  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">BTQ Back Office</h1>
        <p className="mt-1 text-sm text-slate-500">Internal sign-in</p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <label className="mt-6 block text-sm font-medium text-slate-700">
          Email
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

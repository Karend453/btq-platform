import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseInitError, supabaseConfig } from "../../lib/supabaseClient";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(supabaseInitError);

  useEffect(() => {
    if (!supabase) {
      setError(
        supabaseInitError ??
          `Supabase client unavailable (urlPresent=${supabaseConfig.urlPresent}, keyPresent=${supabaseConfig.keyPresent})`
      );
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          throw error;
        }
        if (isMounted) {
          setUser(data.user ?? null);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Auth load failed");
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {error ? (
        <div style={{ padding: 16, fontFamily: "sans-serif" }}>
          <h2>Auth Init Error</h2>
          <div>{error}</div>
          <div style={{ marginTop: 8 }}>
            urlPresent: {String(supabaseConfig.urlPresent)} | keyPresent: {String(supabaseConfig.keyPresent)}
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { display_name?: string } | undefined;
  if (meta?.display_name) return meta.display_name;
  if (user.email) {
    const beforeAt = user.email.split("@")[0];
    if (beforeAt) return beforeAt;
  }
  return user.email ?? "User";
}
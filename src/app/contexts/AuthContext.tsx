import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseInitError } from "../../lib/supabaseClient";
import { activatePendingOfficeMembershipsForSession } from "../../services/officeRoster";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(supabaseInitError);

  useEffect(() => {
    if (!supabase) {
      setError(supabaseInitError ?? "Supabase client unavailable");
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("getSession error:", error);
        }

        if (!isMounted) return;

        setUser(data.session?.user ?? null);
        setError(null);
      } catch (err) {
        console.error("AuthProvider loadSession crashed:", err);

        if (!isMounted) return;

        setUser(null);
        setError(null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setError(null);
      setLoading(false);
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void activatePendingOfficeMembershipsForSession();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
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
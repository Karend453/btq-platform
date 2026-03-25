import React, { createContext, useContext, type ReactNode } from "react";
import type { UserProfileSnapshot } from "../../../services/auth";

type SettingsProfileValue = { profile: UserProfileSnapshot | null };

const SettingsProfileContext = createContext<SettingsProfileValue | undefined>(undefined);

export function SettingsProfileProvider({
  profile,
  children,
}: {
  profile: UserProfileSnapshot | null;
  children: ReactNode;
}) {
  return (
    <SettingsProfileContext.Provider value={{ profile }}>{children}</SettingsProfileContext.Provider>
  );
}

export function useSettingsProfile(): SettingsProfileValue {
  const ctx = useContext(SettingsProfileContext);
  if (ctx === undefined) {
    throw new Error("useSettingsProfile must be used within SettingsProfileProvider");
  }
  return ctx;
}

/** Same row as `/settings` when wrapped; `undefined` on routes without the provider (e.g. checklist templates page). */
export function useOptionalSettingsProfile(): SettingsProfileValue | undefined {
  return useContext(SettingsProfileContext);
}

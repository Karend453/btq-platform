import { supabase } from "../lib/supabaseClient";

export async function getWorkspaceSettings() {
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("Error loading workspace settings:", error);
    throw error;
  }

  return data;
}
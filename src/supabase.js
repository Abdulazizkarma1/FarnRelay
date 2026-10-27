import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client;
export function getSupabase() {
  if (!url || !key)
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key in Netlify, then rebuild.",
    );
  return (client ||= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  }));
}
export function subscribeToWorkspace(onChange) {
  const db = getSupabase();
  const channel = db
    .channel("workspace-" + crypto.randomUUID())
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reports" },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      onChange,
    )
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}

// Public Supabase project settings. The anon key is designed to be exposed
// in client-side code (it's restricted by the RLS policies in
// supabase/schema.sql) — it is not a secret.
window.CARETAKER_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
};

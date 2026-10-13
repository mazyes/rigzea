// Supabase client configuration. The anon key is public by design; access is enforced by RLS.
window.RIGZEA_CONFIG = {
  SUPABASE_URL: 'https://cuioodytwyzykqlrjfej.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1aW9vZHl0d3l6eWtxbHJqZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjgzMzUsImV4cCI6MjEwNzMwNDMzNX0.IdGlwbbt0_oNwnUj0pUcCjuCVcUV3l19HSa1NIckUyk',
  APP_URL: window.location.origin
};

// A password-reset link carries its type in the address. The auth client removes it while it starts,
// which is before the app script runs, so it is remembered here first.
window.RIGZEA_RECOVERY = /[#&?]type=recovery/.test(window.location.hash + window.location.search);

// Initialize Supabase client
window.supabaseClient = supabase.createClient(
  window.RIGZEA_CONFIG.SUPABASE_URL,
  window.RIGZEA_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
window.supabaseClient.auth.onAuthStateChange(function (event) {
  if (event === 'PASSWORD_RECOVERY') window.RIGZEA_RECOVERY = true;
});

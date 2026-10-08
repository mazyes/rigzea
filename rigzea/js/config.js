// Supabase client configuration. The anon key is public by design; access is enforced by RLS.
window.RIGZEA_CONFIG = {
  SUPABASE_URL: 'https://pwasuamrqxyhhyqxfrjz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YXN1YW1ycXh5aGh5cXhmcmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTk0NjgsImV4cCI6MjEwNjE5NTQ2OH0.f17SPN36R4k2uoUYgs1zWeiMVmMpcinaBkrBMFK8FC0',
  APP_URL: window.location.origin
};

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

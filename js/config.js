// =============================================
// BCW SUIVI — Configuration
// =============================================

const BCW_CONFIG = {
  SUPABASE_URL: 'https://tfpctoufuokxridfkadc.supabase.co',
  SUPABASE_KEY: 'sb_publishable_zWQKWfqbAXqGqn2PZOm8CQ_UPbI0_z8',
};

const supabase = window.supabase.createClient(
  BCW_CONFIG.SUPABASE_URL,
  BCW_CONFIG.SUPABASE_KEY
);

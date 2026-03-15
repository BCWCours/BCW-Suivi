// =============================================
// BCW SUIVI — Configuration
// =============================================

const BCW_CONFIG = {
  SUPABASE_URL: 'https://kiwuncwivajenqyinrqb.supabase.co',
  SUPABASE_KEY: 'sb_publishable_sxowccgePeTvJjwF68CIhQ_KMqiYTTw',
};

const supabase = window.supabase.createClient(
  BCW_CONFIG.SUPABASE_URL,
  BCW_CONFIG.SUPABASE_KEY
);

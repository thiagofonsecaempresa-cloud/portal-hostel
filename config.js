// Dados do projeto Supabase "portal-hostel".
// A chave publishable (sb_publishable_...) PODE ficar aqui: é pública por desenho e quem
// protege os dados são as regras (RLS) do schema.sql.
// NUNCA coloque aqui a chave "secret" (sb_secret_...) nem a "service_role".
window.PORTAL_CONFIG = {
  SUPABASE_URL: 'https://uxfamjtfcndxdhqjquqv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_BUpvEsloLD0Bhz7-6GutKQ_r4bPgR1j',
  // true = mostra "Criar conta" na entrada. Depois que todos se cadastrarem, mude para false
  // (e desligue "Allow new users to sign up" no Supabase, que é o que realmente fecha o cadastro).
  ALLOW_SIGNUP: true,
  // true = o ADMIN vê "Importar backup" e "Apagar tudo" dentro dos módulos (use só na primeira carga
  // dos dados). Depois da importação, troque para false: os botões somem para todo mundo.
  ALLOW_IMPORT: true
};

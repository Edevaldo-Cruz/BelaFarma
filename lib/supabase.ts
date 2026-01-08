
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ID do projeto extraído da sua imagem
const PROJECT_ID = 'shfdjkaosykgaikfazgl';
const DEFAULT_URL = `https://${PROJECT_ID}.supabase.co`;

const getEnv = (name: string): string => {
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv[name]) return metaEnv[name];
  
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return process.env[name] as string;
    }
  } catch (e) {}
  
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL') || DEFAULT_URL;
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY') || process.env.SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  const hasUrl = typeof supabaseUrl === 'string' && supabaseUrl.length > 10;
  const hasKey = typeof supabaseAnonKey === 'string' && supabaseAnonKey.length > 20;
  return hasUrl && hasKey;
};

if (!isSupabaseConfigured()) {
  console.warn('⚠️ Supabase ainda sem KEY. Adicione a VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.');
} else {
  console.log(`✅ Conectado ao projeto Supabase: ${PROJECT_ID}`);
}

export const supabase = isSupabaseConfigured() 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

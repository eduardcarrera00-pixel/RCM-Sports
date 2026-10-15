import {createClient} from '@supabase/supabase-js';
import {makeHandler} from './handler.mjs';
Deno.serve(makeHandler({url:Deno.env.get('SUPABASE_URL')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,createClient}));

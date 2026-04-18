import { supabase } from '../supabaseClient';

async function debug() {
  console.log("--- DEBUG START ---");
  const { data: orgUsers, error } = await supabase.rpc('get_usuarios_org');
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC Sample Row:", orgUsers[0]);
    console.log("Keys in row:", Object.keys(orgUsers[0] || {}));
  }
  console.log("--- DEBUG END ---");
}

debug();

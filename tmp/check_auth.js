const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qvidbkkrxiwcvletaqfp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWRia2tyeGl3Y3ZsZXRhcWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjM1MjUsImV4cCI6MjA4MDY5OTUyNX0.GoLdf7fcyoTtl7-idGKY3aWkL7h3P7xs-1Qk7Lrgs7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAuth() {
  console.log('--- Checking Usuarios Table ---');
  const { data: users, error: uErr } = await supabase
    .from('usuarios')
    .select('id, id_persona, rol, personas(nombre, apellido)')
    .limit(10);

  if (uErr) {
    console.error('Error fetching users:', uErr);
  } else {
    console.log('Users found:', JSON.stringify(users, null, 2));
  }
}

checkAuth();

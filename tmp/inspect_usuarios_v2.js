const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qvidbkkrxiwcvletaqfp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWRia2tyeGl3Y3ZsZXRhcWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjM1MjUsImV4cCI6MjA4MDY5OTUyNX0.GoLdf7fcyoTtl7-idGKY3aWkL7h3P7xs-1Qk7Lrgs7A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable() {
  console.log('--- Inspecting Usuarios Table ---');
  // Use a query that shouldn't fail even if 'rol' is missing
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else if (!data || data.length === 0) {
    console.log('No users found in table.');
  } else {
    console.log('Sample row:', JSON.stringify(data[0], null, 2));
    console.log('Columns in table:', Object.keys(data[0]));
  }
}

inspectTable();

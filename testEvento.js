const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
  console.log("Checking environment...");
  const envContent = fs.readFileSync('.env', 'utf-8');
  let url = '';
  let key = '';
  envContent.split('\n').forEach(line => {
    if (line.startsWith('REACT_APP_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('REACT_APP_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  });
  
  const supabase = createClient(url, key);
  
  // Test 1: Just get row count
  const { data: countData, error: countErr } = await supabase.from('evento').select('id_evento').limit(1);
  console.log("Basic fetch:", countData, countErr);
  
  // Test 2: The complex query
  const { data, error } = await supabase
    .from('evento')
    .select('id_evento, fecha_hora, descripcion, tipo_evento:id_tipo(nombre), persona:id_persona(nombre, apellido), plaza:id_plaza(numero_plaza)')
    .order('fecha_hora', { ascending: false })
    .limit(3);
    
  console.log("Complex fetch:", data);
  if (error) console.error("Error:", error);
}

test();

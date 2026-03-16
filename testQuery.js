import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qvidbkkrxiwcvletaqfp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWRia2tyeGl3Y3ZsZXRhcWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjM1MjUsImV4cCI6MjA4MDY5OTUyNX0.GoLdf7fcyoTtl7-idGKY3aWkL7h3P7xs-1Qk7Lrgs7A';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('registros_acceso')
    .select('*, vehiculos(placa, Marca, modelo, Color, personas(nombre, apellido)), plazas(Numero_Plaza)')
    .is('salida_at', null)
    .in('tipo_evento', ['ENTRADA_MANUAL', 'ENTRADA_AUTO'])
    .order('entrada_at', { ascending: false });
    
  console.log("Error:", error);
  console.log("Data length:", data ? data.length : null);
}

test();

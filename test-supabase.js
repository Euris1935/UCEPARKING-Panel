require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('roles_permisos')
    .select(`
      id_rol,
      permisos (
        accion,
        id_modulo,
        modulos (
          nombre,
          slug,
          activo
        )
      )
    `);

  if (error) {
    console.error("Error fetching rules:", error);
    return;
  }

  // Filter so we only see data from roles other than Administrador (assuming Administrador is role 1, but we can just print everything)
  console.log(JSON.stringify(data.slice(0, 10), null, 2));
}

test();

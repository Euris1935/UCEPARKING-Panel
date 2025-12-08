
/*
import BarraLateral from "../componentes/barraLateral";

export default function Usuarios() {
  return (
    <div style={{ display: "flex" }}>
      <BarraLateral />

      <div style={{ flex: 1, padding: "30px" }}>
        <h1>Gestión de Usuarios</h1>
        <p>Aquí irá el CRUD de usuarios</p>
      </div>
    </div>
  );
}
  */

/*
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])

  useEffect(() => {
    loadUsuarios()
  }, [])

  const loadUsuarios = async () => {
    const { data } = await supabase.from('USUARIO').select('*')
    setUsuarios(data || [])
  }

  return (
    <Layout>
      <h1>Usuarios</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Teléfono</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.Id_Usuario}>
              <td>{u.Nombre} {u.Apellido}</td>
              <td>{u.Email}</td>
              <td>{u.Telefono}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

*/

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])

  useEffect(() => {
    loadUsuarios()
  }, [])

  const loadUsuarios = async () => {
    const { data } = await supabase.from('USUARIO').select('*')
    setUsuarios(data || [])
  }

  return (
    <Layout>
      <h1 style={styles.title}>Usuarios</h1>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nombre</th>
              <th style={styles.th}>Correo</th>
              <th style={styles.th}>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.Id_Usuario} style={styles.tr}>
                <td style={styles.td}>{u.Nombre} {u.Apellido}</td>
                <td style={styles.td}>{u.Email}</td>
                <td style={styles.td}>{u.Telefono}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}

const styles = {
  title: {
    marginBottom: '20px',
    fontSize: '26px',
    fontWeight: '600'
  },
  card: {
    background: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 10px 20px rgba(0,0,0,0.03)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    fontSize: '14px',
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb'
  },
  tr: {
    borderBottom: '1px solid #f3f4f6'
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#374151'
  }
}


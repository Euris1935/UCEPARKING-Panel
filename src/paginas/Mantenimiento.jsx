import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Mantenimiento() {
  const [mantenimientos, setMantenimientos] = useState([])

  useEffect(() => {
    loadMantenimientos()
  }, [])

  const loadMantenimientos = async () => {
    const { data } = await supabase.from('MANTENIMIENTO').select('*')
    setMantenimientos(data || [])
  }

  return (
    <Layout>
      <h1>Mantenimiento</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Fecha Inicio</th>
            <th>Descripción</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {mantenimientos.map(m => (
            <tr key={m.Id_Mantenimiento}>
              <td>{new Date(m.Fecha_Inicio).toLocaleString()}</td>
              <td>{m.Descripcion_Problema}</td>
              <td>{m.Estado_Mantenimiento}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Reportes() {
  const [reportes, setReportes] = useState([])

  useEffect(() => {
    loadReportes()
  }, [])

  const loadReportes = async () => {
    const { data } = await supabase.from('REPORTE').select('*')
    setReportes(data || [])
  }

  return (
    <Layout>
      <h1>Reportes</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Ruta</th>
          </tr>
        </thead>
        <tbody>
          {reportes.map(r => (
            <tr key={r.Id_Reporte}>
              <td>{new Date(r.Fecha_Creacion).toLocaleString()}</td>
              <td>{r.Tipo_Reporte}</td>
              <td>{r.Datos_Adjuntos_Ruta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

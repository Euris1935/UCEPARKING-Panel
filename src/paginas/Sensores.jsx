import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Sensores() {
  const [sensores, setSensores] = useState([])

  useEffect(() => {
    loadSensores()
  }, [])

  const loadSensores = async () => {
    const { data } = await supabase.from('SENSOR').select('*')
    setSensores(data || [])
  }

  return (
    <Layout>
      <h1>Sensores</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>ID</th>
            <th>Modelo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {sensores.map(s => (
            <tr key={s.Id_Sensor}>
              <td>{s.Id_Sensor}</td>
              <td>{s.Id_Modelo}</td>
              <td>{s.Estado_Operativo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

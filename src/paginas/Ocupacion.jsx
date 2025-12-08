/*
import BarraLateral from "../componentes/barraLateral";

export default function Ocupacion() {
  return (
    <div style={{ display: "flex" }}>
      <BarraLateral />

      <div style={{ flex: 1, padding: "30px" }}>
        <h1>Vista de Ocupación</h1>
        <p>Aquí irá la vista de ocupación del parqueo</p>
      </div>
    </div>
  );
}

*/

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Ocupacion() {
  const [plazas, setPlazas] = useState([])

  useEffect(() => {
    loadPlazas()
  }, [])

  const loadPlazas = async () => {
    const { data } = await supabase.from('PLAZA').select('*')
    setPlazas(data || [])
  }

  return (
    <Layout>
      <h1>Ocupación de Plazas</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Plaza</th>
            <th>Estado</th>
            <th>Zona</th>
          </tr>
        </thead>
        <tbody>
          {plazas.map(p => (
            <tr key={p.Id_Plaza}>
              <td>{p.Numero_Plaza}</td>
              <td>{p.Estado_Actual}</td>
              <td>{p.Id_Zona}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

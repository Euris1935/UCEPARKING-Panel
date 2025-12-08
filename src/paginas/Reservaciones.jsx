/*
import BarraLateral from "../componentes/barraLateral";

export default function Reservaciones() {
  return (
    <div style={{ display: "flex" }}>
      <BarraLateral />

      <div style={{ flex: 1, padding: "30px" }}>
        <h1>Gestión de Reservaciones</h1>
        <p>Aquí irá el CRUD de reservaciones</p>
      </div>
    </div>
  );
}

*/

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Reservaciones() {
  const [reservas, setReservas] = useState([])

  useEffect(() => {
    loadReservas()
  }, [])

  const loadReservas = async () => {
    const { data } = await supabase
      .from('RESERVA')
      .select('*, USUARIO(Nombre, Apellido), PLAZA(Numero_Plaza)')

    setReservas(data || [])
  }

  return (
    <Layout>
      <h1>Reservaciones</h1>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Plaza</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {reservas.map(r => (
            <tr key={r.Id_Reserva}>
              <td>{r.USUARIO?.Nombre} {r.USUARIO?.Apellido}</td>
              <td>{r.PLAZA?.Numero_Plaza}</td>
              <td>{r.Estado_Reserva}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}


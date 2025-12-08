/*

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import BarraLateral from '../componentes/barraLateral'


export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0,
    plazasOcupadas: 0,
    reservasActivas: 0,
    sensoresFallo: 0
  })

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    // Total plazas
    const { count: totalPlazas } = await supabase
      .from('PLAZA')
      .select('*', { count: 'exact', head: true })

    // Plazas ocupadas
    const { count: plazasOcupadas } = await supabase
      .from('PLAZA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Actual', 'Ocupado')

    // Reservas activas
    const { count: reservasActivas } = await supabase
      .from('RESERVA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Reserva', 'Activa')

    // Sensores con fallo
    const { count: sensoresFallo } = await supabase
      .from('SENSOR')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Operativo', 'Fallo')

    setStats({
      totalPlazas: totalPlazas || 0,
      plazasOcupadas: plazasOcupadas || 0,
      reservasActivas: reservasActivas || 0,
      sensoresFallo: sensoresFallo || 0
    })
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard</h1>

      <div style={{ display: 'flex', gap: '20px' }}>
        <Card title="Total de Plazas" value={stats.totalPlazas} />
        <Card title="Plazas Ocupadas" value={stats.plazasOcupadas} />
        <Card title="Reservas Activas" value={stats.reservasActivas} />
        <Card title="Sensores con Fallo" value={stats.sensoresFallo} />
      </div>
    </div>
  )
}

function Card({ title, value }) {
  return (
    <div style={{
      background: '#f4f4f4',
      padding: '20px',
      borderRadius: '12px',
      minWidth: '180px',
      textAlign: 'center'
    }}>
      <h3>{title}</h3>
      <h1>{value}</h1>
    </div>
  )
}

*/
/*

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import BarraLateral from '../componentes/barraLateral'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0,
    plazasOcupadas: 0,
    reservasActivas: 0,
    sensoresFallo: 0
  })

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { count: totalPlazas } = await supabase
      .from('PLAZA')
      .select('*', { count: 'exact', head: true })

    const { count: plazasOcupadas } = await supabase
      .from('PLAZA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Actual', 'Ocupado')

    const { count: reservasActivas } = await supabase
      .from('RESERVA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Reserva', 'Activa')

    const { count: sensoresFallo } = await supabase
      .from('SENSOR')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Operativo', 'Fallo')

    setStats({
      totalPlazas: totalPlazas || 0,
      plazasOcupadas: plazasOcupadas || 0,
      reservasActivas: reservasActivas || 0,
      sensoresFallo: sensoresFallo || 0
    })
  }

  return (
    <div style={{ display: 'flex' }}>
      
      <BarraLateral />

      
      <div style={{ flex: 1, padding: '20px' }}>
        <h1>Dashboard</h1>

        <div style={{ display: 'flex', gap: '20px' }}>
          <Card title="Total de Plazas" value={stats.totalPlazas} />
          <Card title="Plazas Ocupadas" value={stats.plazasOcupadas} />
          <Card title="Reservas Activas" value={stats.reservasActivas} />
          <Card title="Sensores con Fallo" value={stats.sensoresFallo} />
        </div>
      </div>
    </div>
  )
}

function Card({ title, value }) {
  return (
    <div style={{
      background: '#f4f4f4',
      padding: '20px',
      borderRadius: '12px',
      minWidth: '180px',
      textAlign: 'center'
    }}>
      <h3>{title}</h3>
      <h1>{value}</h1>
    </div>
  )
}

*/



import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0,
    plazasOcupadas: 0,
    reservasActivas: 0,
    sensoresFallo: 0
  })

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { count: totalPlazas } = await supabase.from('PLAZA').select('*', { count: 'exact', head: true })

    const { count: plazasOcupadas } = await supabase
      .from('PLAZA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Actual', 'Ocupado')

    const { count: reservasActivas } = await supabase
      .from('RESERVA')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Reserva', 'Activa')

    const { count: sensoresFallo } = await supabase
      .from('SENSOR')
      .select('*', { count: 'exact', head: true })
      .eq('Estado_Operativo', 'Fallo')

    setStats({
      totalPlazas: totalPlazas || 0,
      plazasOcupadas: plazasOcupadas || 0,
      reservasActivas: reservasActivas || 0,
      sensoresFallo: sensoresFallo || 0
    })
  }

  return (
    <Layout>
      <h1>Dashboard</h1>

      <div style={{ display: 'flex', gap: '20px' }}>
        <Card title="Total de Plazas" value={stats.totalPlazas} />
        <Card title="Plazas Ocupadas" value={stats.plazasOcupadas} />
        <Card title="Reservas Activas" value={stats.reservasActivas} />
        <Card title="Sensores con Fallo" value={stats.sensoresFallo} />
      </div>
    </Layout>
  )
}

function Card({ title, value }) {
  return (
    <div style={{
      background: '#f4f4f4',
      padding: '20px',
      borderRadius: '12px',
      minWidth: '180px',
      textAlign: 'center'
    }}>
      <h3>{title}</h3>
      <h1>{value}</h1>
    </div>
  )
}





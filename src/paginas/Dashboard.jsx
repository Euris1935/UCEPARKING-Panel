

/*

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'
import { FaCar, FaClipboardList, FaExclamationTriangle, FaSignInAlt, FaSignOutAlt, FaTimesCircle, FaCalendarAlt } from 'react-icons/fa'

// Componente de Tarjeta
function Card({ title, value, icon: Icon, colorClass, detail }) {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 flex items-center justify-between shadow-sm">
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className={`text-sm ${colorClass}`}>{detail}</p>
      </div>
      <div className={`p-3 rounded-full ${colorClass.replace('text', 'bg').replace('-700', '-100')}`}>
        <Icon className={`text-3xl ${colorClass}`} />
      </div>
    </div>
  )
}

// Componente de Evento Reciente
function RecentEvent({ icon: Icon, iconBg, iconColor, title, time }) {
  return (
    <li className="flex items-start gap-3">
      <div className={`p-2 rounded-full ${iconBg} ${iconColor}`}>
        <Icon className="text-xl" />
      </div>
      <div>
        <p className="font-medium text-gray-800">{title}</p>
        <p className="text-sm text-gray-500">{time}</p>
      </div>
    </li>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0,
    plazasOcupadas: 0,
    reservasActivas: 0,
    sensoresFallo: 0
  })

  const [usuarioEmail, setUsuarioEmail] = useState('Cargando...')

  useEffect(() => {
    loadStats()
    loadUserEmail()
  }, [])

  const loadStats = async () => {
    const { count: totalPlazas } = await supabase.from('PLAZA').select('*', { count: 'exact', head: true })
    const { count: plazasOcupadas } = await supabase.from('PLAZA').select('*', { count: 'exact', head: true }).eq('Estado_Actual', 'Ocupado')
    const { count: reservasActivas } = await supabase.from('RESERVA').select('*', { count: 'exact', head: true }).eq('Estado_Reserva', 'Activa')
    const { count: sensoresFallo } = await supabase.from('SENSOR').select('*', { count: 'exact', head: true }).eq('Estado_Operativo', 'Fallo')

    setStats({
      totalPlazas: totalPlazas || 0,
      plazasOcupadas: plazasOcupadas || 0,
      reservasActivas: reservasActivas || 0,
      sensoresFallo: sensoresFallo || 0
    })
  }

  const loadUserEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email) {
      setUsuarioEmail(user.email)
    } else {
      setUsuarioEmail('Usuario Invitado')
    }
  }

  const porcentajeOcupacion = `${Math.round((stats.plazasOcupadas / stats.totalPlazas) * 100) || 0}% Ocupación`

  return (
    <Layout>
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Vista General del Dashboard</h2>
          <p className="text-gray-500">Bienvenido al sistema.</p>
        </div>
        
        
        <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
          <div className="text-right hidden sm:block">
            <span className="block text-sm font-bold text-gray-800">{usuarioEmail}</span>
            <span className="block text-xs text-green-600 font-semibold">● En línea</span>
          </div>
          <img 
            alt="User avatar" 
            className="w-10 h-10 rounded-full object-cover bg-gray-200 border border-gray-300" 
            src={`https://ui-avatars.com/api/?name=${usuarioEmail}&background=2eb17b&color=fff`} 
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card title="Ocupación Total" value={`${stats.plazasOcupadas} / ${stats.totalPlazas}`} icon={FaCar} colorClass="text-blue-700" detail={porcentajeOcupacion} />
        <Card title="Reservas Activas" value={stats.reservasActivas} icon={FaClipboardList} colorClass="text-green-600" detail="En curso ahora" />
        <Card title="Alertas de Sensor" value={stats.sensoresFallo} icon={FaExclamationTriangle} colorClass="text-red-600" detail="Acción requerida" />
        <Card title="Ingresos Hoy (Est.)" value="RD$ 0" icon={FaCalendarAlt} colorClass="text-purple-600" detail="Cierre pendiente" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Tasa de Ocupación por Hora</h3>
          <div className="h-80 flex items-center justify-center bg-gray-800 rounded-lg">
            <p className="text-white opacity-70">Gráfico de Ocupación (Componente Visual)</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Eventos Recientes</h3>
          <ul className="space-y-4">
            <RecentEvent icon={FaSignInAlt} iconBg="bg-green-100" iconColor="text-green-600" title="Entrada: ABC-123" time="Hace 2 min" />
            <RecentEvent icon={FaSignOutAlt} iconBg="bg-red-100" iconColor="text-red-600" title="Salida: XYZ-789" time="Hace 5 min" />
            <RecentEvent icon={FaTimesCircle} iconBg="bg-yellow-100" iconColor="text-yellow-600" title="Sensor Desconectado: S-1138" time="Hace 8 min" />
            <RecentEvent icon={FaCalendarAlt} iconBg="bg-blue-100" iconColor="text-blue-700" title="Nueva Reserva: #54321" time="Hace 15 min" />
          </ul>
        </div>
      </div>
    </Layout>
  )
}

*/

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; // Asegúrate de que la ruta sea correcta
import Layout from '../componentes/Layout';
import { FaCar, FaticketAlt, FaExclamationTriangle, FaChartPie, FaParking } from 'react-icons/fa';

export default function Dashboard() {
  // Estado para almacenar las estadísticas
  const [stats, setStats] = useState({
    totalPlazas: 9, // Valor por defecto (tus 3 zonas x 3 plazas)
    ocupadas: 0,
    reservadas: 0,
    libres: 0,
    reservasActivas: 0,
    mantenimiento: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // --- SUSCRIPCIÓN EN TIEMPO REAL ---
    // Esto hace que si cambias una plaza en "Ocupación", el Dashboard se actualice solo.
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'PLAZA' }, () => {
        loadDashboardData(); // Recargar datos si algo cambia en PLAZA
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'RESERVA' }, () => {
        loadDashboardData(); // Recargar datos si algo cambia en RESERVA
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Obtener estado de las PLAZAS
      const { data: plazas, error: errorPlazas } = await supabase
        .from('PLAZA')
        .select('Estado_Actual');

      if (errorPlazas) throw errorPlazas;

      // 2. Obtener conteo de RESERVAS activas
      const { count: reservasCount, error: errorReservas } = await supabase
        .from('RESERVA')
        .select('*', { count: 'exact', head: true })
        .eq('Estado_Reserva', 'Activa');

      if (errorReservas) throw errorReservas;

      // 3. Calcular estadísticas
      const total = plazas.length;
      const ocupadas = plazas.filter(p => p.Estado_Actual === 'Ocupado').length;
      const reservadas = plazas.filter(p => p.Estado_Actual === 'Reservada').length;
      const mantenimiento = plazas.filter(p => p.Estado_Actual === 'Mantenimiento').length;
      const libres = plazas.filter(p => p.Estado_Actual === 'Libre').length;

      setStats({
        totalPlazas: total,
        ocupadas,
        reservadas,
        libres,
        mantenimiento,
        reservasActivas: reservasCount || 0
      });

    } catch (error) {
      console.error("Error cargando dashboard:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo de Porcentaje de Ocupación (Ocupadas + Reservadas)
  const ocupacionPorcentaje = stats.totalPlazas > 0 
    ? Math.round(((stats.ocupadas + stats.reservadas) / stats.totalPlazas) * 100) 
    : 0;

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Vista General</h2>
        <p className="text-gray-500">Resumen de actividad en tiempo real.</p>
      </header>

      {/* TARJETAS SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* TARJETA 1: OCUPACIÓN ACTUAL */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Ocupación Actual</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">
              {stats.ocupadas} <span className="text-sm text-gray-400 font-normal">/ {stats.totalPlazas}</span>
            </h3>
            <p className="text-xs text-green-600 mt-2 font-medium">
               {stats.libres} plazas libres disponibles
            </p>
          </div>
          <div className="bg-blue-50 p-4 rounded-full text-primary">
            <FaCar size={24} />
          </div>
        </div>

        {/* TARJETA 2: RESERVAS ACTIVAS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Reservas Activas</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.reservasActivas}</h3>
            <p className="text-xs text-yellow-600 mt-2 font-medium">
              {stats.reservadas} plazas reservadas en mapa
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-full text-yellow-600">
            <FaChartPie size={24} />
          </div>
        </div>

        {/* TARJETA 3: PLAZAS EN MANTENIMIENTO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Mantenimiento</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.mantenimiento}</h3>
            <p className="text-xs text-orange-500 mt-2 font-medium">
              Fuera de servicio
            </p>
          </div>
          <div className="bg-orange-50 p-4 rounded-full text-orange-500">
            <FaExclamationTriangle size={24} />
          </div>
        </div>

        {/* TARJETA 4: PORCENTAJE DE USO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Nivel de Uso</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{ocupacionPorcentaje}%</h3>
            <div className="w-24 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full rounded-full ${ocupacionPorcentaje > 80 ? 'bg-red-500' : 'bg-green-500'}`} 
                style={{ width: `${ocupacionPorcentaje}%` }}
              ></div>
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-full text-green-600">
            <FaParking size={24} />
          </div>
        </div>
      </div>

      {/* SECCIÓN INFERIOR: DETALLE RÁPIDO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ESTADO DEL PARQUEO */}
        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Estado del Parqueo</h3>
          <div className="space-y-4">
             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="font-medium text-gray-700">Vehículos Estacionados</span>
                </div>
                <span className="font-bold text-gray-900">{stats.ocupadas}</span>
             </div>

             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="font-medium text-gray-700">Espacios Reservados</span>
                </div>
                <span className="font-bold text-gray-900">{stats.reservadas}</span>
             </div>

             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="font-medium text-gray-700">Espacios Libres</span>
                </div>
                <span className="font-bold text-gray-900">{stats.libres}</span>
             </div>
          </div>
        </div>

        {/* MENSAJE DE BIENVENIDA O ACCIONES RÁPIDAS */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 rounded-xl shadow text-white flex flex-col justify-center">
            <h3 className="text-2xl font-bold mb-2">Panel de Control UCE Parking</h3>
            <p className="mb-6 opacity-90">
                El sistema está monitoreando {stats.totalPlazas} plazas en tiempo real. 
                Los sensores actualizarán el estado automáticamente.
            </p>
            <div className="flex gap-3">
                <button className="bg-white text-blue-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-100 transition">
                    Ver Mapa Completo
                </button>
                <button className="bg-blue-500 text-white border border-blue-400 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-400 transition">
                    Generar Reporte
                </button>
            </div>
        </div>

      </div>
    </Layout>
  );
}


import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking, FaBell, FaUserTie, FaUsers } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';

export default function Dashboard() {
  const { orgId } = useOrg();
  const [stats, setStats] = useState({
    totalPlazas: 0,
    ocupadas: 0,
    reservadas: 0,
    libres: 0,
    reservasActivas: 0,
    mantenimiento: 0,
    asignadas: 0,
    personasActivas: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, () => loadDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Obtener catálogos de estados (contexto plaza)
      const { data: estados } = await supabase.from('estado').select('*').eq('contexto', 'plaza');

      // 2. Obtener plazas
      const { data: plazas } = await supabase.from('plaza').select('id_estado');

      // 3. Obtener Reservas de la tabla reserva
      const { count: reservasTablaCount } = await supabase
        .from('reserva')
        .select('*', { count: 'exact', head: true })
        .eq('id_estado', estados?.find(e => e.nombre === 'Activa')?.id || 0);

      const getId = (name) => estados?.find(e => e.nombre.trim().toUpperCase() === name.toUpperCase())?.id;

      const idLibre = getId('Libre');
      const idOcupada = getId('Ocupada');
      const idReservada = getId('Reservada');
      const idMantenimiento = getId('Mantenimiento') || getId('Fuera de Servicio');
      const idAsignada = getId('Asignada');

      // Cálculos
      const total = plazas?.length || 0;
      const ocupadasNum = plazas?.filter(p => p.id_estado === idOcupada).length || 0;
      const reservadasEnMapa = plazas?.filter(p => p.id_estado === idReservada).length || 0;
      const mantenimientoNum = plazas?.filter(p => p.id_estado === idMantenimiento).length || 0;
      const asignadasNum = plazas?.filter(p => p.id_estado === idAsignada).length || 0;
      const libresNum = plazas?.filter(p => p.id_estado === idLibre || p.id_estado === null).length || 0;

      const reservasActivasNum = reservasTablaCount > 0 ? reservasTablaCount : reservadasEnMapa;
      const personasActivasNum = ocupadasNum + asignadasNum + reservasActivasNum;

      setStats({
        totalPlazas: total,
        ocupadas: ocupadasNum,
        reservadas: reservadasEnMapa,
        libres: libresNum,
        mantenimiento: mantenimientoNum,
        asignadas: asignadasNum,
        reservasActivas: reservasActivasNum,
        personasActivas: personasActivasNum
      });

    } catch (error) {
      console.error("Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ocupacionPorcentaje = stats.totalPlazas > 0
    ? Math.round(((stats.ocupadas + stats.reservadas + stats.asignadas) / stats.totalPlazas) * 100)
    : 0;

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Vista General</h2>
        <p className="text-gray-500">Resumen de actividad en tiempo real.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">

        {/* Ocupación */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Ocupación Actual</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">
              {stats.ocupadas} <span className="text-sm text-gray-400 font-normal">/ {stats.totalPlazas}</span>
            </h3>
            <p className="text-xs text-green-600 mt-2 font-medium">{stats.libres} plazas libres</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-full text-blue-600"><FaCar size={24} /></div>
        </div>

        {/* Reservas Activas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Reservas Activas</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.reservasActivas}</h3>
            <p className="text-xs text-yellow-600 mt-2 font-medium">
              {stats.reservadas} plazas marcadas en mapa
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-full text-yellow-600"><FaChartPie size={24} /></div>
        </div>

        {/* Mantenimiento */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Mantenimiento</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.mantenimiento}</h3>
            <p className="text-xs text-orange-500 mt-2 font-medium">Fuera de servicio</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-full text-orange-500"><FaExclamationTriangle size={24} /></div>
        </div>

        {/* Plazas Asignadas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Asignadas</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.asignadas}</h3>
            <p className="text-xs text-purple-600 mt-2 font-medium">Empleados con plaza fija</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-full text-purple-600"><FaUserTie size={24} /></div>
        </div>

        {/* Personas en Parqueo */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase">Personas Estacionadas</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.personasActivas}</h3>
            <p className="text-xs text-indigo-600 mt-2 font-medium">Total en campus</p>
          </div>
          <div className="bg-indigo-50 p-4 rounded-full text-indigo-600"><FaUsers size={24} /></div>
        </div>

        {/* Nivel de Uso */}
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
          <div className="bg-green-50 p-4 rounded-full text-green-600"><FaParking size={24} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4 text-lg">Estado Detallado</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="font-medium text-gray-700">Vehículos Estacionados</span>
              </div>
              <span className="font-bold text-red-600 text-xl">{stats.ocupadas}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                <span className="font-medium text-gray-700">Total Personas en Campus</span>
              </div>
              <span className="font-bold text-indigo-700 text-xl">{stats.personasActivas}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span className="font-medium text-gray-700">Espacios Reservados</span>
              </div>
              <span className="font-bold text-yellow-600 text-xl">{stats.reservadas}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                <span className="font-medium text-gray-700">Plazas Asignadas a Empleados</span>
              </div>
              <span className="font-bold text-purple-700 text-xl">{stats.asignadas}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="font-medium text-gray-700">En Mantenimiento</span>
              </div>
              <span className="font-bold text-orange-600 text-xl">{stats.mantenimiento}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="font-medium text-gray-700">Espacios Libres</span>
              </div>
              <span className="font-bold text-green-600 text-xl">{stats.libres}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-700 to-blue-900 p-8 rounded-xl shadow-lg text-white flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl font-black mb-2 italic">UCE PARKING SYSTEM</h3>
            <p className="mb-6 opacity-80 text-sm leading-relaxed">
              Monitoreo global de {stats.totalPlazas} plazas distribuidas en el campus.
              Sincronización en tiempo real con sensores ultrasónicos activa.
            </p>
            <div className="flex gap-4">
              <button className="bg-white text-blue-900 px-5 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition">Mapa</button>
              <button className="bg-blue-500/20 border border-blue-400 text-white px-5 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-blue-500/40 transition">Reportes</button>
            </div>
          </div>
          <FaParking className="absolute -right-4 -bottom-4 text-white/10 text-9xl rotate-12" />
        </div>
      </div>
    </Layout>
  );
}
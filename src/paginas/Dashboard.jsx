

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking, FaBell, FaUserTie, FaUsers } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { ESTADO_PLAZA, ESTADO_RESERVA, TIPO_NOTIF } from '../lib/constants';

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
    if (orgId) {
      loadDashboardData();

      const channel = supabase
        .channel('dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadDashboardData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, () => loadDashboardData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, () => loadDashboardData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, () => loadDashboardData())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [orgId]);

  const loadDashboardData = async () => {
    if (!orgId) return;
    try {
      // 1. Obtener catálogos y datos base
      const [
        { data: estadosPlaza },
        { data: estadosReserva },
        { data: rawPlazas },
        { data: zonasData }
      ] = await Promise.all([
        supabase.from('estado_plaza').select('*'),
        supabase.from('estado_reserva').select('*'),
        supabase.from('plaza').select('*, zona(estado_zona(nombre))').eq('organizacion_id', orgId),
        supabase.from('zona').select('id_zona, estado_zona(nombre)').eq('organizacion_id', orgId)
      ]);

      // Filtrar plazas de zonas inactivas (asumiendo que estado_zona inactiva es un valor que ya no usaremos o manejaremos por ID)
      const plazasFiltradas = (rawPlazas || []).filter(p => p.zona?.estado_zona?.nombre !== 'Inactiva');

      // 2. Obtener información de ocupación
      const mapaOcupacion = {};

      // 2.1 ACCESOS (Ocupación real)
      const { data: accesosActivos } = await supabase
        .from('acceso')
        .select('id_plaza')
        .eq('organizacion_id', orgId)
        .is('salida_at', null);
      
      (accesosActivos || []).forEach(acc => {
        if (acc.id_plaza) mapaOcupacion[acc.id_plaza] = { type: 'acceso' };
      });

      // 2.2 RESERVAS (Individuales y por Zona)
      const { data: reservasActivas } = await supabase
        .from('reserva')
        .select('id_plaza')
        .eq('organizacion_id', orgId)
        .eq('id_estado', ESTADO_RESERVA.ACTIVA);
      
      (reservasActivas || []).forEach(res => {
        if (res.id_plaza) {
          mapaOcupacion[res.id_plaza] = { type: 'reserva' };
        }
      });

      const { data: reservasZonasActivas } = await supabase
        .from('reserva_zona')
        .select('id_zona')
        .eq('organizacion_id', orgId)
        .eq('id_estado', ESTADO_RESERVA.ACTIVA);
      
      if (reservasZonasActivas?.length > 0) {
        reservasZonasActivas.forEach(rz => {
          plazasFiltradas.filter(p => p.id_zona === rz.id_zona).forEach(p => {
            if (!mapaOcupacion[p.id_plaza]) {
              mapaOcupacion[p.id_plaza] = { type: 'reserva_zona' };
            }
          });
        });
      }

      // 2.3 ASIGNACIONES (Solo activas - id_estado: 1)
      const { data: asigData } = await supabase.from('asignacion')
        .select('id_plaza')
        .eq('organizacion_id', orgId)
        .eq('id_estado', 1)
        .or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString().split('T')[0]}`);
      
      (asigData || []).forEach(asig => {
        if (asig.id_plaza) {
          mapaOcupacion[asig.id_plaza] = { type: 'asignacion' };
        }
      });

      // 2.4 TICKETS ACTIVOS (Visitantes)
      const { data: stActivoTk } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
      const idTicketActivo = stActivoTk?.id_estado || 1;
      const { data: ticketsData } = await supabase.from('ticket')
        .select('id_plaza_asignada')
        .eq('organizacion_id', orgId)
        .eq('id_estado', idTicketActivo);
      
      (ticketsData || []).forEach(tk => {
        if (tk.id_plaza_asignada) {
          mapaOcupacion[tk.id_plaza_asignada] = { type: 'ticket' };
        }
      });

      // 3. Procesar estados de plazas
      const plazasProcesadas = plazasFiltradas.map(p => {
        const estadoObj = (estadosPlaza || []).find(e => e.id_estado === p.id_estado);
        const rawId = p.id_estado;
        
        let finalNombre = estadoObj ? estadoObj.nombre.toUpperCase() : 'LIBRE';
        const info = mapaOcupacion[p.id_plaza];
        
        if (info && rawId === ESTADO_PLAZA.LIBRE) {
          if (info.type === 'acceso' || info.type === 'ticket') finalNombre = 'OCUPADA';
          else if (info.type === 'reserva' || info.type === 'reserva_zona') finalNombre = 'RESERVADA';
          else if (info.type === 'asignacion') finalNombre = 'ASIGNADA';
        }

        return { ...p, Nombre_Final: finalNombre };
      });

      // 4. Calcular Estadísticas (Siguiendo exactamente los filtros de Ocupacion.jsx)
      const libres = plazasProcesadas.filter(p => p.Nombre_Final === 'LIBRE' && !mapaOcupacion[p.id_plaza]).length;
      const asignadas = plazasProcesadas.filter(p => p.Nombre_Final.startsWith('ASIGNAD') || mapaOcupacion[p.id_plaza]?.type === 'asignacion').length;
      const ocupadas = plazasProcesadas.filter(p => p.Nombre_Final === 'OCUPADA' && mapaOcupacion[p.id_plaza]?.type !== 'asignacion').length;
      const reservadas = plazasProcesadas.filter(p => (p.Nombre_Final === 'RESERVADA' || p.Nombre_Final === 'RESERVADO') && mapaOcupacion[p.id_plaza]?.type !== 'asignacion').length;
      const mantenimiento = plazasProcesadas.filter(p => ['MANTENIMIENTO', 'FUERA DE SERVICIO', 'EN MANTENIMIENTO'].includes(p.Nombre_Final)).length;

      const totalPersonas = ocupadas + asignadas + reservadas;

      setStats({
        totalPlazas: plazasProcesadas.length,
        ocupadas,
        reservadas,
        libres,
        asignadas,
        mantenimiento,
        reservasActivas: reservadas, 
        personasActivas: totalPersonas
      });

    } catch (error) {
      console.error("Error cargando Dashboard:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ocupacionPorcentaje = stats.totalPlazas > 0
    ? Math.round((stats.personasActivas / stats.totalPlazas) * 100)
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
              {stats.personasActivas} <span className="text-sm text-gray-400 font-normal">/ {stats.totalPlazas}</span>
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
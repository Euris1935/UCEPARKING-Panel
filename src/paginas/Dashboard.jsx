import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking, FaUserTie, FaUsers, FaTicketAlt, FaHistory, FaCheckCircle, FaDoorOpen, FaMapMarkedAlt, FaUserClock, FaChartLine, FaMobileAlt, FaBuilding, FaSignOutAlt, FaSignInAlt } from 'react-icons/fa';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useOrg } from '../contexts/OrgContext';
import { ESTADO_PLAZA, ESTADO_RESERVA, ROL } from '../lib/constants';
import DashboardMap from '../componentes/DashboardMap';

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours} hr`;
  if (days === 1) return 'Ayer';
  return date.toLocaleDateString();
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function Dashboard() {
  const { orgId } = useOrg();
  const [stats, setStats] = useState({
    totalPlazas: 0, ocupadas: 0, reservadas: 0, libres: 0,
    mantenimiento: 0, asignadas: 0, personasActivas: 0,
    ticketsHoy: 0, accesosHoy: 0,
    ticketsActivos: 0, accesosActivosCount: 0,
    totalZonas: 0, totalUsuarios: 0,
    totalVehiculos: 0, totalEmpleados: 0, usuariosMoviles: 0, salidasHoy: 0
  });
  const [eventosRecientes, setEventosRecientes] = useState([]);
  const [historyAccesos, setHistoryAccesos] = useState([]);
  const [chartTimeframe, setChartTimeframe] = useState('dia'); // dia, semana, mes
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgId) {
      loadDashboardData();
      const channel = supabase
        .channel('dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, loadDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, loadDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'evento' }, loadDashboardData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'acceso' }, loadDashboardData)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [orgId]);

  const loadDashboardData = async () => {
    if (!orgId) return;
    try {
      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const hoyStr = hoyInicio.toISOString();

      const mesInicio = new Date();
      mesInicio.setDate(mesInicio.getDate() - 30);
      const mesStr = mesInicio.toISOString();

      const [
        { data: estadosPlaza }, { data: rawPlazas }, { data: zonasData },
        { data: asigData }, { data: ticketsActivosData },
        { data: accesosActivosData }, { data: reservasActivasData }, { data: reservasZonasActivas },
        { data: eventosData }, { data: ticketsHoyData }, { data: accesosHoyData }, { count: usuariosCount },
        { data: chartAccesos },
        { count: vehiculosCount }, { count: empleadosCount }, { count: usuariosMovilesCount }, { count: salidasHoyCount }
      ] = await Promise.all([
        supabase.from('estado_plaza').select('*'),
        supabase.from('plaza').select('*, zona:id_zona(id_zona, nombre, nivel_piso, estado_zona:id_estado(nombre))').eq('organizacion_id', orgId),
        supabase.from('zona').select('id_zona, estado_zona:id_estado(nombre)').eq('organizacion_id', orgId),
        
        supabase.from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1).or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString().split('T')[0]}`),
        supabase.from('ticket').select('id_plaza_asignada').eq('organizacion_id', orgId).eq('id_estado', 1),
        supabase.from('acceso').select('id_plaza').eq('organizacion_id', orgId).is('salida_at', null),
        supabase.from('reserva').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', ESTADO_RESERVA.ACTIVA).lte('fecha_hora_inicio', new Date().toISOString()).gte('fecha_hora_fin', new Date().toISOString()),
        supabase.from('reserva_zona').select('id_zona').eq('organizacion_id', orgId).eq('id_estado', ESTADO_RESERVA.ACTIVA).lte('fecha_hora_inicio', new Date().toISOString()).gte('fecha_hora_fin', new Date().toISOString()),
        
        supabase.from('evento').select('fecha_hora, descripcion, tipo_evento:id_tipo(nombre), persona:id_persona(nombre, apellido), plaza:id_plaza(numero_plaza)').eq('organizacion_id', orgId).order('fecha_hora', { ascending: false }).limit(6),
        supabase.from('ticket').select('id_ticket').eq('organizacion_id', orgId).gte('fecha_hora_emision', hoyStr),
        supabase.from('acceso').select('id_registro').eq('organizacion_id', orgId).gte('entrada_at', hoyStr),
        supabase.from('usuario').select('*', { count: 'exact', head: true }).eq('organizacion_id', orgId),
        
        // Data for charts (last 30 days of entries)
        supabase.from('acceso').select('entrada_at').eq('organizacion_id', orgId).gte('entrada_at', mesStr),

        // New dashboard components
        supabase.from('vehiculo').select('*', { count: 'exact', head: true }).eq('organizacion_id', orgId),
        supabase.from('empleado').select('*', { count: 'exact', head: true }).eq('organizacion_id', orgId),
        supabase.from('usuario').select('*', { count: 'exact', head: true }).eq('organizacion_id', orgId).eq('rol_id', ROL.MOVIL),
        supabase.from('acceso').select('id_registro', { count: 'exact', head: true }).eq('organizacion_id', orgId).gte('salida_at', hoyStr)
      ]);

      const plazasFiltradas = (rawPlazas || []).filter(p => p.zona?.estado_zona?.nombre !== 'Inactiva');
      const mapaOcupacion = {};

      (accesosActivosData || []).forEach(acc => { if (acc.id_plaza) mapaOcupacion[acc.id_plaza] = { type: 'acceso' }; });
      (reservasActivasData || []).forEach(res => { if (res.id_plaza) mapaOcupacion[res.id_plaza] = { type: 'reserva' }; });
      if (reservasZonasActivas?.length > 0) {
        reservasZonasActivas.forEach(rz => {
          plazasFiltradas.filter(p => p.id_zona === rz.id_zona).forEach(p => {
             if (!mapaOcupacion[p.id_plaza]) mapaOcupacion[p.id_plaza] = { type: 'reserva_zona' };
          });
        });
      }
      (asigData || []).forEach(asig => { if (asig.id_plaza) mapaOcupacion[asig.id_plaza] = { type: 'asignacion' }; });
      (ticketsActivosData || []).forEach(tk => { if (tk.id_plaza_asignada) mapaOcupacion[tk.id_plaza_asignada] = { type: 'ticket' }; });

      const plazasProcesadas = plazasFiltradas.map(p => {
        const estadoObj = (estadosPlaza || []).find(e => e.id_estado === p.id_estado);
        let finalNombre = estadoObj ? estadoObj.nombre.toUpperCase() : 'LIBRE';
        const info = mapaOcupacion[p.id_plaza];
        if (info && finalNombre === 'LIBRE') {
          if (info.type === 'acceso' || info.type === 'ticket') finalNombre = 'OCUPADA';
          else if (info.type === 'reserva' || info.type === 'reserva_zona') finalNombre = 'RESERVADA';
          else if (info.type === 'asignacion') finalNombre = 'ASIGNADA';
        }
        return { ...p, Nombre_Final: finalNombre };
      });

      const libres = plazasProcesadas.filter(p => p.Nombre_Final === 'LIBRE' && !mapaOcupacion[p.id_plaza]).length;
      const asignadas = plazasProcesadas.filter(p => p.Nombre_Final.startsWith('ASIGNAD') || mapaOcupacion[p.id_plaza]?.type === 'asignacion').length;
      const ocupadas = plazasProcesadas.filter(p => p.Nombre_Final === 'OCUPADA' && mapaOcupacion[p.id_plaza]?.type !== 'asignacion').length;
      const reservadas = plazasProcesadas.filter(p => (p.Nombre_Final === 'RESERVADA' || p.Nombre_Final === 'RESERVADO') && mapaOcupacion[p.id_plaza]?.type !== 'asignacion').length;
      const mantenimiento = plazasProcesadas.filter(p => ['MANTENIMIENTO', 'FUERA DE SERVICIO', 'EN MANTENIMIENTO'].includes(p.Nombre_Final)).length;

      const totalPersonas = ocupadas + asignadas + reservadas;

      setStats({
        totalPlazas: plazasProcesadas.length,
        ocupadas, reservadas, libres, asignadas, mantenimiento,
        personasActivas: totalPersonas,
        ticketsHoy: ticketsHoyData?.length || 0,
        accesosHoy: accesosHoyData?.length || 0,
        ticketsActivos: ticketsActivosData?.length || 0,
        accesosActivosCount: accesosActivosData?.length || 0,
        totalZonas: (zonasData || []).filter(z => z.estado_zona?.nombre !== 'Inactiva').length,
        totalUsuarios: usuariosCount || 0,
        totalVehiculos: vehiculosCount || 0,
        totalEmpleados: empleadosCount || 0,
        usuariosMoviles: usuariosMovilesCount || 0,
        salidasHoy: salidasHoyCount || 0,
        _plazasRaw: plazasProcesadas // Para cálculos internos en el render
      });

      setHistoryAccesos(chartAccesos || []);
      setEventosRecientes(eventosData || []);
    } catch (error) {
      console.error("Error cargando Dashboard:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    const now = new Date();
    
    if (chartTimeframe === 'dia') {
      // Last 24 hours grouped by hour
      const data = [];
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        const name = d.getHours() + ':00';
        data.push({ name, timestamp: d.getTime(), Entradas: 0 });
      }
      historyAccesos.forEach(acc => {
        const accD = new Date(acc.entrada_at);
        if (now - accD <= 24 * 60 * 60 * 1000) {
          const hrStr = accD.getHours() + ':00';
          const match = data.find(d => d.name === hrStr);
          if (match) match.Entradas++;
        }
      });
      return data;
    } 
    else if (chartTimeframe === 'semana') {
      // Last 7 days grouped by day of week
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        data.push({ name: DIAS_SEMANA[d.getDay()], dateStr: d.toDateString(), Entradas: 0 });
      }
      historyAccesos.forEach(acc => {
        const accD = new Date(acc.entrada_at);
        if (now - accD <= 7 * 24 * 60 * 60 * 1000) {
          const tsStr = accD.toDateString();
          const match = data.find(d => d.dateStr === tsStr);
          if (match) match.Entradas++;
        }
      });
      return data;
    }
    else if (chartTimeframe === 'mes') {
      // Last 30 days grouped by day of month
      const data = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const name = d.getDate().toString().padStart(2,'0') + '/' + (d.getMonth()+1).toString().padStart(2,'0');
        data.push({ name, dateStr: d.toDateString(), Entradas: 0 });
      }
      historyAccesos.forEach(acc => {
        const accD = new Date(acc.entrada_at);
        if (now - accD <= 30 * 24 * 60 * 60 * 1000) {
          const tsStr = accD.toDateString();
          const match = data.find(d => d.dateStr === tsStr);
          if (match) match.Entradas++;
        }
      });
      return data;
    }
    return [];
  }, [historyAccesos, chartTimeframe]);

  const usoPorcentaje = stats.totalPlazas > 0 ? Math.round((stats.personasActivas / stats.totalPlazas) * 100) : 0;

  const StatCard = ({ title, value, subtext, icon, colorClass, bgClass, ringClass }) => (
    <div className={`bg-white p-5 rounded-2xl shadow-sm border ${ringClass} flex items-center justify-between transition-transform hover:-translate-y-1 hover:shadow-md`}>
      <div>
        <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${colorClass} opacity-80`}>{title}</p>
        <h3 className="text-3xl font-black text-gray-800">{value}</h3>
        {subtext && <p className={`text-xs mt-1.5 font-medium text-gray-500`}>{subtext}</p>}
      </div>
      <div className={`p-4 rounded-xl shadow-inner ${bgClass} ${colorClass}`}>
        {icon}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto pb-10">
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Panel Principal</h2>
            <p className="text-gray-500 font-medium mt-1">Visión global del sistema UCE Parking</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-sm">
                <FaCheckCircle className="text-indigo-500"/> Operativo
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <p className="text-gray-400 font-bold animate-pulse">Cargando métricas...</p>
          </div>
        ) : (
          <>
            {/* Fila principal de métricas core */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
              <StatCard 
                title="Total Espacios en Uso" 
                value={stats.personasActivas} 
                subtext={`De ${stats.totalPlazas} plazas en ${stats.totalZonas} zonas`}
                icon={<FaParking size={26} />} 
                colorClass="text-emerald-600" bgClass="bg-emerald-50" ringClass="border-emerald-100"
              />
              <StatCard 
                title="Total Espacios Libres" 
                value={stats.libres} 
                subtext={`Disponibles para uso`}
                icon={<FaCheckCircle size={26} />} 
                colorClass="text-blue-600" bgClass="bg-blue-50" ringClass="border-blue-100"
              />
              <StatCard 
                title="Vehículos Estacionados" 
                value={stats.ocupadas} 
                subtext={stats.libres > 0 ? `${stats.libres} plazas disponibles` : 'Parqueo Lleno'}
                icon={<FaCar size={26} />} 
                colorClass="text-indigo-600" bgClass="bg-indigo-50" ringClass="border-indigo-100"
              />
              <StatCard 
                title="Plazas Asignadas" 
                value={stats.asignadas} 
                subtext="Para staff o uso fijo"
                icon={<FaUserTie size={26} />} 
                colorClass="text-purple-600" bgClass="bg-purple-50" ringClass="border-purple-100"
              />
              <StatCard 
                title="Reservaciones Activas" 
                value={stats.reservadas} 
                subtext="Espacios bloqueados"
                icon={<FaChartPie size={26} />} 
                colorClass="text-amber-600" bgClass="bg-amber-50" ringClass="border-amber-100"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Panel Central Grande */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Tarjeta de Resumen Estilizada */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                        <div className="bg-gradient-to-r from-gray-900 to-indigo-900 p-8 text-white relative z-10">
                            <h3 className="text-xl font-bold opacity-90 flex items-center gap-2"><FaMapMarkedAlt /> Ocupación Actual del Campus</h3>
                            <div className="mt-6 flex items-end gap-4">
                                <span className="text-6xl font-black">{usoPorcentaje}%</span>
                                <span className="text-indigo-200 font-medium pb-2 uppercase tracking-widest text-sm">Capacidad comprometida</span>
                            </div>
                            
                            <div className="w-full bg-gray-800/50 rounded-full h-3 mt-6 mb-2 overflow-hidden backdrop-blur-sm p-0.5 relative">
                                <div className={`h-full rounded-full transition-all duration-1000 relative ${usoPorcentaje > 85 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : usoPorcentaje > 60 ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]'}`} style={{ width: `${usoPorcentaje}%` }}>
                                </div>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-indigo-300 mt-2">
                                <span>0%</span>
                                <span>{stats.libres} libres de {stats.totalPlazas} plazas</span>
                                <span>100%</span>
                            </div>
                        </div>

                        {/* Breakdown Operativo */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100 bg-white border-t border-gray-100">
                            {/* Fila 1 */}
                            <div className="p-4 py-5 text-center">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaDoorOpen className="mr-1 mt-0.5"/> Accesos Hoy</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.accesosHoy} <span className="text-xs text-green-500 font-bold ml-0.5"><FaSignInAlt className="inline mb-0.5"/></span></p>
                            </div>
                            <div className="p-4 py-5 text-center">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaSignOutAlt className="mr-1 mt-0.5"/> Salidas Hoy</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.salidasHoy} <span className="text-xs text-red-400 font-bold ml-0.5"><FaSignOutAlt className="inline mb-0.5"/></span></p>
                            </div>
                            <div className="p-4 py-5 text-center">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaTicketAlt className="mr-1 mt-0.5"/> Tickets (Act / Hoy)</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.ticketsActivos} <span className="text-xs text-gray-400 font-normal ml-0.5">/ {stats.ticketsHoy}</span></p>
                            </div>
                            <div className="p-4 py-5 text-center">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaUsers className="mr-1 mt-0.5"/> Usuarios Totales</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.totalUsuarios}</p>
                            </div>
                            
                            {/* Fila 2 (Añadida mediante border-t y sin bordes laterales lg para que mantenga el grid de 4 cols) */}
                            <div className="p-4 py-5 text-center lg:border-t">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaCar className="mr-1 mt-0.5"/> Vehículos Reg.</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.totalVehiculos}</p>
                            </div>
                            <div className="p-4 py-5 text-center lg:border-t">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaBuilding className="mr-1 mt-0.5"/> Empleados</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.totalEmpleados}</p>
                            </div>
                            <div className="p-4 py-5 text-center lg:border-t">
                                <p className="text-gray-400 flex justify-center text-[10px] font-black uppercase"><FaMobileAlt className="mr-1 mt-0.5"/> Usu. Móviles</p>
                                <p className="text-2xl font-bold text-gray-800 mt-1">{stats.usuariosMoviles}</p>
                            </div>
                            <div className="p-4 py-5 text-center bg-orange-50/30 lg:border-t">
                                <p className="text-orange-500 flex justify-center text-[10px] font-black uppercase"><FaExclamationTriangle className="mr-1 mt-0.5"/> Mantenimiento</p>
                                <p className="text-2xl font-bold text-orange-600 mt-1">{stats.mantenimiento} <span className="text-xs text-orange-400 font-normal ml-0.5">plaz.</span></p>
                            </div>
                        </div>
                    </div>

                    {/* NUEVA SECCIÓN: OCUPACIÓN POR NIVELES */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                             <FaBuilding className="text-emerald-500" /> Ocupación por Niveles
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {(() => {
                                // Agrupar plazas por nivel del piso de la zona
                                const niveles = {};
                                stats._plazasRaw?.forEach(p => {
                                    const niv = p.zona?.nivel_piso ?? 0;
                                    if (!niveles[niv]) niveles[niv] = { total: 0, ocupadas: 0, nombre: '' };
                                    niveles[niv].total++;
                                    if (['OCUPADA', 'RESERVADA', 'ASIGNADA'].includes(p.Nombre_Final)) {
                                        niveles[niv].ocupadas++;
                                    }
                                    if (!niveles[niv].nombre) {
                                        niveles[niv].nombre = niv === 0 ? 'P. Baja' : (niv < 0 ? `Sótano ${Math.abs(niv)}` : `Piso ${niv}`);
                                    }
                                });

                                return Object.keys(niveles).sort((a, b) => parseInt(a) - parseInt(b)).map(niv => {
                                    const n = niveles[niv];
                                    const porc = n.total > 0 ? Math.round((n.ocupadas / n.total) * 100) : 0;
                                    return (
                                        <div key={niv} className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col items-center">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{n.nombre}</span>
                                            <div className="mt-2 text-2xl font-black text-gray-800">{porc}%</div>
                                            <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${porc > 85 ? 'bg-red-500' : porc > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${porc}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[9px] font-bold text-gray-400 mt-2">{n.ocupadas}/{n.total} PLAZAS</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                    
                    {/* GRÁFICA DE ACTIVIDAD */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-hidden">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FaChartLine className="text-indigo-600"/> Tráfico de Entradas</h3>
                            <div className="flex bg-gray-100 rounded-lg p-1 text-xs font-bold">
                                {['dia', 'semana', 'mes'].map(t => (
                                    <button 
                                      key={t}
                                      onClick={() => setChartTimeframe(t)}
                                      className={`px-3 py-1.5 rounded-md capitalize transition-all ${chartTimeframe === t ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {t === 'dia' ? 'Hoy' : t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
                                  <defs>
                                    <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                  <Tooltip 
                                     contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                     labelStyle={{ fontWeight: 'bold', color: '#374151' }}
                                     cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                  />
                                  <Area type="monotone" dataKey="Entradas" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorEntradas)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Columna Lateral para Logs y Actividad */}
                <div className="lg:col-span-1 space-y-6">
                    {/* MAPA DE UBICACIÓN FÍSICA */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[320px]">
                        <DashboardMap />
                    </div>

                    <div className="bg-white p-0 rounded-2xl shadow-sm border border-gray-100 h-[calc(100%-344px)] min-h-[400px] flex flex-col">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <FaHistory className="text-indigo-500" />
                                Últimos Eventos
                            </h3>
                            <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span> En Vivo
                            </span>
                        </div>
                        
                        <div className="p-5 flex-1 overflow-y-auto">
                            {eventosRecientes.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm mt-10 italic">No hay actividad reciente.</p>
                            ) : (
                                <div className="space-y-6">
                                    {eventosRecientes.map((evt, idx) => (
                                        <div key={idx} className="relative pl-6 before:content-[''] before:absolute before:left-[7px] before:top-2 before:w-[2px] before:h-full before:bg-gray-100">
                                            {/* Circulito en la línea del timeline */}
                                            <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-400 z-10"></div>
                                            
                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm hover:border-indigo-200 transition-colors">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wide">
                                                        {evt.tipo_evento?.nombre || 'Evento'} {evt.plaza?.numero_plaza ? `— Plz ${evt.plaza.numero_plaza}` : ''}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap ml-2">
                                                        {timeAgo(evt.fecha_hora)}
                                                    </span>
                                                </div>
                                                <p className="text-gray-600 text-[13px] leading-relaxed mt-1.5">{evt.descripcion}</p>
                                                {evt.persona && (
                                                    <p className="text-[10px] font-bold text-indigo-500 mt-2 uppercase tracking-wide flex items-center gap-1">
                                                        <FaUserClock /> {evt.persona.nombre} {evt.persona.apellido}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}



import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking, FaBell, FaUserTie } from 'react-icons/fa';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0,
    ocupadas: 0,
    reservadas: 0,
    libres: 0,
    reservasActivas: 0,
    mantenimiento: 0,
    asignadas: 0
  });

  const [loading, setLoading] = useState(true);
  const [alertaBanner, setAlertaBanner] = useState(null); // RF3: alerta de capacidad
  const alertaYaEnviada = useRef(false); // evitar spam de notificaciones

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'RESERVA' }, () => loadDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Obtener catálogos de estados
      const { data: estados } = await supabase.from('estado_plaza').select('*');

      // 2. Obtener plazas
      const { data: plazas } = await supabase.from('plazas').select('id_estado');

      // 3. Obtener Reservas de la tabla RESERVA
      const { count: reservasTablaCount } = await supabase
        .from('RESERVA')
        .select('*', { count: 'exact', head: true })
        .eq('Estado_Reserva', 'ACTIVA');

      const getId = (name) => estados?.find(e => e.nombre_estado.trim().toUpperCase() === name.toUpperCase())?.id_estado;

      const idLibre = getId('LIBRE');
      const idOcupada = getId('OCUPADA');
      const idReservada = getId('RESERVADA');
      const idMantenimiento = getId('FUERA_DE_SERVICIO');
      const idAsignada = getId('ASIGNADA');

      // Cálculos
      const total = plazas?.length || 0;
      const ocupadas = plazas?.filter(p => p.id_estado === idOcupada).length || 0;
      const reservadasEnMapa = plazas?.filter(p => p.id_estado === idReservada).length || 0;
      const mantenimiento = plazas?.filter(p => p.id_estado === idMantenimiento).length || 0;
      const asignadas = plazas?.filter(p => p.id_estado === idAsignada).length || 0;
      const libres = plazas?.filter(p => p.id_estado === idLibre || p.id_estado === null).length || 0;

      setStats({
        totalPlazas: total,
        ocupadas,
        reservadas: reservadasEnMapa,
        libres,
        mantenimiento,
        asignadas,
        reservasActivas: reservasTablaCount > 0 ? reservasTablaCount : reservadasEnMapa
      });

    } catch (error) {
      console.error("Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // RF3: Monitor de alerta de capacidad — se ejecuta cuando cambian las estadísticas
  useEffect(() => {
    if (stats.totalPlazas === 0) return;
    const pct = Math.round(((stats.ocupadas + stats.reservadas) / stats.totalPlazas) * 100);
    const savedSettings = localStorage.getItem('appSettings');
    const umbral = savedSettings ? parseInt(JSON.parse(savedSettings).alertaCapacidad) : 90;

    if (pct >= umbral) {
      setAlertaBanner({ pct, umbral });
      // Solo crear notificación una vez por sesión para no saturar la tabla
      if (!alertaYaEnviada.current) {
        alertaYaEnviada.current = true;
        supabase.from('notificaciones').insert([{
          Tipo: 'Alerta',
          Contenido: `⚠️ Alerta de capacidad: el parqueo está al ${pct}% de ocupación (umbral configurado: ${umbral}%). Plazas libres: ${stats.libres}.`,
          Leida: false
        }]).then(({ error }) => { if (error) console.warn('Error alerta RF3:', error.message); });
      }
    } else {
      setAlertaBanner(null);
      alertaYaEnviada.current = false; // resetear para próxima subida
    }
  }, [stats]);

  const ocupacionPorcentaje = stats.totalPlazas > 0
    ? Math.round(((stats.ocupadas + stats.reservadas + stats.asignadas) / stats.totalPlazas) * 100)
    : 0;

  return (
    <Layout>
      {/* RF3: Banner de alerta de capacidad */}
      {alertaBanner && (
        <div className="mb-6 flex items-center gap-4 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg animate-pulse">
          <FaBell className="text-2xl shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">⚠️ ALERTA DE CAPACIDAD — Parqueo al {alertaBanner.pct}%</p>
            <p className="text-xs opacity-90">Se superó el umbral configurado del {alertaBanner.umbral}%.
              Solo quedan <strong>{stats.libres}</strong> plaza(s) libre(s).
              Notificación registrada automáticamente.
            </p>
          </div>
          <button onClick={() => setAlertaBanner(null)} className="text-white/70 hover:text-white text-lg font-bold px-2">✕</button>
        </div>
      )}
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

/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; 
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking } from 'react-icons/fa';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0, 
    ocupadas: 0,
    reservadas: 0,
    libres: 0,
    reservasActivas: 0,
    mantenimiento: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // Suscripción en tiempo real corregida
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'RESERVA' }, () => loadDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Obtener catálogos de estados (Referencia: image_4f4092.png)
      const { data: estados, error: errorEstados } = await supabase.from('estado_plaza').select('*');
      if (errorEstados) throw errorEstados;

      // 2. Obtener plazas (Referencia: image_4f5e80.png)
      const { data: plazas, error: errorPlazas } = await supabase.from('plazas').select('id_estado');
      if (errorPlazas) throw errorPlazas;

      // 3. Obtener Reservas Activas directamente de la tabla RESERVA
      const { count: reservasCount, error: errorReservas } = await supabase
        .from('RESERVA')
        .select('*', { count: 'exact', head: true })
        .eq('Estado_Reserva', 'ACTIVA'); 
      if (errorReservas) throw errorReservas;

      // Lógica de mapeo de IDs por nombre exacto de tu DB
      const getId = (name) => estados.find(e => e.nombre_estado.toUpperCase() === name.toUpperCase())?.id_estado;

      const idLibre = getId('LIBRE');
      const idOcupada = getId('OCUPADA');
      const idReservada = getId('RESERVADA');
      const idMantenimiento = getId('FUERA_DE_SERVICIO');

      // Cálculos basados en id_estado
      const total = plazas.length;
      const ocupadas = plazas.filter(p => p.id_estado === idOcupada).length;
      const reservadas = plazas.filter(p => p.id_estado === idReservada).length;
      const mantenimiento = plazas.filter(p => p.id_estado === idMantenimiento).length;
      const libres = plazas.filter(p => p.id_estado === idLibre || p.id_estado === null).length;

      setStats({
        totalPlazas: total,
        ocupadas,
        reservadas,
        libres,
        mantenimiento,
        reservasActivas: reservasCount || 0 // Este es el número que va arriba en la tarjeta
      });

    } catch (error) {
      console.error("Error cargando dashboard:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo del porcentaje de uso (Ocupadas + Reservadas)
  const ocupacionPorcentaje = stats.totalPlazas > 0 
    ? Math.round(((stats.ocupadas + stats.reservadas) / stats.totalPlazas) * 100) 
    : 0;

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Vista General</h2>
        <p className="text-gray-500">Resumen de actividad en tiempo real.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
       
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Ocupación Actual</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">
              {stats.ocupadas} <span className="text-sm text-gray-400 font-normal">/ {stats.totalPlazas}</span>
            </h3>
            <p className="text-xs text-green-600 mt-2 font-medium">{stats.libres} plazas libres disponibles</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-full text-blue-600"><FaCar size={24} /></div>
        </div>

        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Reservas Activas</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.reservasActivas}</h3>
            <p className="text-xs text-yellow-600 mt-2 font-medium">
              {stats.reservadas} {stats.reservadas === 1 ? 'plaza reservada' : 'plazas reservadas'} en mapa
            </p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-full text-yellow-600"><FaChartPie size={24} /></div>
        </div>

        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Mantenimiento</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.mantenimiento}</h3>
            <p className="text-xs text-orange-500 mt-2 font-medium">Fuera de servicio</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-full text-orange-500"><FaExclamationTriangle size={24} /></div>
        </div>

       
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Nivel de Uso</p>
            <h3 className="text-3xl font-bold text-gray-800 mt-1">{ocupacionPorcentaje}%</h3>
            <div className="w-24 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${ocupacionPorcentaje > 80 ? 'bg-red-500' : 'bg-green-500'}`} 
                style={{ width: `${ocupacionPorcentaje}%` }}
              ></div>
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-full text-green-600"><FaParking size={24} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 rounded-xl shadow text-white flex flex-col justify-center">
            <h3 className="text-2xl font-bold mb-2 uppercase">UCE Parking</h3>
            <p className="mb-6 opacity-90 text-sm">
                Monitoreo activo de {stats.totalPlazas} plazas. Los datos se actualizan automáticamente al detectar cambios en los sensores.
            </p>
            <div className="flex gap-3">
                <button className="bg-white text-blue-700 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-100 transition active:scale-95">Ver Mapa</button>
                <button className="bg-blue-400/30 text-white border border-blue-400 px-4 py-2 rounded-lg font-bold text-xs hover:bg-blue-400 transition active:scale-95">Reportes</button>
            </div>
        </div>
      </div>
    </Layout>
  );
}

*/

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; 
import Layout from '../componentes/Layout';
import { FaCar, FaExclamationTriangle, FaChartPie, FaParking } from 'react-icons/fa';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPlazas: 0, 
    ocupadas: 0,
    reservadas: 0, // Plazas con id_estado de reservada
    libres: 0,
    reservasActivas: 0, // Reservas en tabla RESERVA
    mantenimiento: 0
  });

  const [loading, setLoading] = useState(true);

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

      // Cálculos
      const total = plazas?.length || 0;
      const ocupadas = plazas?.filter(p => p.id_estado === idOcupada).length || 0;
      const reservadasEnMapa = plazas?.filter(p => p.id_estado === idReservada).length || 0;
      const mantenimiento = plazas?.filter(p => p.id_estado === idMantenimiento).length || 0;
      const libres = plazas?.filter(p => p.id_estado === idLibre || p.id_estado === null).length || 0;

      setStats({
        totalPlazas: total,
        ocupadas,
        reservadas: reservadasEnMapa,
        libres,
        mantenimiento,
        // CORRECCIÓN: Si hay plazas reservadas en el mapa pero 0 en la tabla, 
        // mostramos el número del mapa para que no se vea el 0 incoherente.
        reservasActivas: reservasTablaCount > 0 ? reservasTablaCount : reservadasEnMapa 
      });

    } catch (error) {
      console.error("Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const ocupacionPorcentaje = stats.totalPlazas > 0 
    ? Math.round(((stats.ocupadas + stats.reservadas) / stats.totalPlazas) * 100) 
    : 0;

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Vista General</h2>
        <p className="text-gray-500">Resumen de actividad en tiempo real.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
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

        {/* Reservas Activas - VINCULADO AL CONTEO REAL */}
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
          <div className="space-y-4">
             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Vehículos Estacionados</span>
                <span className="font-bold text-red-600 text-xl">{stats.ocupadas}</span>
             </div>
             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Espacios Reservados</span>
                <span className="font-bold text-yellow-600 text-xl">{stats.reservadas}</span>
             </div>
             <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Espacios Libres</span>
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
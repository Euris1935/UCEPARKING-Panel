

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; 
import Layout from '../componentes/Layout';
import { FaCar, FaTicketAlt, FaExclamationTriangle, FaChartPie, FaParking } from 'react-icons/fa';

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

    
    // Escuchamos cambios en 'plazas' (ocupación) y 'RESERVA' (reservas futuras)
    const channel = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => {
        loadDashboardData(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'RESERVA' }, () => {
        loadDashboardData(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      // carga los estados para saber que ID corresponde a que nombre
      const { data: estados, error: errorEstados } = await supabase
        .from('estado_plaza')
        .select('*');

      if (errorEstados) throw errorEstados;

      // carga todas las plazas con su id_estado
      const { data: plazas, error: errorPlazas } = await supabase
        .from('plazas')
        .select('id_estado');

      if (errorPlazas) throw errorPlazas;

      //  conteo de reservas activas
      const { count: reservasCount, error: errorReservas } = await supabase
        .from('RESERVA')
        .select('*', { count: 'exact', head: true })
        .eq('Estado_Reserva', 'Activa');

      if (errorReservas) throw errorReservas;

      // calculo de estadisticas
      
      const total = plazas.length;
      
      
      const getIdByName = (name) => {
          const found = estados.find(e => e.nombre_estado.toUpperCase() === name.toUpperCase());
          return found ? found.id_estado : -1;
      };

      const idOcupada = getIdByName('OCUPADA');
      const idReservada = getIdByName('RESERVADA');
      const idLibre = getIdByName('LIBRE');
      const idMantenimiento = getIdByName('FUERA_DE_SERVICIO'); 

      // Contamos las plazas comparando los IDs
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
        reservasActivas: reservasCount || 0
      });

    } catch (error) {
      console.error("Error cargando dashboard:", error.message);
    } finally {
      setLoading(false);
    }
  };

  //  Porcentaje de Ocupacion
  const ocupacionPorcentaje = stats.totalPlazas > 0 
    ? Math.round(((stats.ocupadas + stats.reservadas) / stats.totalPlazas) * 100) 
    : 0;

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Vista General</h2>
        <p className="text-gray-500">Resumen de actividad en tiempo real.</p>
      </header>

      {/* TARJETAS DE ESTADÍSTICAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* OCUPACIÓN */}
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


          
        {/* Reservaciones */}
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

        {/* Mantenimiento */}
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

        {/* Porcentaje */}
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

      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Desglose Numérico */}
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

        {/* Panel Informativo */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 rounded-xl shadow text-white flex flex-col justify-center">
            <h3 className="text-2xl font-bold mb-2">Panel de Control UCE Parking</h3>
            <p className="mb-6 opacity-90">
                El sistema está monitoreando {stats.totalPlazas} plazas en tiempo real. 
                Los sensores detectarán automáticamente los cambios de ocupación.
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
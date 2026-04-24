

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { playBeep } from '../utils/audio';
import { useOrg } from '../contexts/OrgContext';
import { FaBell, FaClock } from 'react-icons/fa';
import BarraLateral from './barraLateral';
import ScheduleGuard from './ScheduleGuard';

export default function Layout({ children }) {
  const { orgId } = useOrg();
  const [alertaBanner, setAlertaBanner] = useState(null);
  const [stats, setStats] = useState({ total: 0, ocupadas: 0, reservadas: 0, asignadas: 0, libres: 0 });
  const alertaYaEnviada = useRef(false);
  const prevOcupadas = useRef(0);
  const prevReservadas = useRef(0);
  const prevAsignadas = useRef(0);
  const firstLoad = useRef(true);
  const [alertaEstanciaLarga, setAlertaEstanciaLarga] = useState([]);
  const estanciaAlertaEnviada = useRef(false);

  useEffect(() => {
    loadMonitorData();

    const channel = supabase
      .channel('global_monitor')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plaza' }, (payload) => {
          loadMonitorData();
          const idLibre = 1;
          const eraLibre = !payload.old.id_estado || payload.old.id_estado === idLibre;
          const ahoraNoEsLibre = payload.new.id_estado && payload.new.id_estado !== idLibre;
          if (eraLibre && ahoraNoEsLibre) playBeep();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMonitorData = async () => {
    try {
      // 1. Obtener estados de plazas de la tabla correcta (estado_plaza)
      const { data: estados } = await supabase.from('estado_plaza').select('id_estado, nombre');
      const { data: rawPlazas } = await supabase
        .from('plaza')
        .select(`
            id_estado,
            zona:id_zona(
                estado_zona(nombre)
            )
        `);

      if (!estados || !rawPlazas) return;

      // Filtrar plazas de zonas que NO estén inactivas
      const plazas = rawPlazas.filter(p => !p.zona?.estado_zona || p.zona.estado_zona.nombre !== 'Inactiva');

      const getId = (pattern) => estados.find(e => {
        const n = (e.nombre || '').trim().toUpperCase();
        return n.startsWith(pattern) || (pattern === 'OCUPAD' && n === 'OCUPADO');
      })?.id_estado;
      
      const idOcupada = getId('OCUPAD');
      const idReservada = getId('RESERVAD');
      const idAsignada = getId('ASIGNAD');
      const idLibre = getId('LIBRE');

      const total = plazas.length;
      const ocupadasNum = plazas.filter(p => p.id_estado === idOcupada).length;
      const reservadasNum = plazas.filter(p => p.id_estado === idReservada).length;
      const asignadasNum  = plazas.filter(p => p.id_estado === idAsignada).length;
      const libresNum = plazas.filter(p => p.id_estado === idLibre || p.id_estado === null || 
                                     (![idOcupada, idReservada, idAsignada].includes(p.id_estado))).length;

      // Actualizar stats
      setStats({ total, ocupadas: ocupadasNum, reservadas: reservadasNum, asignadas: asignadasNum, libres: libresNum });
    } catch (error) {
      console.error("Monitor Error:", error.message);
    }
  };

  // ── Monitor de Estancia Larga (>16h) ──
  const checkEstanciaLarga = async () => {
    if (!orgId) return;
    try {
      const hace16h = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('acceso')
        .select('id_registro, entrada_at, id_plaza, vehiculo:id_vehiculo(placa), plaza:id_plaza(numero_plaza)')
        .eq('organizacion_id', orgId)
        .is('salida_at', null)
        .lt('entrada_at', hace16h);

      if (data && data.length > 0) {
        setAlertaEstanciaLarga(data);
        if (!estanciaAlertaEnviada.current) {
          estanciaAlertaEnviada.current = true;
          const placas = data.map(a => a.vehiculo?.placa || 'Desconocida').join(', ');
          supabase.from('notificacion').insert([{
            contenido: `ALERTA: ${data.length} vehículo(s) con más de 16h en el parqueo: ${placas}`,
            leida: false,
            organizacion_id: orgId
          }]).then(({ error }) => { if (error) console.warn('Error notif estancia:', error.message); });
        }
      } else {
        setAlertaEstanciaLarga([]);
        estanciaAlertaEnviada.current = false;
      }
    } catch (err) {
      console.error('Error checkEstanciaLarga:', err.message);
    }
  };

  useEffect(() => {
    if (orgId) {
      checkEstanciaLarga();
      const interval = setInterval(checkEstanciaLarga, 5 * 60 * 1000); // cada 5 min
      return () => clearInterval(interval);
    }
  }, [orgId]);



  // Efecto reactivo para actualizar referencias
  useEffect(() => {
    prevOcupadas.current = stats.ocupadas;
    prevReservadas.current = stats.reservadas;
    prevAsignadas.current = stats.asignadas;
  }, [stats]);

  // Monitor de alerta de capacidad
  useEffect(() => {
    if (stats.total === 0) return;
    const ocupadasTotales = stats.ocupadas + stats.reservadas + (stats.asignadas || 0);
    const pct = Math.round((ocupadasTotales / stats.total) * 100);
    const savedSettings = localStorage.getItem('appSettings');
    const umbral = savedSettings ? parseInt(JSON.parse(savedSettings).alertaCapacidad) : 90;

    if (pct >= umbral) {
      setAlertaBanner({ pct, umbral });
      if (!alertaYaEnviada.current) {
        alertaYaEnviada.current = true;
        supabase.from('notificacion').insert([{
          contenido: `ALERTA GLOBAL: El parqueo alcanzó el ${pct}% de ocupación.`,
          leida: false,
          organizacion_id: orgId
        }]).then(({ error }) => { if (error) console.warn('Error notif global:', error.message); });
      }
    } else {
      setAlertaBanner(null);
      alertaYaEnviada.current = false;
    }
  }, [stats, orgId]);

  return (
    <div className="flex bg-uce-light min-h-screen"> 
      <BarraLateral />
      
      <main className="ml-64 flex-1 p-8 overflow-y-auto relative">
        {/* Banner de Estancia Larga (azul) */}
        {alertaEstanciaLarga.length > 0 && (
          <div className="mb-4 flex items-start gap-4 bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg sticky top-0 z-50">
            <FaClock className="text-2xl shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">ALERTA DE ESTANCIA LARGA — {alertaEstanciaLarga.length} vehículo(s) con más de 16 horas</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {alertaEstanciaLarga.map(a => (
                  <span key={a.id_registro} className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">
                    Plaza {a.plaza?.numero_plaza || a.id_plaza} — {a.vehiculo?.placa || 'Sin placa'}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => setAlertaEstanciaLarga([])} className="text-white/70 hover:text-white text-lg font-bold px-2 shrink-0">✕</button>
          </div>
        )}



        {/* Banner de Capacidad Global (rojo) */}
        {alertaBanner && (
          <div className="mb-6 flex items-center gap-4 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg animate-pulse sticky top-0 z-50">
            <FaBell className="text-2xl shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm">ALERTA DE CAPACIDAD — Parqueo al {alertaBanner.pct}%</p>
              <p className="text-xs opacity-90">Umbral configurado: {alertaBanner.umbral}%. Espacios libres: {stats.libres}</p>
            </div>
            <button onClick={() => setAlertaBanner(null)} className="text-white/70 hover:text-white text-lg font-bold px-2">✕</button>
          </div>
        )}

        <ScheduleGuard>
          {children}
        </ScheduleGuard>
      </main>
    </div>
  );
}
  

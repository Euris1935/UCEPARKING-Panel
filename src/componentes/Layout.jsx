

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { playBeep } from '../utils/audio';
import { useOrg } from '../contexts/OrgContext';
import { FaBell } from 'react-icons/fa';
import BarraLateral from './barraLateral';

export default function Layout({ children }) {
  const { orgId } = useOrg();
  const [alertaBanner, setAlertaBanner] = useState(null);
  const [stats, setStats] = useState({ total: 0, ocupadas: 0, reservadas: 0, libres: 0 });
  const alertaYaEnviada = useRef(false);
  const prevOcupadas = useRef(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    loadMonitorData();

    const channel = supabase
      .channel('global_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadMonitorData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMonitorData = async () => {
    try {
      const { data: estados } = await supabase.from('estado').select('id, nombre').eq('contexto', 'plaza');
      const { data: plazas } = await supabase.from('plaza').select('id_estado');

      if (!estados || !plazas) return;

      const getId = (name) => estados.find(e => e.nombre.trim().toUpperCase() === name.toUpperCase())?.id;
      const idOcupada = getId('Ocupada');
      const idReservada = getId('Reservada');
      const idLibre = getId('Libre');

      const total = plazas.length;
      const ocupadasNum = plazas.filter(p => p.id_estado === idOcupada).length;
      const reservadasNum = plazas.filter(p => p.id_estado === idReservada).length;
      const libresNum = plazas.filter(p => p.id_estado === idLibre || p.id_estado === null).length;

      // Alerta Sonora (Beep) si aumenta la ocupación
      if (!firstLoad.current && ocupadasNum > prevOcupadas.current) {
        playBeep();
      }
      
      prevOcupadas.current = ocupadasNum;
      firstLoad.current = false;

      setStats({ total, ocupadas: ocupadasNum, reservadas: reservadasNum, libres: libresNum });
    } catch (error) {
      console.error("Monitor Error:", error.message);
    }
  };

  // Monitor de alerta de capacidad
  useEffect(() => {
    if (stats.total === 0) return;
    const pct = Math.round(((stats.ocupadas + stats.reservadas) / stats.total) * 100);
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
        {/* Banner de Capacidad Global */}
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

        {children}
      </main>
    </div>
  );
}
  

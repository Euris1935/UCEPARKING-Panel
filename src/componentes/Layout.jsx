

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import BarraLateral from './barraLateral';
import { FaBell } from 'react-icons/fa';

export default function Layout({ children }) {
  const [alertaBanner, setAlertaBanner] = useState(null);
  const alertaYaEnviada = useRef(false);

  useEffect(() => {
    checkCapacidad();

    const channel = supabase
      .channel('layout_capacidad_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => checkCapacidad())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const checkCapacidad = async () => {
    try {
      const { data: estados } = await supabase.from('estado_plaza').select('*');
      const { data: plazas } = await supabase.from('plazas').select('id_estado');

      const getId = (name) => estados?.find(e => e.nombre_estado.trim().toUpperCase() === name.toUpperCase())?.id_estado;
      const idOcupada = getId('OCUPADA');
      const idReservada = getId('RESERVADA');
      const idLibre = getId('LIBRE');

      const total = plazas?.length || 0;
      if (total === 0) return;

      const ocupadas = plazas?.filter(p => p.id_estado === idOcupada).length || 0;
      const reservadas = plazas?.filter(p => p.id_estado === idReservada).length || 0;
      const libres = plazas?.filter(p => p.id_estado === idLibre || p.id_estado === null).length || 0;

      const pct = Math.round(((ocupadas + reservadas) / total) * 100);
      const savedSettings = localStorage.getItem('appSettings');
      const umbral = savedSettings ? parseInt(JSON.parse(savedSettings).alertaCapacidad) : 90;

      if (pct >= umbral) {
        setAlertaBanner({ pct, umbral, libres });
        if (!alertaYaEnviada.current) {
          alertaYaEnviada.current = true;
          supabase.from('notificaciones').insert([{
            Tipo: 'Alerta',
            Contenido: `⚠️ Alerta de capacidad: el parqueo está al ${pct}% de ocupación (umbral configurado: ${umbral}%). Plazas libres: ${libres}.`,
            Leida: false
          }]).then(({ error }) => { if (error) console.warn('Error alerta RF3:', error.message); });
        }
      } else {
        setAlertaBanner(null);
        alertaYaEnviada.current = false;
      }
    } catch (err) {
      console.error('Error check capacidad:', err.message);
    }
  };

  return (
    <div className="flex bg-uce-light min-h-screen">
      <BarraLateral />

      <main className="ml-64 flex-1 p-8 overflow-y-auto">
        {/* RF3: Banner de alerta de capacidad — visible en TODAS las páginas */}
        {alertaBanner && (
          <div className="mb-6 flex items-center gap-4 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg animate-pulse">
            <FaBell className="text-2xl shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm">⚠️ ALERTA DE CAPACIDAD — Parqueo al {alertaBanner.pct}%</p>
              <p className="text-xs opacity-90">Se superó el umbral configurado del {alertaBanner.umbral}%.
                Solo quedan <strong>{alertaBanner.libres}</strong> plaza(s) libre(s).
                Notificación registrada automáticamente.
              </p>
            </div>
            <button onClick={() => setAlertaBanner(null)} className="text-white/70 hover:text-white text-lg font-bold px-2">✕</button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

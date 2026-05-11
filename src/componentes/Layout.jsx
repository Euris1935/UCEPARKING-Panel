

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../contexts/OrgContext';
import { useUI } from '../contexts/UIContext';
import { FaBell, FaClock } from 'react-icons/fa';
import BarraLateral from './barraLateral';
import ScheduleGuard from './ScheduleGuard';

export default function Layout({ children }) {
  const { orgId } = useOrg();
  const { isSidebarFixed, isSidebarHovered } = useUI();
  const [alertaBanner, setAlertaBanner] = useState(null);
  const [stats, setStats] = useState({ total: 0, ocupadas: 0, reservadas: 0, asignadas: 0, libres: 0 });
  const alertaYaEnviada = useRef(false);
  const prevOcupadas = useRef(0);
  const prevReservadas = useRef(0);
  const prevAsignadas = useRef(0);
  const firstLoad = useRef(true);
  const [alertaEstanciaLarga, setAlertaEstanciaLarga] = useState([]);
  const estanciaAlertaEnviada = useRef(new Set()); // Set de id_registro ya notificados

  useEffect(() => {
    loadMonitorData();

    const channel = supabase
      .channel('global_monitor')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plaza' }, () => {
          loadMonitorData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMonitorData = async () => {
    try {
      // 1. Obtener estados de plazas de la tabla correcta (estado_plaza)
      const { data: estados } = await supabase.from('estado_plaza').select('id_estado, nombre');
      const ahoraISO = new Date().toISOString();
      const hoySoloFecha = ahoraISO.split('T')[0];

      // 1. Carga de datos paralela para el mapa de ocupación (igual que Dashboard)
      const [
        { data: rawPlazas },
        { data: asigData },
        { data: ticketsActivosData },
        { data: accesosActivosData },
        { data: reservasActivasData },
        { data: reservasZonasActivas }
      ] = await Promise.all([
        supabase.from('plaza').select('*, zona:id_zona(id_estado, estado_zona(nombre))').eq('organizacion_id', orgId),
        supabase.from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1).or(`fecha_fin.is.null,fecha_fin.gte.${hoySoloFecha}`),
        supabase.from('ticket').select('id_plaza_asignada').eq('organizacion_id', orgId).eq('id_estado', 1),
        supabase.from('acceso').select('id_plaza').eq('organizacion_id', orgId).is('salida_at', null),
        supabase.from('reserva').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1).lte('fecha_hora_inicio', ahoraISO).gte('fecha_hora_fin', ahoraISO),
        supabase.from('reserva_zona').select('id_zona').eq('organizacion_id', orgId).eq('id_estado', 1).lte('fecha_hora_inicio', ahoraISO).gte('fecha_hora_fin', ahoraISO)
      ]);

      if (!rawPlazas) return;

      // 2. Mapas de Compromiso Separados
      const mapaReservas = new Set();
      const mapaAsignaciones = new Set();
      const buffer15min = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      
      (reservasActivasData || []).forEach(res => { if (res.id_plaza) mapaReservas.add(res.id_plaza); });
      (asigData || []).forEach(asig => { if (asig.id_plaza) mapaAsignaciones.add(asig.id_plaza); });
      
      if (reservasZonasActivas?.length > 0) {
        reservasZonasActivas.forEach(rz => {
          // Bloqueo preventivo de 15 min para zonas
          if (new Date(rz.fecha_hora_inicio) <= new Date(Date.now() + 15 * 60 * 1000)) {
            rawPlazas.filter(p => p.id_zona === rz.id_zona).forEach(p => mapaReservas.add(p.id_plaza));
          }
        });
      }

      // 3. Crear Mapa de Ocupación Física (Solo vehículos reales: Tickets y Accesos)
      const mapaVehiculosFisicos = new Set();
      (accesosActivosData || []).forEach(acc => { if (acc.id_plaza) mapaVehiculosFisicos.add(acc.id_plaza); });
      (ticketsActivosData || []).forEach(tk => { if (tk.id_plaza_asignada) mapaVehiculosFisicos.add(tk.id_plaza_asignada); });

      // 4. Filtrar plazas de zonas ACTIVAS (ID 1)
      const plazasFiltradas = rawPlazas.filter(p => p.zona?.id_estado === 1);

      // 5. Conteo Final (No excluyentes para mantener visibilidad de compromiso)
      const total = plazasFiltradas.length;
      const ocupadasNum = plazasFiltradas.filter(p => mapaVehiculosFisicos.has(p.id_plaza)).length;
      const reservadasNum = plazasFiltradas.filter(p => p.id_estado === 3 || mapaReservas.has(p.id_plaza)).length;
      const asignadasNum = plazasFiltradas.filter(p => p.id_estado === 5 || mapaAsignaciones.has(p.id_plaza)).length;
      const libresNum = plazasFiltradas.filter(p => 
        p.id_estado === 1 && 
        !mapaVehiculosFisicos.has(p.id_plaza) && 
        !mapaReservas.has(p.id_plaza) && 
        !mapaAsignaciones.has(p.id_plaza)
      ).length;

      // 6. Detección de Conflictos (Vehículos en zonas con reserva inminente)
      const zonasConflictivas = [];
      if (reservasZonasActivas?.length > 0) {
        reservasZonasActivas.forEach(rz => {
          const tiempoParaInicio = (new Date(rz.fecha_hora_inicio) - new Date()) / 60000;
          if (tiempoParaInicio > 0 && tiempoParaInicio <= 15) {
            const hayVehiculos = plazasFiltradas.some(p => p.id_zona === rz.id_zona && mapaVehiculosFisicos.has(p.id_plaza));
            if (hayVehiculos) {
              zonasConflictivas.push(rz.zona?.nombre || 'Zona ' + rz.id_zona);
            }
          }
        });
      }

      if (zonasConflictivas.length > 0) {
        setAlertaBanner(`⚠️ ATENCIÓN: La(s) zona(s) [${zonasConflictivas.join(', ')}] tienen reservas en menos de 15 min y hay vehículos ocupándolas.`);
      } else {
        setAlertaBanner(null);
      }

      setStats({ total, ocupadas: ocupadasNum, reservadas: reservadasNum, asignadas: asignadasNum, libres: libresNum });
    } catch (error) {
      console.error("Monitor Error:", error.message);
    }
  };

  // ── Monitor de Estancia Larga (>16h) ── cubre acceso manual + tickets ──
  const checkEstanciaLarga = async () => {
    if (!orgId) return;
    try {
      const hace16h = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();

      const [
        { data: accesosLargos, error: err1 },
        { data: ticketsLargos, error: err2 }
      ] = await Promise.all([
        // 1. Accesos manuales sin salida y con más de 16h
        supabase.from('acceso')
          .select('id_registro, id_plaza, vehiculo:id_vehiculo(placa, id_persona)')
          .eq('organizacion_id', orgId)
          .is('salida_at', null)
          .lt('entrada_at', hace16h),
        // 2. Tickets de visitantes activos (id_estado=1) con más de 16h
        supabase.from('ticket')
          .select('id_ticket, id_plaza_asignada, placa_capturada')
          .eq('organizacion_id', orgId)
          .eq('id_estado', 1)
          .lt('fecha_hora_emision', hace16h)
      ]);

      if (err1) console.error('[EstanciaLarga] Error query acceso:', err1.message);
      if (err2) console.error('[EstanciaLarga] Error query ticket:', err2.message);

      // Normalizar ambas fuentes en una lista unificada
      const listaUnificada = [
        ...(accesosLargos || []).map(a => ({
          _key:       `a_${a.id_registro}`,
          _placa:     a.vehiculo?.placa || 'Sin placa',
          _idPlaza:   a.id_plaza,
          _idPersona: a.vehiculo?.id_persona || null,
          _tipo:      'Acceso Manual'
        })),
        ...(ticketsLargos || []).map(t => ({
          _key:       `t_${t.id_ticket}`,
          _placa:     t.placa_capturada || 'Sin placa',
          _idPlaza:   t.id_plaza_asignada,
          _idPersona: null,   // se busca por placa más abajo
          _tipo:      'Ticket',
          _placaRaw:  t.placa_capturada
        }))
      ];

      if (listaUnificada.length > 0) {
        setAlertaEstanciaLarga(listaUnificada);

        for (const item of listaUnificada) {
          if (estanciaAlertaEnviada.current.has(item._key)) continue;
          estanciaAlertaEnviada.current.add(item._key);

          const placa = item._placa;
          const plaza = item._idPlaza ? `#${item._idPlaza}` : '—';
          let idPersona = item._idPersona;

          // Para tickets, buscar el propietario por placa en la tabla vehiculo
          if (item._tipo === 'Ticket' && item._placaRaw) {
            const { data: veh } = await supabase
              .from('vehiculo')
              .select('id_persona')
              .ilike('placa', item._placaRaw)
              .eq('organizacion_id', orgId)
              .maybeSingle();
            idPersona = veh?.id_persona || null;
          }

          // Notificación 1 → Propietario (si está registrado)
          if (idPersona) {
            supabase.from('notificacion').insert([{
              id_persona:      idPersona,
              organizacion_id: orgId,
              contenido:       `⚠️ ALERTA DE ESTANCIA LARGA: Tu vehículo (${placa}) lleva más de 16 horas en el parqueo. Plaza: ${plaza}. Por favor retíralo o comunícate con nosotros.`,
              leida:           false
            }]).then(({ error }) => { if (error) console.warn('Error notif propietario estancia:', error.message); });
          }

          // Notificación 2 → Panel / Admin
          supabase.from('notificacion').insert([{
            organizacion_id: orgId,
            contenido:       `⚠️ ESTANCIA LARGA [${item._tipo}]: Vehículo ${placa} lleva más de 16h en plaza ${plaza}.${idPersona ? ' Notif. enviada al propietario.' : ' Propietario no registrado.'}`,
            leida:           false
          }]).then(({ error }) => { if (error) console.warn('Error notif panel estancia:', error.message); });
        }

        // Limpiar del Set los vehículos que ya salieron
        const keysActuales = new Set(listaUnificada.map(i => i._key));
        for (const key of estanciaAlertaEnviada.current) {
          if (!keysActuales.has(key)) estanciaAlertaEnviada.current.delete(key);
        }
      } else {
        setAlertaEstanciaLarga([]);
        estanciaAlertaEnviada.current.clear();
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
    <div className="flex bg-uce-light min-h-screen relative overflow-hidden"> 
      <BarraLateral />
      
      <main className={`${isSidebarFixed || isSidebarHovered ? 'ml-64' : 'ml-0 pl-10'} flex-1 p-8 overflow-y-auto relative transition-all duration-300`}>
        {/* Banner de Estancia Larga (azul) */}
        {alertaEstanciaLarga.length > 0 && (
          <div className="mb-4 flex items-start gap-4 bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg sticky top-0 z-50">
            <FaClock className="text-2xl shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">ALERTA DE ESTANCIA LARGA — {alertaEstanciaLarga.length} vehículo(s) con más de 16 horas</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {alertaEstanciaLarga.map(a => (
                  <span key={a._key} className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">
                    [{a._tipo}] Plaza #{a._idPlaza || '—'} — {a._placa}
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
  

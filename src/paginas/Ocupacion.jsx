import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaMapMarkerAlt, FaSync, FaWheelchair, FaCar, FaLock, FaUserTie, FaExclamationTriangle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_PLAZA, ESTADO_RESERVA, ESTADO_TICKET } from '../lib/constants';

// ─────────────────────────────────────────────────────────────
// CAMBIOS:
// - ticket NO tiene id_persona ni id_visitante
// - ticket SÍ tiene visitante_nombre, visitante_apellido (inline)
// - El SELECT de ticket fue corregido en consecuencia
// ─────────────────────────────────────────────────────────────

export default function Ocupacion() {
  const { orgId } = useOrg();
  const [plazas,           setPlazas]           = useState([]);
  const [zonas,            setZonas]            = useState([]);
  const [estadosCatalogo,  setEstadosCatalogo]  = useState([]);
  const [searchTerm,       setSearchTerm]       = useState('');
  const [loading,          setLoading]          = useState(true);
  const [isRefreshing,     setIsRefreshing]     = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [ocupacionInfo,    setOcupacionInfo]    = useState({});
  const [nivelFilter,      setNivelFilter]      = useState('all');

  useEffect(() => {
    if (orgId) {
      loadData();
      const channel = supabase.channel('realtime_occupancy')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza'     }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion'}, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zona'      }, loadData)
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setIsRefreshing(true);
    try {
      const [
        { data: estData },
        { data: zonasData },
      ] = await Promise.all([
        supabase.from('estado_plaza').select('id_estado, nombre'),
        supabase.from('zona').select('*, estado_zona:id_estado(nombre)').eq('organizacion_id', orgId).order('nombre'),
      ]);

      setEstadosCatalogo(estData?.map(e => ({ id: e.id_estado, nombre: e.nombre })) || []);

      const zonasVivas = (zonasData || []).filter(z => z.estado_zona?.nombre !== 'Inactiva');
      setZonas(zonasVivas);

      const idsZonasVivas = zonasVivas.map(z => z.id_zona);
      if (idsZonasVivas.length === 0) {
        setPlazas([]);
        setOcupacionInfo({});
        return;
      }

      const [
        { data: plazasData },
        { data: accesosActivos },
        { data: reservasActivas },
        { data: reservasZonas },
        { data: ticketsActivos },
        { data: asigData }
      ] = await Promise.all([
        supabase.from('plaza').select('*, id_tipo').in('id_zona', idsZonasVivas).order('numero_plaza'),
        supabase.from('acceso')
          .select('id_plaza, vehiculo:id_vehiculo(placa, persona:id_persona(nombre, apellido))')
          .eq('organizacion_id', orgId)
          .is('salida_at', null),
        supabase.from('reserva')
          .select('id_plaza, persona:id_persona(nombre, apellido)')
          .eq('organizacion_id', orgId)
          .eq('id_estado', ESTADO_RESERVA.ACTIVA)
          .lte('fecha_hora_inicio', new Date().toISOString())
          .gte('fecha_hora_fin', new Date().toISOString()),
        supabase.from('reserva_zona')
          .select('*, tipo:tipo_reserva_zona!id_tipo(nombre), persona:id_persona(nombre, apellido)')
          .eq('organizacion_id', orgId)
          .eq('id_estado', ESTADO_RESERVA.ACTIVA)
          .lte('fecha_hora_inicio', new Date().toISOString())
          .gte('fecha_hora_fin', new Date().toISOString()),
        // CAMBIO: ticket no tiene id_persona ni id_visitante
        // Usamos visitante_nombre y visitante_apellido directamente
        supabase.from('ticket')
          .select('id_plaza_asignada, placa_capturada, visitante_nombre, visitante_apellido')
          .eq('organizacion_id', orgId)
          .eq('id_estado', ESTADO_TICKET.ACTIVO),
        supabase.from('asignacion')
          .select('id_plaza, empleado:id_empleado(persona:id_persona(nombre, apellido))')
          .eq('organizacion_id', orgId)
          .eq('id_estado', 1)
          .or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString().split('T')[0]}`)
      ]);

      const mapaOcupacion = {};

      // Accesos manuales
      (accesosActivos || []).forEach(acc => {
        if (acc.id_plaza) {
          mapaOcupacion[acc.id_plaza] = {
            type:   'acceso',
            placa:  acc.vehiculo?.placa,
            nombre: `${acc.vehiculo?.persona?.nombre || 'Visitante'} ${acc.vehiculo?.persona?.apellido || ''}`.trim()
          };
        }
      });

      // Reservas directas
      (reservasActivas || []).forEach(res => {
        if (res.id_plaza) {
          mapaOcupacion[res.id_plaza] = {
            type:   'reserva',
            nombre: `${res.persona?.nombre || ''} ${res.persona?.apellido || ''}`.trim()
          };
        }
      });

      // Reservas de zona/grupal
      (reservasZonas || []).forEach(rz => {
        if (rz.es_reserva_grupal && rz.ids_plazas_grupal?.length > 0) {
          rz.ids_plazas_grupal.forEach(pid => {
            if (!mapaOcupacion[pid]) {
              mapaOcupacion[pid] = {
                type:   'reserva_zona',
                nombre: `GRUPO: ${rz.persona ? `${rz.persona.nombre} ${rz.persona.apellido}` : 'Sistema'}`
              };
            }
          });
        } else {
          (plazasData || []).filter(p => p.id_zona === rz.id_zona).forEach(p => {
            if (!mapaOcupacion[p.id_plaza]) {
              mapaOcupacion[p.id_plaza] = {
                type:   'reserva_zona',
                nombre: `ZONA RESERVADA: ${rz.tipo?.nombre || 'General'}`
              };
            }
          });
        }
      });

      // CAMBIO: tickets — nombre desde visitante_nombre/apellido inline
      (ticketsActivos || []).forEach(tk => {
        if (tk.id_plaza_asignada) {
          mapaOcupacion[tk.id_plaza_asignada] = {
            type:   'ticket',
            nombre: `${tk.visitante_nombre || ''} ${tk.visitante_apellido || ''}`.trim() || 'Visitante',
            placa:  tk.placa_capturada
          };
        }
      });

      // Asignaciones fijas
      (asigData || []).forEach(asig => {
        if (asig.id_plaza) {
          mapaOcupacion[asig.id_plaza] = {
            type:   'asignacion',
            nombre: `${asig.empleado?.persona?.nombre || ''} ${asig.empleado?.persona?.apellido || ''}`.trim()
          };
        }
      });

      // Enriquecer plazas con estado derivado
      const plazasCompletas = (plazasData || []).map(p => {
        const z        = (zonasData || []).find(zona => zona.id_zona === p.id_zona);
        const estZona  = z?.estado_zona?.nombre || '';
        const estadoBase = (estData || []).find(e => e.id_estado === p.id_estado)?.nombre.toUpperCase() || 'LIBRE';

        if (estZona === 'Cerrada Temporalmente') return { ...p, Nombre_Estado_Rel: 'CERRADA',       _zonaBloqueada: true };
        if (estZona === 'En Mantenimiento')       return { ...p, Nombre_Estado_Rel: 'MANTENIMIENTO', _zonaBloqueada: true };

        const info = mapaOcupacion[p.id_plaza];
        if (info && estadoBase === 'LIBRE') {
          if (info.type === 'acceso' || info.type === 'ticket')                            return { ...p, Nombre_Estado_Rel: 'OCUPADA' };
          if (info.type === 'reserva' || info.type === 'reserva_zona')                    return { ...p, Nombre_Estado_Rel: 'RESERVADA' };
          if (info.type === 'asignacion')                                                  return { ...p, Nombre_Estado_Rel: 'ASIGNADO' };
        }

        return { ...p, Nombre_Estado_Rel: estadoBase };
      });

      setPlazas(plazasCompletas);
      setOcupacionInfo(mapaOcupacion);

      // Obtener currentPersonaId
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
        setCurrentPersonaId(ud?.id_persona);
      }
    } catch (error) {
      console.error('Error loadData Ocupacion:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const getEstadoId = (nombre) =>
    estadosCatalogo.find(e => e.nombre.trim().toUpperCase() === nombre.toUpperCase())?.id;

  const handleRegistrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    await registrarLog({
      tipo_nombre,
      descripcion,
      id_persona:      currentPersonaId,
      organizacion_id: orgId,
      id_plaza:        idPlaza,
      origen:          'Panel Web - Control de Ocupación'
    });
  };

  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);
    if (!idNuevoEstado) { console.error('Estado no encontrado:', nombreNuevoEstado); return; }

    const plazaActual = plazas.find(p => p.id_plaza === idPlaza);
    const estadoAnterior = plazaActual?.Nombre_Estado_Rel || 'DESCONOCIDO';

    setPlazas(prev => prev.map(p =>
      p.id_plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado.toUpperCase(), id_estado: idNuevoEstado } : p
    ));

    const { error } = await supabase
      .from('plaza')
      .update({ id_estado: idNuevoEstado })
      .eq('id_plaza', idPlaza);

    if (error) {
      Swal.fire('Error', error.message, 'error');
      loadData();
    } else {
      if (['LIBRE', 'MANTENIMIENTO', 'FUERA DE SERVICIO'].includes(nombreNuevoEstado.toUpperCase())) {
        await supabase
          .from('acceso')
          .update({ salida_at: new Date().toISOString() })
          .eq('id_plaza', idPlaza)
          .is('salida_at', null);
      }
      const numPlaza = plazaActual?.numero_plaza || `ID-${idPlaza}`;
      await handleRegistrarLog(EVENT_TYPES.CAMBIO_ESTADO, `Cambio de estado manual: de ${estadoAnterior} a ${nombreNuevoEstado.toUpperCase()}.`, idPlaza);
      loadData();
    }
  };

  const toggleOccupancy = (plaza) => {
    const estadoActual = plaza.Nombre_Estado_Rel;
    const esAsignacionFija = ocupacionInfo[plaza.id_plaza]?.type === 'asignacion';

    if (['ASIGNADA', 'ASIGNADO', 'RESERVADA'].includes(estadoActual) || esAsignacionFija) {
      const infoActual = ocupacionInfo[plaza.id_plaza];
      const ocupanteText = infoActual ? `(${infoActual.nombre})` : '(Sin registros)';
      const esAsig = estadoActual.startsWith('ASIGNAD') || esAsignacionFija;
      Swal.fire({
        title: `Liberar Plaza ${esAsig ? 'Asignada' : 'Reservada'}`,
        html: `Atención: Esta plaza está <b>${esAsig ? 'asignada a un empleado' : 'reservada'}</b> ${ocupanteText}.<br><br>¿Deseas forzar su liberación a LIBRE?`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#ef4444', confirmButtonText: 'Sí, Forzar Liberación', cancelButtonText: 'Cancelar'
      }).then(r => { if (r.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); });
      return;
    }

    if (['MANTENIMIENTO', 'FUERA DE SERVICIO'].includes(estadoActual)) {
      Swal.fire({ title: '¿Liberar plaza?', text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, liberar' })
        .then(r => { if (r.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); });
      return;
    }

    if (estadoActual === 'LIBRE') {
      Swal.fire({ title: 'Acción bloqueada', text: 'Para ocupar la plaza, emite un Ticket o registra una Entrada en el Acceso Manual.', icon: 'info', confirmButtonColor: '#3b82f6', confirmButtonText: 'Entendido' });
      return;
    }

    if (estadoActual === 'OCUPADA') {
      const infoActual = ocupacionInfo[plaza.id_plaza];
      if (!infoActual) {
        Swal.fire({ title: 'Inconsistencia Detectada', text: 'Esta plaza dice estar OCUPADA pero no detectamos vehículo ni ticket. ¿Restablecer a LIBRE?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, restablecer', cancelButtonText: 'Cancelar' })
          .then(r => { if (r.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); });
        return;
      }
      Swal.fire({
        title: 'Plaza en Uso (Advertencia)',
        html: `Esta plaza tiene un vehículo (<b>${infoActual.placa}</b>) registrado dentro.<br><br>Normalmente debes darle Salida desde <b>Tickets</b> o <b>Acceso Manual</b>. ¿Forzar limpieza?`,
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444',
        confirmButtonText: 'Forzar Salida (Limpiar Error)', cancelButtonText: 'Dejarlo así'
      }).then(async r => {
        if (r.isConfirmed) {
          const { error: updErr } = await supabase.from('acceso').update({ salida_at: new Date().toISOString() }).eq('id_plaza', plaza.id_plaza).is('salida_at', null);
          if (updErr) Swal.fire('Error', updErr.message, 'error');
          else { changeStatus(plaza.id_plaza, 'LIBRE'); Swal.fire('Limpieza Exitosa', 'El registro fantasma fue cerrado.', 'success'); loadData(); }
        }
      });
      return;
    }
  };

  const getSlotStyle = (estado, idPlaza, forcingStatus = null, idTipo = null) => {
    const statusToUse = (forcingStatus || estado)?.toUpperCase();
    
    // Pintura del asfalto suave: azul pálido si es discapacitado, gris suave por defecto
    let borderColor = idTipo === 3 ? 'border-blue-300' : 'border-gray-300';
    let base = `relative flex flex-col items-center justify-end text-center w-full max-w-[130px] mx-auto aspect-[1/1.6] border-x-[3px] border-t-[3px] border-b-0 ${borderColor} transition-all cursor-pointer overflow-hidden pb-2 rounded-t shadow-sm group `;

    if (idTipo === 3) {
      base += "bg-blue-50/50 hover:bg-blue-100/50 ";
    } else {
      base += "bg-white/60 hover:bg-white/90 ";
    }

    switch (statusToUse) {
      case 'LIBRE':        return base; 
      case 'OCUPADA':      return base + "bg-red-50/40";
      case 'RESERVADA':    return base + "bg-yellow-50/40";
      case 'ASIGNADA':
      case 'ASIGNADO':     return base + "bg-purple-50/40";
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return base + "opacity-80 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(249,115,22,0.05)_10px,rgba(249,115,22,0.05)_20px)] border-orange-300 rounded-b border-b-[3px]";
      case 'CERRADA':      return base + "opacity-40 grayscale";
      default:             return base;
    }
  };

  const stats = {
    libres:        plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE' && !ocupacionInfo[p.id_plaza]).length,
    asignadas:     plazas.filter(p => p.Nombre_Estado_Rel.startsWith('ASIGNAD') || ocupacionInfo[p.id_plaza]?.type === 'asignacion').length,
    ocupadas:      plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA' && ocupacionInfo[p.id_plaza]?.type !== 'asignacion').length,
    reservadas:    plazas.filter(p => (p.Nombre_Estado_Rel === 'RESERVADA' || p.Nombre_Estado_Rel === 'RESERVADO') && ocupacionInfo[p.id_plaza]?.type !== 'asignacion').length,
    mantenimiento: plazas.filter(p => ['MANTENIMIENTO', 'FUERA DE SERVICIO', 'EN MANTENIMIENTO'].includes(p.Nombre_Estado_Rel)).length
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Control de Ocupación</h2>
        <p className="text-gray-500">Vista operativa en tiempo real.</p>
      </header>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col xl:flex-row gap-4 items-center justify-between sticky top-0 z-10">
        <div className="relative w-full xl:w-96">
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por plaza, placa, persona o zona..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full xl:w-auto">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Nivel:</label>
          <select 
            className="flex-1 xl:w-48 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-primary outline-none font-semibold text-gray-700 transition-all"
            value={nivelFilter}
            onChange={(e) => setNivelFilter(e.target.value)}
          >
            <option value="all">Todos los niveles</option>
            <option value="-2">Sótano 2</option>
            <option value="-1">Sótano 1</option>
            <option value="0">Planta baja</option>
            <option value="1">Piso 1</option>
            <option value="2">Piso 2</option>
            <option value="3">Piso 3</option>
            <option value="4">Piso 4</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-4 text-sm font-semibold justify-center">
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Libres: {stats.libres}</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Ocupadas: {stats.ocupadas}</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400"></div> Reservadas: {stats.reservadas}</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-purple-600"></div> Asignadas: {stats.asignadas}</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mant.: {stats.mantenimiento}</span>
          <button onClick={loadData} disabled={isRefreshing} className="ml-2 text-primary hover:bg-blue-50 p-2 rounded-full transition disabled:opacity-50">
            <FaSync className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? <p className="text-center py-10">Cargando...</p> : (
        <div className="space-y-8">
          {zonas
            .filter(z => nivelFilter === 'all' || z.nivel_piso === parseInt(nivelFilter))
            .map(zona => {
            const termLower = searchTerm.toLowerCase();
            const matchZonaBusqueda = zona.nombre.toLowerCase().includes(termLower);

            const plazasDeZona = plazas.filter(p => {
              if (p.id_zona !== zona.id_zona) return false;
              if (!termLower) return true;
              if (matchZonaBusqueda) return true;
              
              const info = ocupacionInfo[p.id_plaza];
              const matchNum = p.numero_plaza.toLowerCase().includes(termLower);
              const matchPlaca = info?.placa?.toLowerCase().includes(termLower);
              const matchPersona = info?.nombre?.toLowerCase().includes(termLower);
              
              return matchNum || matchPlaca || matchPersona;
            });

            if (termLower && plazasDeZona.length === 0) return null;

            const estZona = zonas.find(z => z.id_zona === zona.id_zona)?.estado_zona?.nombre || '';
            const isForcedState = estZona === 'Cerrada Temporalmente' || estZona === 'En Mantenimiento';
            const forcingStatus = estZona === 'Cerrada Temporalmente' ? 'CERRADA' : (estZona === 'En Mantenimiento' ? 'MANTENIMIENTO' : null);

            return (
              <section key={zona.id_zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <FaMapMarkerAlt className="text-primary text-xl" />
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 leading-none">{zona.nombre}</h3>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                        {zona.nivel_piso === 0 ? 'Planta baja' : (zona.nivel_piso < 0 ? `Sótano ${Math.abs(zona.nivel_piso)}` : `Piso ${zona.nivel_piso}`)}
                        {zona.direccion && ` • ${zona.direccion}`}
                      </span>
                    </div>
                  </div>
                  {isForcedState && (
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${estZona.includes('Mante') ? 'bg-orange-500 text-white' : 'bg-gray-500 text-white'}`}>
                      Zona {estZona.includes('Mante') ? 'en Mantenimiento' : 'Cerrada'}
                    </span>
                  )}
                </div>

                <div className="bg-gray-100 p-8 pt-10 rounded-2xl shadow-inner relative border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-x-4 gap-y-12 place-items-center relative z-10 w-full">
                  {plazasDeZona.map(plaza => {
                    const isOcupada = plaza.Nombre_Estado_Rel === 'OCUPADA';
                    const isReservada = plaza.Nombre_Estado_Rel === 'RESERVADA' || plaza.Nombre_Estado_Rel === 'RESERVADO';
                    const isAsignada = plaza.Nombre_Estado_Rel.startsWith('ASIGNAD') || ocupacionInfo[plaza.id_plaza]?.type === 'asignacion';
                    const isMantenimiento = ['MANTENIMIENTO', 'FUERA DE SERVICIO', 'EN MANTENIMIENTO'].includes(plaza.Nombre_Estado_Rel);
                    const info = ocupacionInfo[plaza.id_plaza];

                    return (
                      <div
                        key={plaza.id_plaza}
                        className={getSlotStyle(plaza.Nombre_Estado_Rel, plaza.id_plaza, forcingStatus, plaza.id_tipo)}
                        onClick={() => {
                          if (isForcedState) {
                            Swal.fire({ title: 'Zona Bloqueada', text: `Esta plaza pertenece a una zona en estado "${estZona}".`, icon: 'info' });
                            return;
                          }
                          toggleOccupancy(plaza);
                        }}
                      >
                        {/* Número pintado en el asfalto (fondo) */}
                        <span className="absolute top-3 font-bold text-[2rem] text-gray-300 select-none pointer-events-none group-hover:text-gray-400 transition-colors">{plaza.numero_plaza}</span>

                        {/* Icono de Discapacitado en el suelo */}
                        {plaza.id_tipo === 3 && (
                          <FaWheelchair className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-6xl text-blue-200 pointer-events-none" />
                        )}

                        {/* Elementos 3D / Superpuestos */}
                        {isOcupada && (
                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[20%] text-5xl md:text-6xl text-red-500 drop-shadow-md z-10 group-hover:scale-105 transition-transform">
                             <FaCar />
                          </div>
                        )}
                        
                        {isReservada && !isOcupada && (
                          <FaLock className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-yellow-500 drop-shadow-sm z-10 group-hover:scale-110 transition-transform" />
                        )}

                        {isAsignada && !isOcupada && !isReservada && (
                          <FaUserTie className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-purple-400 drop-shadow-sm z-10 opacity-80" />
                        )}

                        {isMantenimiento && (
                          <FaExclamationTriangle className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-orange-400 drop-shadow-sm z-10 opacity-70" />
                        )}

                        {/* Información flotante (Placa / Nombre) */}
                        <div className="relative z-20 w-full mt-auto mb-1 flex flex-col justify-end min-h-[30px]">
                          {!isForcedState && info && (
                            <div className={`mt-2 text-center text-[10px] md:text-xs uppercase font-bold tracking-tight rounded-[6px] px-1.5 py-0.5 w-[90%] mx-auto shadow-sm border ${
                              isOcupada ? 'bg-white text-red-600 border-red-200' :
                              isReservada ? 'bg-white text-yellow-700 border-yellow-200' :
                              'bg-white text-purple-600 border-purple-200'
                            }`}>
                              {isOcupada && info.placa ? (
                                <span className="block truncate font-mono tracking-widest">{info.placa}</span>
                              ) : (
                                <span className="block truncate text-[9px] leading-tight py-0.5 text-gray-700">{info.nombre}</span>
                              )}
                            </div>
                          )}
                          {!info && !isForcedState && !isMantenimiento && (
                            <div className="mt-2 text-center text-[9px] uppercase font-bold tracking-widest rounded px-1 text-gray-400 pointer-events-none group-hover:text-gray-500 transition-colors">
                              LIBRE
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
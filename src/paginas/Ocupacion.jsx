import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaMapMarkerAlt, FaSync, FaWheelchair } from 'react-icons/fa';
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
          .eq('id_estado', ESTADO_RESERVA.ACTIVA),
        supabase.from('reserva_zona')
          .select('*, tipo:tipo_reserva_zona!id_tipo(nombre), persona:id_persona(nombre, apellido)')
          .eq('organizacion_id', orgId)
          .eq('id_estado', ESTADO_RESERVA.ACTIVA),
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

  const getCardColor = (estado, idPlaza, forcingStatus = null, idTipo = null) => {
    const statusToUse = (forcingStatus || estado)?.toUpperCase();
    const info = ocupacionInfo[idPlaza];
    if (idTipo === 3) {
      if (statusToUse === 'OCUPADA') return 'bg-blue-600 border-blue-700 shadow-md text-white';
      if (statusToUse === 'RESERVADA' || statusToUse === 'RESERVADO') return 'bg-blue-100 border-blue-300 shadow-sm';
      return 'bg-blue-50 border-blue-200 hover:border-blue-400 shadow-sm';
    }
    if (!forcingStatus && info?.type === 'asignacion') return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';
    switch (statusToUse) {
      case 'LIBRE':        return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
      case 'OCUPADA':      return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
      case 'RESERVADA':    return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
      case 'ASIGNADA':
      case 'ASIGNADO':     return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
      case 'CERRADA':      return 'bg-gray-100 border-gray-200 shadow-sm';
      default:             return 'bg-gray-50 border-gray-200';
    }
  };

  const getBadgeColor = (estado, idPlaza, forcingStatus = null, idTipo = null) => {
    const statusToUse = (forcingStatus || estado)?.toUpperCase();
    if (idTipo === 3) {
      if (statusToUse === 'OCUPADA') return 'text-blue-100 bg-blue-800/50';
      return 'text-blue-700 bg-blue-100';
    }
    const info = ocupacionInfo[idPlaza];
    if (!forcingStatus && info?.type === 'asignacion') return 'text-purple-800 bg-purple-200';
    switch (statusToUse) {
      case 'LIBRE':        return 'text-green-700 bg-green-200';
      case 'OCUPADA':      return 'text-red-700 bg-red-200';
      case 'RESERVADA':    return 'text-yellow-800 bg-yellow-200';
      case 'ASIGNADA':
      case 'ASIGNADO':     return 'text-purple-800 bg-purple-200';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'text-orange-800 bg-orange-200';
      case 'CERRADA':      return 'text-gray-600 bg-gray-200';
      default:             return 'text-gray-700 bg-gray-200';
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
          <input
            type="text" placeholder="Buscar plaza..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          />
          <FaSearch className="absolute left-3 top-3 text-gray-400" />
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
          {zonas.map(zona => {
            const plazasDeZona = plazas.filter(p =>
              p.id_zona === zona.id_zona &&
              p.numero_plaza.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (searchTerm && plazasDeZona.length === 0) return null;

            const estZona = zonas.find(z => z.id_zona === zona.id_zona)?.estado_zona?.nombre || '';
            const isForcedState = estZona === 'Cerrada Temporalmente' || estZona === 'En Mantenimiento';
            const forcingStatus = estZona === 'Cerrada Temporalmente' ? 'CERRADA' : (estZona === 'En Mantenimiento' ? 'MANTENIMIENTO' : null);

            return (
              <section key={zona.id_zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <FaMapMarkerAlt className="text-primary text-xl" />
                    <h3 className="text-xl font-bold text-gray-800">{zona.nombre}</h3>
                  </div>
                  {isForcedState && (
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${estZona.includes('Mante') ? 'bg-orange-500 text-white' : 'bg-gray-500 text-white'}`}>
                      Zona {estZona.includes('Mante') ? 'en Mantenimiento' : 'Cerrada'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {plazasDeZona.map(plaza => (
                    <div
                      key={plaza.id_plaza}
                      className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel, plaza.id_plaza, forcingStatus, plaza.id_tipo)}`}
                      onClick={() => {
                        if (isForcedState) {
                          Swal.fire({ title: 'Zona Bloqueada', text: `Esta plaza pertenece a una zona en estado "${estZona}".`, icon: 'info' });
                          return;
                        }
                        toggleOccupancy(plaza);
                      }}
                    >
                      {plaza.id_tipo === 3 && (
                        <FaWheelchair className={`absolute top-2 right-2 text-lg ${plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-blue-100' : 'text-blue-500'}`} />
                      )}

                      <h4 className={`font-bold text-xl ${plaza.id_tipo === 3 && plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-white' : 'text-gray-800'}`}>
                        {plaza.numero_plaza}
                      </h4>
                      <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel, plaza.id_plaza, forcingStatus, plaza.id_tipo)}`}>
                        {forcingStatus || (ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' ? 'ASIGNADA' : plaza.Nombre_Estado_Rel)}
                      </span>

                      {/* Mostrar info del ocupante */}
                      {!isForcedState &&
                        ['OCUPADA', 'RESERVADA', 'RESERVADO', 'ASIGNADA', 'ASIGNADO'].includes(plaza.Nombre_Estado_Rel) &&
                        ocupacionInfo[plaza.id_plaza] && (
                          <div className={`mt-1 text-[9px] leading-tight ${
                            ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' || plaza.Nombre_Estado_Rel.startsWith('ASIGNAD') ? 'text-purple-800' :
                            plaza.id_tipo === 3 && plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-blue-50' :
                            plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-red-700' :
                            (plaza.Nombre_Estado_Rel === 'RESERVADA' || plaza.Nombre_Estado_Rel === 'RESERVADO') ? 'text-yellow-800' : 'text-purple-800'
                          }`}>
                            {plaza.Nombre_Estado_Rel === 'OCUPADA' && ocupacionInfo[plaza.id_plaza].placa && (
                              <div className="font-mono font-bold">{ocupacionInfo[plaza.id_plaza].placa}</div>
                            )}
                            <div className="text-[8px] opacity-80 truncate max-w-[90px]">
                              {ocupacionInfo[plaza.id_plaza].nombre}
                            </div>
                          </div>
                        )
                      }
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
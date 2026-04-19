import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaClock, FaExclamationTriangle, FaMapMarkerAlt, FaSync } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';

export default function Ocupacion() {
  const { orgId } = useOrg();
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [estadosCatalogo, setEstadosCatalogo] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  // Mapa de plaza → info del vehículo/persona que la ocupa
  const [ocupacionInfo, setOcupacionInfo] = useState({});

  useEffect(() => {
    // Obtener persona_id del usuario activo para los logs
    const getCurrentPersona = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('usuario')
          .select('id_persona')
          .eq('id', user.id)
          .single();
        if (data) setCurrentPersonaId(data.id_persona);
      }
    };
    getCurrentPersona();
    loadData();

    // Suscripción tiempo real a cambios de plaza, asignación y ZONA
    const channel = supabase.channel('realtime_ocupacion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: estData } = await supabase.from('estado_plaza').select('id_estado, nombre');
      setEstadosCatalogo(estData?.map(e => ({ id: e.id_estado, nombre: e.nombre })) || []);

      const { data: zonasData } = await supabase
        .from('zona')
        .select('*, estado_zona(nombre)')
        .order('nombre');
      
      // Filtrar zonas Inactivas pero PERMITIR Cerrada Temporalmente y En Mantenimiento
      const zonasVivas = (zonasData || []).filter(z => {
        const est = z.estado_zona?.nombre || '';
        return est !== 'Inactiva';
      });
      setZonas(zonasVivas);

      const idsZonasVivas = zonasVivas.map(z => z.id_zona);
      const { data: plazasData } = await supabase
        .from('plaza')
        .select('*')
        .in('id_zona', idsZonasVivas)
        .order('numero_plaza');

      let plazasCompletas = (plazasData || []).map(p => {
        const estadoObj = (estData || []).find(e => e.id_estado === p.id_estado);
        return {
          ...p,
          Nombre_Estado_Rel: estadoObj ? estadoObj.nombre.toUpperCase() : 'LIBRE'
        };
      });

      // Info de quién ocupa/reserva/tiene asignada cada plaza
      const mapaOcupacion = {};

      // 1. OCUPACIÓN (Accesos activos)
      const { data: accesosActivos } = await supabase
        .from('acceso')
        .select(`
          id_plaza,
          vehiculo (
            placa,
            persona ( nombre, apellido )
          )
        `)
        .is('salida_at', null);
      
      (accesosActivos || []).forEach(acc => {
        if (acc.id_plaza && acc.vehiculo) {
          mapaOcupacion[acc.id_plaza] = {
            type: 'acceso',
            placa: acc.vehiculo.placa,
            nombre: `${acc.vehiculo.persona?.nombre || 'Visitante'} ${acc.vehiculo.persona?.apellido || ''}`.trim()
          };
        }
      });

      // 2. RESERVAS (Activas y Autocaducidad Global)
      const { data: erData } = await supabase.from('estado_reserva').select('id_estado, nombre');
      const idResActiva = erData?.find(e => e.nombre === 'Activa')?.id_estado || 1;
      const idEstCompletadoRes = erData?.find(e => e.nombre === 'Completada')?.id_estado || 3;

      const { data: todasActivas } = await supabase
        .from('reserva')
        .select(`
          id_reserva, id_plaza, fecha_hora_inicio, fecha_hora_fin, id_persona, id_vehiculo,
          vehiculo ( placa )
        `)
        .eq('id_estado', idResActiva);
      
      const resData = (todasActivas || []);

      if (resData.length > 0) {
          const pIdsRes = resData.map(r => r.id_persona).filter(Boolean);
          const { data: resPersonas } = await supabase.from('persona').select('id_persona, nombre, apellido').in('id_persona', pIdsRes);
          
          resData.forEach(res => {
             const p = resPersonas?.find(x => String(x.id_persona) === String(res.id_persona));
             if (p && res.id_plaza) {
                mapaOcupacion[res.id_plaza] = {
                   ...mapaOcupacion[res.id_plaza],
                   type: 'reserva',
                   nombre: `${p.nombre} ${p.apellido}`.trim(),
                   placa: res.vehiculo?.placa || null
                };
             }
          });
      }

      // 2.5 RESERVAS POR ZONA
      const { data: reservasZonasActivas } = await supabase
        .from('reserva_zona')
        .select(`
          id_reserva_zona, 
          id_zona, 
          tipo:tipo_reserva_zona ( nombre ),
          persona (nombre, apellido)
        `)
        .eq('id_estado', idResActiva);

      if (reservasZonasActivas && reservasZonasActivas.length > 0) {
        reservasZonasActivas.forEach(rz => {
           // Encontrar todas las plazas que pertenecen a esta zona
           plazasCompletas.filter(p => p.id_zona === rz.id_zona).forEach(p => {
              // Solo sobreescribimos si no hay una reserva individual (que es más específica)
              if (!mapaOcupacion[p.id_plaza]) {
                mapaOcupacion[p.id_plaza] = {
                  type: 'reserva_zona',
                  nombre: `ZONA RESERVADA: ${rz.tipo?.nombre || 'General'}`,
                  persona: rz.persona ? `${rz.persona.nombre} ${rz.persona.apellido}` : 'Sistema',
                  placa: 'RESERVA GRUPAL'
                };
              }
           });
        });
      }

      // 3. ASIGNACIONES (Fijas y Activas)
      const { data: asigData } = await supabase.from('asignacion')
         .select('id_plaza, id_empleado, id_vehiculo, vehiculo(placa)')
         .eq('id_estado', 1)
         .or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString().split('T')[0]}`);
         
      if (asigData && asigData.length > 0) {
          const empIds = asigData.map(a => a.id_empleado);
          const { data: empPersonas } = await supabase
            .from('empleado')
            .select('id_empleado, id_persona, persona(nombre, apellido)')
            .in('id_empleado', empIds);
          
          asigData.forEach(asig => {
             const emp = empPersonas?.find(x => x.id_empleado === asig.id_empleado);
             if (emp?.persona && asig.id_plaza) {
                mapaOcupacion[asig.id_plaza] = {
                   ...mapaOcupacion[asig.id_plaza],
                   type: 'asignacion',
                   nombre: `${emp.persona.nombre} ${emp.persona.apellido}`.trim(),
                   placa: asig.vehiculo?.placa || null
                };
             }
          });
      }

      // 4. SOBRESCRITURA VISUAL SEGÚN MAPA Y ESTADO DE ZONA
      plazasCompletas = plazasCompletas.map(p => {
         const z = (zonasData || []).find(zona => zona.id_zona === p.id_zona);
         const estZona = z?.estado_zona?.nombre || '';
         
         // Prioridad 1: Zona Cerrada o en Mantenimiento (Override total)
         if (estZona === 'Cerrada Temporalmente') {
           return { ...p, Nombre_Estado_Rel: 'CERRADA', _zonaBloqueada: true };
         }
         if (estZona === 'En Mantenimiento') {
           return { ...p, Nombre_Estado_Rel: 'MANTENIMIENTO', _zonaBloqueada: true };
         }

         // Si la zona es Activa, nos aseguramos de no mostrar estados de bloqueo administrativo "huérfanos"
         if (estZona === 'Activa' && (p.Nombre_Estado_Rel === 'MANTENIMIENTO' || p.Nombre_Estado_Rel === 'CERRADA')) {
           return { ...p, Nombre_Estado_Rel: 'LIBRE' };
         }

         // Prioridad 2: Mapa de ocupación (Accesos, Reservas, Asignaciones)
         const info = mapaOcupacion[p.id_plaza];
         if (!info || p.Nombre_Estado_Rel !== 'LIBRE') return p;
         
         if (info.type === 'acceso')     return { ...p, Nombre_Estado_Rel: 'OCUPADA' };
         if (info.type === 'reserva')    return { ...p, Nombre_Estado_Rel: 'RESERVADA' };
         if (info.type === 'asignacion') return { ...p, Nombre_Estado_Rel: 'ASIGNADO' };
         
         return p;
      });

      setPlazas(plazasCompletas);
      setOcupacionInfo(mapaOcupacion);
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); setIsRefreshing(false); }
  };

  const getEstadoId = (nombre) => {
    return estadosCatalogo.find(e => e.nombre.trim().toUpperCase() === nombre.toUpperCase())?.id;
  };

  // Registra un evento en la tabla `evento`
  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Control de Ocupación').maybeSingle();
      await supabase.from('evento').insert([{
        fecha_hora: new Date().toISOString(),
        descripcion: descripcion,
        id_plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo: te?.id_tipo || null,
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (err) {
      console.warn('Error registrando log:', err.message);
    }
  };


  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);
    if (!idNuevoEstado) {
      console.error("Estado no encontrado en catálogo:", nombreNuevoEstado);
      return;
    }

    const plazaActual = plazas.find(p => p.id_plaza === idPlaza);
    const estadoAnterior = plazaActual?.Nombre_Estado_Rel || 'DESCONOCIDO';

    setPlazas(prev => prev.map(p => p.id_plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado.toUpperCase(), id_estado: idNuevoEstado } : p));

    const { error } = await supabase
      .from('plaza')
      .update({
        id_estado: idNuevoEstado
      })
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
      await registrarLog(
        'Alerta',
        `Plaza ${numPlaza} cambió de ${estadoAnterior} a ${nombreNuevoEstado.toUpperCase()} manualmente.`,
        idPlaza
      );
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
        html: `Atención: Esta plaza está <b>${esAsig ? 'asignada a un empleado' : 'reservada'}</b> ${ocupanteText}.<br><br>Normalmente se debe liberar desde el módulo correspondiente, pero puedes forzar la limpieza si se trata de un error.<br><br><b>¿Deseas forzar su liberación a LIBRE?</b>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, Forzar Liberación',
        cancelButtonText: 'Cancelar'
      }).then((result) => { 
        if (result.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); 
      });
      return;
    }

    if (['MANTENIMIENTO', 'FUERA DE SERVICIO'].includes(estadoActual)) {
      Swal.fire({
        title: '¿Liberar plaza?',
        text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, liberar'
      }).then((result) => { if (result.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); });
      return;
    }
    if (estadoActual === 'LIBRE') {
      Swal.fire({
        title: 'Acción bloqueada',
        text: 'La ocupación ya no se puede forzar manualmente. Para ocupar la plaza, emite un Ticket o registra una Entrada en el Acceso Manual.',
        icon: 'info',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Entendido'
      });
      return;
    }

    if (estadoActual === 'OCUPADA') {
      const infoActual = ocupacionInfo[plaza.id_plaza];
      
      if (!infoActual) {
        Swal.fire({
          title: 'Inconsistencia Detectada',
          text: 'Esta plaza dice estar OCUPADA pero no detectamos vehículo ni ticket. ¿Restablecer a LIBRE?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, restablecer',
          cancelButtonText: 'Cancelar'
        }).then((result) => { if (result.isConfirmed) changeStatus(plaza.id_plaza, 'LIBRE'); });
        return;
      }

      Swal.fire({
        title: 'Plaza en Uso (Advertencia)',
        html: `Esta plaza tiene un vehículo (<b>${infoActual.placa}</b>) legalmente registrado dentro de ella.<br><br>Normalmente debes darle Salida desde <b>Tickets</b> o <b>Acceso Manual</b>. Sin embargo, si crees que esto es un <b>"Registro Fantasma"</b> o un error del sistema que quedó atascado, puedes forzar su limpieza aquí.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Forzar Salida (Limpiar Error)',
        cancelButtonText: 'Dejarlo así'
      }).then(async (result) => {
        if (result.isConfirmed) {
            // Buscamos cualquier acceso activo que tenga esta plaza para matarlo
            const { error: updErr } = await supabase.from('acceso').update({ salida_at: new Date().toISOString() }).eq('id_plaza', plaza.id_plaza).is('salida_at', null);
            if (updErr) { Swal.fire('Error', updErr.message, 'error'); }
            else { 
               changeStatus(plaza.id_plaza, 'LIBRE');
               await Swal.fire('Limpieza Exitosa', 'El registro fantasma ha sido cerrado a la fuerza y la plaza quedó totalmente libre.', 'success');
               loadData();
            }
        }
      });
      return;
    }

  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation();
    Swal.fire({
      title: 'Gestión Centralizada',
      text: 'Para poner una plaza en mantenimiento, use el módulo de Mantenimiento para registrar el técnico y la descripción del problema.',
      icon: 'info',
      confirmButtonColor: '#3b82f6',
      confirmButtonText: 'Entendido'
    });
  };

  const getCardColor = (estado, idPlaza, forcingStatus = null) => {
    const statusToUse = (forcingStatus || estado)?.toUpperCase();
    const info = ocupacionInfo[idPlaza];
    if (!forcingStatus && info?.type === 'asignacion') return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';

    switch (statusToUse) {
      case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
      case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
      case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
      case 'ASIGNADA':
      case 'ASIGNADO': return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
      case 'CERRADA': return 'bg-gray-100 border-gray-200 shadow-sm';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getBadgeColor = (estado, idPlaza, forcingStatus = null) => {
    const statusToUse = (forcingStatus || estado)?.toUpperCase();
    const info = ocupacionInfo[idPlaza];
    if (!forcingStatus && info?.type === 'asignacion') return 'text-purple-800 bg-purple-200';

    switch (statusToUse) {
      case 'LIBRE': return 'text-green-700 bg-green-200';
      case 'OCUPADA': return 'text-red-700 bg-red-200';
      case 'RESERVADA': return 'text-yellow-800 bg-yellow-200';
      case 'ASIGNADA':
      case 'ASIGNADO': return 'text-purple-800 bg-purple-200';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'text-orange-800 bg-orange-200';
      case 'CERRADA': return 'text-gray-600 bg-gray-200';
      default: return 'text-gray-700 bg-gray-200';
    }
  };

  const stats = {
    libres:       plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE' && !ocupacionInfo[p.id_plaza]).length,
    asignadas:    plazas.filter(p => p.Nombre_Estado_Rel.startsWith('ASIGNAD') || ocupacionInfo[p.id_plaza]?.type === 'asignacion').length,
    ocupadas:     plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA' && ocupacionInfo[p.id_plaza]?.type !== 'asignacion').length,
    reservadas:   plazas.filter(p => (p.Nombre_Estado_Rel === 'RESERVADA' || p.Nombre_Estado_Rel === 'RESERVADO') && ocupacionInfo[p.id_plaza]?.type !== 'asignacion').length,
    mantenimiento:plazas.filter(p => ['MANTENIMIENTO', 'FUERA DE SERVICIO', 'EN MANTENIMIENTO'].includes(p.Nombre_Estado_Rel)).length
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Control de Ocupación</h2>
        <p className="text-gray-500">Vista operativa en tiempo real.</p>
      </header>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col xl:flex-row gap-4 items-center justify-between sticky top-0 z-10">
        <div className="relative w-full xl:w-96">
          <input type="text" placeholder="Buscar plaza..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
            const plazasDeZona = plazas.filter(p => p.id_zona === zona.id_zona && p.numero_plaza.toLowerCase().includes(searchTerm.toLowerCase()));
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
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${
                      estZona.includes('Mante') ? 'bg-orange-500 text-white' : 'bg-gray-500 text-white'
                    }`}>
                      Zona {estZona.includes('Mante') ? 'en Mantenimiento' : 'Cerrada'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {plazasDeZona.map(plaza => (
                    <div
                      key={plaza.id_plaza}
                      className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel, plaza.id_plaza, forcingStatus)}`}
                      onClick={() => {
                        if (isForcedState) {
                          return Swal.fire({
                            title: 'Zona Bloqueada',
                            text: `Esta plaza pertenece a una zona en estado "${estZona}". No puede ser manipulada manualmente hasta que la zona se active.`,
                            icon: 'info'
                          });
                        }
                        toggleOccupancy(plaza);
                      }}
                    >
                      <h4 className="font-bold text-xl text-gray-800">{plaza.numero_plaza}</h4>
                      <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel, plaza.id_plaza, forcingStatus)}`}>
                        {forcingStatus || (ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' ? 'ASIGNADA' : plaza.Nombre_Estado_Rel)}
                      </span>
                      {!isForcedState && (['OCUPADA', 'RESERVADA', 'RESERVADO', 'ASIGNADA', 'ASIGNADO'].includes(plaza.Nombre_Estado_Rel) || ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' || ocupacionInfo[plaza.id_plaza]?.type === 'reserva') && ocupacionInfo[plaza.id_plaza] && (
                        <div className={`mt-1 text-[9px] leading-tight ${
                          (ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' || plaza.Nombre_Estado_Rel.startsWith('ASIGNAD')) ? 'text-purple-800' :
                          plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-red-700' : 
                          (plaza.Nombre_Estado_Rel === 'RESERVADA' || plaza.Nombre_Estado_Rel === 'RESERVADO') ? 'text-yellow-800' : 'text-purple-800'
                        }`}>
                          {ocupacionInfo[plaza.id_plaza].placa && (
                            <div className="font-mono font-bold">{ocupacionInfo[plaza.id_plaza].placa}</div>
                          )}
                          <div className="text-[8px] opacity-80 truncate max-w-[90px]">
                            {ocupacionInfo[plaza.id_plaza].nombre}
                          </div>
                        </div>
                      )}

                      {/* Acción de mantenimiento removida para centralización */}
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
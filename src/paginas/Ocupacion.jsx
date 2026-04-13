import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaClock, FaExclamationTriangle, FaMapMarkerAlt, FaSync } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { playBeep } from '../utils/audio';

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
    const channel = supabase.channel('realtime_plaza')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: estData } = await supabase.from('estado').select('*').eq('contexto', 'plaza');
      setEstadosCatalogo(estData || []);

      const { data: zonasData } = await supabase.from('zona').select('*').order('id_zona');
      setZonas(zonasData || []);

      const { data: plazasData } = await supabase.from('plaza').select('*').order('numero_plaza');

      const plazasCompletas = (plazasData || []).map(p => {
        const estadoObj = (estData || []).find(e => e.id === p.id_estado);
        return {
          ...p,
          Nombre_Estado_Rel: estadoObj ? estadoObj.nombre.toUpperCase() : 'LIBRE'
        };
      });
      setPlazas(plazasCompletas);

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
            placa: acc.vehiculo.placa,
            nombre: `${acc.vehiculo.persona?.nombre || 'Visitante'} ${acc.vehiculo.persona?.apellido || ''}`.trim()
          };
        }
      });

      // 2. RESERVAS (Activas)
      const nowISO = new Date().toISOString();
      const { data: reservasActivas } = await supabase
        .from('reserva')
        .select('id_plaza, persona ( nombre, apellido )')
        .lte('fecha_hora_inicio', nowISO)
        .gte('fecha_hora_fin', nowISO);
      
      (reservasActivas || []).forEach(res => {
        if (res.id_plaza && res.persona) {
          mapaOcupacion[res.id_plaza] = {
            ...mapaOcupacion[res.id_plaza],
            nombre: `${res.persona.nombre} ${res.persona.apellido}`.trim()
          };
        }
      });

      // 3. ASIGNACIONES (Fijas)
      // Buscamos estados relacionados con asignaciones (Activa, Vigente, etc)
      const idEstadoAsig = estData?.find(e => (e.nombre === 'Activa' || e.nombre === 'Vigente') && (e.contexto === 'asignacion' || e.contexto === 'asignaciones'))?.id;

      const { data: asignacionesActivas } = await supabase
        .from('asignacion')
        .select(`
          id_plaza,
          empleado (
            persona ( nombre, apellido )
          )
        `)
        .or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString().split('T')[0]}`);
      
      (asignacionesActivas || []).forEach(asig => {
        if (asig.id_plaza) {
          mapaOcupacion[asig.id_plaza] = {
            ...mapaOcupacion[asig.id_plaza],
            type: 'asignacion',
            nombre: `${asig.empleado?.persona?.nombre || ''} ${asig.empleado?.persona?.apellido || ''}`.trim()
          };
        }
      });

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
      const { data: te } = await supabase.from('tipo').select('id').eq('nombre', tipo_nombre).eq('contexto', 'evento').maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Control de Ocupación').maybeSingle();
      await supabase.from('evento').insert([{
        fecha_hora: new Date().toISOString(),
        descripcion: descripcion,
        id_plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo: te?.id || null,
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

    if (nombreNuevoEstado.toUpperCase() === 'OCUPADA') playBeep();

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
        title: 'Plaza en Uso',
        html: 'Esta plaza tiene un vehículo legalmente registrado dentro de ella.<br><br>Para liberarla, ve al módulo de <b>Tickets</b> o <b>Acceso Manual</b> y dale Salida al vehículo.',
        icon: 'info',
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Entendido'
      });
      return;
    }

  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation();
    if (plaza.Nombre_Estado_Rel.startsWith('ASIGNAD') || ocupacionInfo[plaza.id_plaza]?.type === 'asignacion') {
      Swal.fire({
        title: `Plaza Asignada`,
        html: `Esta plaza está <b>asignada a un empleado</b>.<br>Para cambiar su estado, use la página de <b>Asignaciones</b>.`,
        icon: 'info',
        confirmButtonColor: '#7c3aed',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    const nuevoEstado = plaza.Nombre_Estado_Rel === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.id_plaza, nuevoEstado);
  };

  const getCardColor = (estado, idPlaza) => {
    const info = ocupacionInfo[idPlaza];
    if (info?.type === 'asignacion') return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';

    switch (estado) {
      case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
      case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
      case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
      case 'ASIGNADA':
      case 'ASIGNADO': return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getBadgeColor = (estado, idPlaza) => {
    const info = ocupacionInfo[idPlaza];
    if (info?.type === 'asignacion') return 'text-purple-800 bg-purple-200';

    switch (estado) {
      case 'LIBRE': return 'text-green-700 bg-green-200';
      case 'OCUPADA': return 'text-red-700 bg-red-200';
      case 'RESERVADA': return 'text-yellow-800 bg-yellow-200';
      case 'ASIGNADA':
      case 'ASIGNADO': return 'text-purple-800 bg-purple-200';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA DE SERVICIO': return 'text-orange-800 bg-orange-200';
      default: return 'text-gray-700 bg-gray-200';
    }
  };

  const stats = {
    libres: plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE' && !ocupacionInfo[p.id_plaza]?.type).length,
    ocupadas: plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA' && !ocupacionInfo[p.id_plaza]?.type).length,
    reservadas: plazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
    asignadas: plazas.filter(p => (p.Nombre_Estado_Rel.startsWith('ASIGNAD') || ocupacionInfo[p.id_plaza]?.type === 'asignacion')).length,
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

            return (
              <section key={zona.id_zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b pb-2">
                  <FaMapMarkerAlt className="text-primary text-xl" />
                  <h3 className="text-xl font-bold text-gray-800">{zona.nombre}</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {plazasDeZona.map(plaza => (
                    <div
                      key={plaza.id_plaza}
                      className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel, plaza.id_plaza)}`}
                      onClick={() => toggleOccupancy(plaza)}
                    >
                      <h4 className="font-bold text-xl text-gray-800">{plaza.numero_plaza}</h4>
                      <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel, plaza.id_plaza)}`}>
                        {ocupacionInfo[plaza.id_plaza]?.type === 'asignacion' ? 'ASIGNADA' : plaza.Nombre_Estado_Rel}
                      </span>
                      {['OCUPADA', 'RESERVADA', 'ASIGNADA'].includes(plaza.Nombre_Estado_Rel) && ocupacionInfo[plaza.id_plaza] && (
                        <div className={`mt-1 text-[9px] leading-tight ${
                          plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-red-700' : 
                          plaza.Nombre_Estado_Rel === 'RESERVADA' ? 'text-yellow-800' : 'text-purple-800'
                        }`}>
                          {ocupacionInfo[plaza.id_plaza].placa && (
                            <div className="font-mono font-bold">{ocupacionInfo[plaza.id_plaza].placa}</div>
                          )}
                          <div className="text-[8px] opacity-80 truncate max-w-[90px]">
                            {ocupacionInfo[plaza.id_plaza].nombre}
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleSpecialState(e, plaza, 'EN MANTENIMIENTO')} className="p-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow" title="Mantenimiento"><FaExclamationTriangle size={12} /></button>
                      </div>
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
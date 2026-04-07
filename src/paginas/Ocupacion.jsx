/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaClock, FaExclamationTriangle, FaMapMarkerAlt, FaSync } from 'react-icons/fa';

export default function Ocupacion() {
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [estadosCatalogo, setEstadosCatalogo] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Suscripción a cambios en tiempo real
    const channel = supabase.channel('realtime_plazas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    try {
        const { data: estData } = await supabase.from('estado_plaza').select('*');
        setEstadosCatalogo(estData || []);

        const { data: zonasData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zonasData || []);

        const { data: plazasData } = await supabase.from('plazas').select('*').order('Numero_Plaza');
        
        // Mapeo de estados
        const plazasCompletas = (plazasData || []).map(p => {
            const estadoObj = (estData || []).find(e => e.id_estado === p.id_estado);
            return {
                ...p,
                Nombre_Estado_Rel: estadoObj ? estadoObj.nombre_estado.toUpperCase() : 'LIBRE'
            };
        });
        setPlazas(plazasCompletas);
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); }
  };

  const getEstadoId = (nombre) => estadosCatalogo.find(e => e.nombre_estado.toUpperCase() === nombre.toUpperCase())?.id_estado;

  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);
    if (!idNuevoEstado) return;

    // 🔊 Beep si se ocupa una plaza
    if (nombreNuevoEstado.toUpperCase() === 'OCUPADA') playBeep();

    setPlazas(prev => prev.map(p => p.Id_Plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado } : p));

    const { error } = await supabase.from('plazas').update({ id_estado: idNuevoEstado }).eq('Id_Plaza', idPlaza);
    if (error) { Swal.fire('Error', error.message, 'error'); loadData(); }
  };

  const toggleOccupancy = (plaza) => {
    const estadoActual = plaza.Nombre_Estado_Rel;
    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'RESERVADA'].includes(estadoActual)) {
        Swal.fire({
            title: '¿Liberar plaza?',
            text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then((result) => { if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); });
        return;
    }
    const nuevo = estadoActual === 'LIBRE' ? 'OCUPADA' : 'LIBRE';
    changeStatus(plaza.Id_Plaza, nuevo);
  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation(); 
    const nuevoEstado = plaza.Nombre_Estado_Rel === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };


  const getCardColor = (estado) => {
      switch(estado) {
          case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
          case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
          case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
          case 'MANTENIMIENTO': 
          case 'FUERA_DE_SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
          default: return 'bg-gray-50 border-gray-200';
      }
  };

  const getBadgeColor = (estado) => {
    switch(estado) {
        case 'LIBRE': return 'text-green-700 bg-green-200';
        case 'OCUPADA': return 'text-red-700 bg-red-200';
        case 'RESERVADA': return 'text-yellow-800 bg-yellow-200';
        case 'MANTENIMIENTO': 
        case 'FUERA_DE_SERVICIO': return 'text-orange-800 bg-orange-200';
        default: return 'text-gray-700 bg-gray-200';
    }
  };

  const stats = {
      libres: plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE').length,
      ocupadas: plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA').length,
      reservadas: plazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
      mantenimiento: plazas.filter(p => ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(p.Nombre_Estado_Rel)).length
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
            <FaSearch className="absolute left-3 top-3 text-gray-400"/>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold justify-center">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Libres: {stats.libres}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Ocupadas: {stats.ocupadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400"></div> Reservadas: {stats.reservadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mant.: {stats.mantenimiento}</span>
            <button onClick={loadData} className="ml-2 text-primary hover:bg-blue-50 p-2 rounded-full"><FaSync /></button>
        </div>
      </div>

      {loading ? <p className="text-center py-10">Cargando...</p> : (
        <div className="space-y-8">
            {zonas.map(zona => {
                const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona && p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()));
                if (searchTerm && plazasDeZona.length === 0) return null;

                return (
                    <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 border-b pb-2">
                            <FaMapMarkerAlt className="text-primary text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">{zona.Nombre_Zona}</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                            {plazasDeZona.map(plaza => (
                                <div 
                                    key={plaza.Id_Plaza}
                                    className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel)}`}
                                    onClick={() => toggleOccupancy(plaza)}
                                >
                                    <h4 className="font-bold text-xl text-gray-800">{plaza.Numero_Plaza}</h4>
                                    <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel)}`}>
                                        {plaza.Nombre_Estado_Rel}
                                    </span>
                                    
                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'RESERVADA')} className="p-1.5 bg-white text-yellow-600 hover:bg-yellow-50 rounded-full shadow" title="Reservar"><FaClock size={12} /></button>
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'FUERA_DE_SERVICIO')} className="p-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow" title="Mantenimiento"><FaExclamationTriangle size={12} /></button>
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

*/

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
  // #17: Mapa de plaza → info del vehículo/persona que la ocupa
  const [ocupacionInfo, setOcupacionInfo] = useState({});

  useEffect(() => {
    // Obtener persona_id del usuario activo para los logs
    const getCurrentPersona = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('usuarios')
          .select('id_persona')
          .eq('id', user.id)
          .single();
        if (data) setCurrentPersonaId(data.id_persona);
      }
    };
    getCurrentPersona();

    loadData();
    const channel = supabase.channel('realtime_plazas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asignaciones_parqueo' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: estData } = await supabase.from('estado_plaza').select('*');
      setEstadosCatalogo(estData || []);

      const { data: zonasData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
      setZonas(zonasData || []);

      const { data: plazasData } = await supabase.from('plazas').select('*').order('Numero_Plaza');

      const plazasCompletas = (plazasData || []).map(p => {
        const estadoObj = (estData || []).find(e => e.id_estado === p.id_estado);
        return {
          ...p,
          Nombre_Estado_Rel: estadoObj ? estadoObj.nombre_estado.toUpperCase() : 'LIBRE'
        };
      });
      setPlazas(plazasCompletas);

      // #17: Info de quién ocupa/reserva/tiene asignada cada plaza
      const mapaOcupacion = {};

      // 1. OCUPACIÓN (Accesos activos)
      const { data: accesosActivos } = await supabase
        .from('registros_acceso')
        .select('Id_Plaza, vehiculos(placa, personas(nombre, apellido))')
        .is('salida_at', null);
      
      (accesosActivos || []).forEach(acc => {
        if (acc.Id_Plaza && acc.vehiculos) {
          mapaOcupacion[acc.Id_Plaza] = {
            placa: acc.vehiculos.placa,
            nombre: `${acc.vehiculos.personas?.nombre || 'Visitante'} ${acc.vehiculos.personas?.apellido || ''}`.trim()
          };
        }
      });

      // 2. RESERVAS (Activas)
      const { data: reservasActivas } = await supabase
        .from('RESERVA')
        .select('Id_Plaza, personas(nombre, apellido)')
        .eq('id_estado', 1); // 1 = Activa
      
      (reservasActivas || []).forEach(res => {
        if (res.Id_Plaza && res.personas) {
          mapaOcupacion[res.Id_Plaza] = {
            ...mapaOcupacion[res.Id_Plaza],
            nombre: `${res.personas.nombre} ${res.personas.apellido}`.trim()
          };
        }
      });

      // 3. ASIGNACIONES (Fijas)
      const { data: asignacionesActivas } = await supabase
        .from('asignaciones_parqueo')
        .select('Id_Plaza, empleados(id_persona, personas(nombre, apellido))')
        .eq('id_estado', 1)
        .or(`Fecha_Fin.is.null,Fecha_Fin.gte.${new Date().toISOString().split('T')[0]}`);
      
      (asignacionesActivas || []).forEach(asig => {
        if (asig.Id_Plaza) {
          mapaOcupacion[asig.Id_Plaza] = {
            placa: mapaOcupacion[asig.Id_Plaza]?.placa || 'Asignada',
            nombre: `${asig.empleados?.personas?.nombre || ''} ${asig.empleados?.personas?.apellido || ''}`.trim()
          };
        }
      });

      setOcupacionInfo(mapaOcupacion);
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); setIsRefreshing(false); }
  };

  const getEstadoId = (nombre) => {
    return estadosCatalogo.find(e => e.nombre_estado.trim().toUpperCase() === nombre.toUpperCase())?.id_estado;
  };

  // Registra un evento en la tabla `eventos` (RF10)
  const registrarLog = async (tipo, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return; // Necesita sesión activa
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Control de Ocupación').maybeSingle();
      await supabase.from('eventos').insert([{
        Fecha_Hora: new Date().toISOString(),
        Descripcion: descripcion,
        Id_Plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo_evento: te?.id_tipo || null,
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

    // Estado anterior para el log
    const plazaActual = plazas.find(p => p.Id_Plaza === idPlaza);
    const estadoAnterior = plazaActual?.Nombre_Estado_Rel || 'DESCONOCIDO';

    // Sonido si se ocupa una plaza
    if (nombreNuevoEstado.toUpperCase() === 'OCUPADA') playBeep();

    // Actualización optimista en UI
    setPlazas(prev => prev.map(p => p.Id_Plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado.toUpperCase(), id_estado: idNuevoEstado } : p));

    const { error } = await supabase
      .from('plazas')
      .update({
        id_estado: idNuevoEstado
      })
      .eq('Id_Plaza', idPlaza);

    if (error) {
      Swal.fire('Error', error.message, 'error');
      loadData();
    } else {
      // Si la plaza se cambia a LIBRE o Mantenimiento, cerramos cualquier acceso activo fantasma
      // para evitar que sus datos (placa, persona) reaparezcan si la plaza se ocupa de nuevo manualmente.
      if (['LIBRE', 'EN MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(nombreNuevoEstado.toUpperCase())) {
        await supabase
          .from('registros_acceso')
          .update({ salida_at: new Date().toISOString() })
          .eq('Id_Plaza', idPlaza)
          .is('salida_at', null);
      }

      // Registrar en la tabla de eventos (RF10)
      const numPlaza = plazaActual?.Numero_Plaza || `ID-${idPlaza}`;
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

    // Plazas ASIGNADAS o RESERVADAS solo se pueden liberar desde sus respectivas páginas
    // EXCEPCIÓN: Si no hay info en ocupacionInfo, es un "estado fantasma" y permitimos liberar.
    if (['ASIGNADA', 'RESERVADA'].includes(estadoActual)) {
      const infoActual = ocupacionInfo[plaza.Id_Plaza];
      const ocupanteText = infoActual ? `(${infoActual.nombre})` : '(Sin registros)';
      const esAsig = estadoActual === 'ASIGNADA';
      
      Swal.fire({
        title: `Liberar Plaza ${esAsig ? 'Asignada' : 'Reservada'}`,
        html: `Atención: Esta plaza está <b>${esAsig ? 'asignada a un empleado' : 'reservada'}</b> ${ocupanteText}.<br><br>Normalmente se debe liberar desde el módulo correspondiente, pero puedes forzar la limpieza si se trata de un error.<br><br><b>¿Deseas forzar su liberación a LIBRE?</b>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, Forzar Liberación',
        cancelButtonText: 'Cancelar'
      }).then((result) => { 
        if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); 
      });
      return;
    }

    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(estadoActual)) {
      Swal.fire({
        title: '¿Liberar plaza?',
        text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, liberar'
      }).then((result) => { if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); });
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
      const infoActual = ocupacionInfo[plaza.Id_Plaza];
      
      if (!infoActual) {
        Swal.fire({
          title: 'Inconsistencia Detectada',
          text: 'Esta plaza dice estar OCUPADA pero no detectamos vehículo ni ticket. ¿Restablecer a LIBRE?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, restablecer',
          cancelButtonText: 'Cancelar'
        }).then((result) => { if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); });
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
    // Bloquear cambio de estado manual si la plaza está ASIGNADA o RESERVADA
    if (['ASIGNADA', 'RESERVADA'].includes(plaza.Nombre_Estado_Rel)) {
      const esAsig = plaza.Nombre_Estado_Rel === 'ASIGNADA';
      Swal.fire({
        title: `Plaza ${esAsig ? 'Asignada' : 'Reservada'}`,
        html: `Esta plaza está <b>${esAsig ? 'asignada a un empleado' : 'reservada'}</b>.<br>Para cambiar su estado, use la página de <b>${esAsig ? 'Asignaciones' : 'Reservaciones'}</b>.`,
        icon: 'info',
        confirmButtonColor: esAsig ? '#7c3aed' : '#f59e0b',
        confirmButtonText: 'Entendido'
      });
      return;
    }
    const nuevoEstado = plaza.Nombre_Estado_Rel === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };

  const getCardColor = (estado) => {
    switch (estado) {
      case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
      case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
      case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
      case 'ASIGNADA': return 'bg-purple-50 border-purple-300 shadow-sm cursor-not-allowed';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA_DE_SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getBadgeColor = (estado) => {
    switch (estado) {
      case 'LIBRE': return 'text-green-700 bg-green-200';
      case 'OCUPADA': return 'text-red-700 bg-red-200';
      case 'RESERVADA': return 'text-yellow-800 bg-yellow-200';
      case 'ASIGNADA': return 'text-purple-800 bg-purple-200';
      case 'MANTENIMIENTO':
      case 'EN MANTENIMIENTO':
      case 'FUERA_DE_SERVICIO': return 'text-orange-800 bg-orange-200';
      default: return 'text-gray-700 bg-gray-200';
    }
  };

  const stats = {
    libres: plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE').length,
    ocupadas: plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA').length,
    reservadas: plazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
    asignadas: plazas.filter(p => p.Nombre_Estado_Rel === 'ASIGNADA').length,
    mantenimiento: plazas.filter(p => ['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'EN MANTENIMIENTO'].includes(p.Nombre_Estado_Rel)).length
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
            const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona && p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()));
            if (searchTerm && plazasDeZona.length === 0) return null;

            return (
              <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b pb-2">
                  <FaMapMarkerAlt className="text-primary text-xl" />
                  <h3 className="text-xl font-bold text-gray-800">{zona.Nombre_Zona}</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {plazasDeZona.map(plaza => (
                    <div
                      key={plaza.Id_Plaza}
                      className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel)}`}
                      onClick={() => toggleOccupancy(plaza)}
                    >
                      <h4 className="font-bold text-xl text-gray-800">{plaza.Numero_Plaza}</h4>
                      <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel)}`}>
                        {plaza.Nombre_Estado_Rel}
                      </span>
                      {/* Info persona/vehículo en plazas ocupadas, reservadas o asignadas */}
                      {['OCUPADA', 'RESERVADA', 'ASIGNADA'].includes(plaza.Nombre_Estado_Rel) && ocupacionInfo[plaza.Id_Plaza] && (
                        <div className={`mt-1 text-[9px] leading-tight ${
                          plaza.Nombre_Estado_Rel === 'OCUPADA' ? 'text-red-700' : 
                          plaza.Nombre_Estado_Rel === 'RESERVADA' ? 'text-yellow-800' : 'text-purple-800'
                        }`}>
                          {ocupacionInfo[plaza.Id_Plaza].placa && (
                            <div className="font-mono font-bold">{ocupacionInfo[plaza.Id_Plaza].placa}</div>
                          )}
                          <div className="text-[8px] opacity-80 truncate max-w-[90px]">
                            {ocupacionInfo[plaza.Id_Plaza].nombre}
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleSpecialState(e, plaza, 'En Mantenimiento')} className="p-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow" title="Mantenimiento"><FaExclamationTriangle size={12} /></button>
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
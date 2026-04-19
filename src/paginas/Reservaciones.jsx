

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { 
  FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, 
  FaPlus, FaCalendarAlt, FaTrash, FaLock, FaSync,
  FaUsers, FaLayerGroup, FaMapMarkedAlt, FaInfoCircle
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Reservaciones() {
  const { tienePermiso } = useRbac();
  const { orgId, loadingOrg } = useOrg();
  const [serverTimeOffset, setServerTimeOffset] = useState(0); // Diferencia entre local y servidor

  const canCreate = tienePermiso('Reservas', 'crear');
  const canEdit = tienePermiso('Reservas', 'editar');
  const canDelete = tienePermiso('Reservas', 'eliminar');

  const [activeTab, setActiveTab] = useState('personas');
  const [reservas, setReservas] = useState([]);
  const [reservasZona, setReservasZona] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState(null);
  
  const [editingReservaId, setEditingReservaId] = useState(null);
  const [originalPlazaId, setOriginalPlazaId] = useState(null); 

  const [personasList, setPersonasList] = useState([]); 
  const [plazasList, setPlazasList] = useState([]);
  const [vehiculosMap, setVehiculosMap] = useState({}); // id_persona -> [vehiculos]
  const [tiposReservaZona, setTiposReservaZona] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);
  
  const initialForm = {
    id_persona: '',
    Id_Plaza: '',
    id_vehiculo: '',
    id_zona: '',
    id_tipo_reserva: '',
    descripcion: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const isUpdating = !!editingReservaId;

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) {
          setCurrentPersonaId(uData.id_persona);
          const { data: eData } = await supabase.from('empleado').select('id_empleado').eq('id_persona', uData.id_persona).maybeSingle();
          if (eData) setCurrentEmpleadoId(eData.id_empleado);
        }
      }
    };
    init();
    loadReservas();
    loadReservasZona();
    loadAuxData();
    loadAuxDataZona();

    // Sincronización en tiempo real
    const r_channel = supabase.channel('realtime_reservaciones_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, () => { loadReservas(); loadAuxData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva_zona' }, loadReservasZona)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadAuxData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, () => { loadAuxData(); loadAuxDataZona(); })
      .subscribe();
      
    return () => { supabase.removeChannel(r_channel); };
  }, []);

  useEffect(() => {
    const syncTime = async () => {
      try {
        const start = Date.now();
        const response = await fetch('https://qvidbkkrxiwcvletaqfp.supabase.co/rest/v1/', { 
          method: 'HEAD',
          headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWRia2tyeGl3Y3ZsZXRhcWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjM1MjUsImV4cCI6MjA4MDY5OTUyNX0.GoLdf7fcyoTtl7-idGKY3aWkL7h3P7xs-1Qk7Lrgs7A' } 
        });
        const serverDateStr = response.headers.get('date');
        if (serverDateStr) {
          const serverTime = new Date(serverDateStr).getTime();
          const localTime = start + (Date.now() - start) / 2;
          setServerTimeOffset(serverTime - localTime);
          console.log(`[TimeSync] Sincronizado. Offset: ${serverTime - localTime}ms`);
        }
      } catch (err) { console.warn('[TimeSync] Fallo:', err); }
    };
    syncTime();
  }, []);

  useEffect(() => {
    loadReservas();
    loadReservasZona();
  }, [activeTab]);

  // --- 2. VERIFICADOR DE TIEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => {
      checkExpiredReservations();
    }, 5000); 
    return () => clearInterval(timer);
  }, [reservas]); 

  const loadReservas = async () => {
    setIsRefreshing(true);
    try {
        const { data, error } = await supabase
          .from('reserva')
          .select(`
            *,
            persona (id_persona, nombre, apellido),
            plaza (id_plaza, numero_plaza),
            estado:estado_reserva ( nombre ) 
          `)
          .order('fecha_hora_inicio', { ascending: false });

        if (error) throw error;
        setReservas(data || []);
    } catch (error) { console.error("Error cargando reservas:", error.message); }
    finally { setIsRefreshing(false); }
  };

  const loadReservasZona = async () => {
    setIsRefreshing(true);
    try {
        const { data, error } = await supabase
          .from('reserva_zona')
          .select(`
            *,
            zona (id_zona, nombre),
            tipo:tipo_reserva_zona ( nombre ),
            persona (id_persona, nombre, apellido),
            estado:estado_reserva ( nombre ) 
          `)
          .order('fecha_hora_inicio', { ascending: false });

        if (error) throw error;
        setReservasZona(data || []);
    } catch (error) { console.error("Error cargando reservas de zona:", error.message); }
    finally { setIsRefreshing(false); }
  };

  const loadAuxData = async () => {
    try {
        // Obtener estado 'Libre' para plaza
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idEstLibrePlaza = epLibre?.id_estado || 1;

        // Traer todos los usuarios de la organización (no visitantes)
        const { data: uData } = await supabase.rpc('get_usuarios_org');
        const soloUsuarios = (uData || []).map(u => ({
          id_persona: u.id_persona || u.persona_id,
          nombre: u.nombre,
          apellido: u.apellido
        }));

        // Calcular personas bloqueadas (reserva activa o asignacion activa — el acceso activo NO bloquea aqui)
        const ahoraISO = new Date().toISOString();
        const personasOcupadas = new Map(); // id_persona → razón

        // Reservas activas no vencidas
        const { data: erActivo } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Activa').maybeSingle();
        const { data: reservasActivas } = await supabase
          .from('reserva').select('id_persona')
          .eq('id_estado', erActivo?.id_estado || 1)
          .or(`fecha_hora_fin.is.null,fecha_hora_fin.gt.${ahoraISO}`);
        (reservasActivas || []).forEach(r => {
          if (r.id_persona) personasOcupadas.set(r.id_persona, 'Reserva activa');
        });


        const personasConEstado = soloUsuarios.map(p => ({
          ...p,
          _ocupada: personasOcupadas.has(p.id_persona),
          _razon: personasOcupadas.get(p.id_persona) || null
        }));
        
        const { data: plazas } = await supabase
          .from('plaza')
          .select('id_plaza, numero_plaza, zona:id_zona(estado_zona(nombre))')
          .eq('id_estado', idEstLibrePlaza)
          .order('numero_plaza');

        // Blindaje: Solo considerar disponibles las que id_estado=Libre Y NO tienen contrato activo
        const { data: asigsActivas } = await supabase.from('asignacion').select('id_plaza').eq('id_estado', 1);
        const plazasAsignadasIds = new Set(asigsActivas?.map(a => a.id_plaza) || []);

        // Filtrar plazas de zonas bloqueadas administrativamente y excluir las ya asignadas a empleados
        const plazasDisponibles = (plazas || []).filter(p => {
          const est = p.zona?.estado_zona?.nombre || 'Activa';
          return est === 'Activa' && !plazasAsignadasIds.has(p.id_plaza);
        });

        // Traer vehículos habilitados
        const { data: vehData } = await supabase
          .from('vehiculo')
          .select('id_vehiculo, id_persona, placa, modelo(nombre, marca(nombre)), color(nombre)')
          .eq('id_estado', 1);
        const vMap = {};
        (vehData || []).forEach(v => {
          if (v.id_persona) {
            if (!vMap[v.id_persona]) vMap[v.id_persona] = [];
            vMap[v.id_persona].push(v);
          }
        });
        setVehiculosMap(vMap);

        setPersonasList(personasConEstado);
        setPlazasList(plazasDisponibles);
    } catch (error) { console.error("Error aux:", error); }
  };

  const loadAuxDataZona = async () => {
    try {
      const [{ data: tipos }, { data: zonas }] = await Promise.all([
        supabase.from('tipo_reserva_zona').select('*').order('nombre'),
        supabase.from('zona').select('id_zona, nombre, estado_zona(nombre)').order('nombre')
      ]);

      // Filtrar solo zonas que estén estrictamente "Activas"
      const zonasActivas = (zonas || []).filter(z => (z.estado_zona?.nombre || 'Activa') === 'Activa');

      setTiposReservaZona(tipos || []);
      setZonasDisponibles(zonasActivas);
    } catch (error) { console.error("Error aux zona:", error); }
  };



  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_plaza: idPlaza, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id_tipo || null, 
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  // --- 3. LÓGICA DE PRECISIÓN PARA AUTO-COMPLETADO ---
  const checkExpiredReservations = async () => {
    // Usamos el tiempo sincronizado con el servidor
    const ahora = new Date(Date.now() + serverTimeOffset);
    
    // Requerimos IDs de estado para que el bucle sea eficiente
    const { data: stVencida } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Vencida').maybeSingle();
    const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
    
    // Fallback seguro para IDs
    const idEstVencida = stVencida?.id_estado || 4;
    const idEstLibre = epLibre?.id_estado || 1;

    const commonIds = {
      idEstVencidaRes: idEstVencida,
      idEstLibrePlaza: idEstLibre
    };

    // 1. Personas
    if (reservas.length > 0) {
      const vencidas = reservas.filter(r => {
        const nombreEstado = r.estado?.nombre?.trim();
        const esActiva = nombreEstado === 'Activa' || r.id_estado === 1;
        if (!esActiva) return false;
        if (!r.fecha_hora_fin) return false;
        
        const fechaFin = new Date(r.fecha_hora_fin);
        // Margen de seguridad de 60 segundos para evitar desfases de reloj
        const expired = ahora.getTime() >= (fechaFin.getTime() + 60000);
        if (expired) console.log(`[AutoExpire] Reserva ${r.id_reserva} vencida. Ahora (ServerSync): ${ahora.toISOString()}, Fin: ${fechaFin.toISOString()}, Offset: ${serverTimeOffset}ms`);
        return expired;
      });
      for (const res of vencidas) {
        const targetPlazaId = res.id_plaza || res.plaza?.id_plaza;
        await handleMarkCompleted(res.id_reserva, targetPlazaId, true, { ...commonIds, idEstCompletadoRes: commonIds.idEstVencidaRes });
      }
    }

    // 2. Zonas
    if (reservasZona.length > 0) {
      const vencidasZ = reservasZona.filter(rz => {
        const nombreEstado = rz.estado?.nombre?.trim();
        const esActiva = nombreEstado === 'Activa' || rz.id_estado === 1;
        if (!esActiva) return false;
        if (!rz.fecha_hora_fin) return false;
        // Margen de seguridad de 60 segundos
        return ahora.getTime() >= (new Date(rz.fecha_hora_fin).getTime() + 60000);
      });
      for (const rz of vencidasZ) {
        await handleMarkCompletedZona(rz.id_reserva_zona, true, { ...commonIds, idEstCompletadoRes: commonIds.idEstVencidaRes });
      }
    }
  };

  // --- 4. ACCIONES (COMPLETAR, CANCELAR, ELIMINAR) ---

  const handleMarkCompleted = async (id, idPlaza, isAuto = false, forcedIds = null) => {
    try {
        let idEstCompletadoRes = forcedIds?.idEstCompletadoRes;
        let idEstLibrePlaza = forcedIds?.idEstLibrePlaza;
        let finalPlazaId = (idPlaza && typeof idPlaza === 'object') ? idPlaza.id_plaza : idPlaza;

        // Si no tenemos el ID de la plaza desde el estado, lo buscamos en la BD para no fallar
        if (!finalPlazaId) {
          const { data: resData } = await supabase.from('reserva').select('id_plaza').eq('id_reserva', id).maybeSingle();
          finalPlazaId = resData?.id_plaza;
        }

        if (!idEstCompletadoRes) {
          const { data: stCompletada } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Completada').maybeSingle();
          idEstCompletadoRes = stCompletada?.id_estado || 3;
        }
        if (!idEstLibrePlaza) {
          const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
          idEstLibrePlaza = epLibre?.id_estado || 1;
        }

        // ORDEN ATÓMICO: Liberamos la plaza PRIMERO para que el monitor cambie a verde de inmediato
        if (finalPlazaId) {
          console.log(`[Cleanup] Paso 1: Liberando plaza ID: ${finalPlazaId} con estadoID: ${idEstLibrePlaza}`);
          const { error: plazaErr } = await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', finalPlazaId);
          if (plazaErr) {
            console.error("Error crítico liberando plaza:", plazaErr);
            // Intentamos continuar de todos modos para no dejar la reserva activa
          } else {
            console.log(`[Cleanup] Paso 1: Plaza ${finalPlazaId} liberada exitosamente.`);
          }
        } else {
          console.warn(`[Cleanup] No se pudo determinar el ID de la plaza para la reserva ${id}.`);
        }

        // Paso 2: Actualizamos la reserva
        console.log(`[Cleanup] Paso 2: Actualizando reserva ${id} a estado ${idEstCompletadoRes}`);
        const { error: resErr } = await supabase.from('reserva').update({ id_estado: idEstCompletadoRes }).eq('id_reserva', id);
        if (resErr) {
          console.error("Error actualizando reserva:", resErr);
        }

        if (!isAuto) {
            Swal.fire('Éxito', 'Reserva completada.', 'success');
            const p = plazasList.find(p => p.id_plaza === finalPlazaId);
            registrarLog('Ticket Cerrado', `Reserva completada para plaza ${p?.numero_plaza || finalPlazaId}`, finalPlazaId);
        }
        loadReservas();
        loadAuxData(); 
    } catch (e) { console.error("Error al completar reserva:", e); }
  };

  const handleCancelReserva = async (idReserva, idPlaza) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La plaza se liberará.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        const { data: stCancelada } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Cancelada').maybeSingle();
        const idEstCanceladaRes = stCancelada?.id_estado || 2;
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idEstLibrePlaza = epLibre?.id_estado || 1;

        await supabase.from('reserva').update({ id_estado: idEstCanceladaRes }).eq('id_reserva', idReserva);
        if (idPlaza) await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', idPlaza);
        const p = plazasList.find(p => p.id_plaza === idPlaza);
        registrarLog('Reserva Cancelada', `Reserva cancelada para plaza ${p?.numero_plaza || idPlaza}`, idPlaza);
        loadReservas();
        loadAuxData();
    }
  };

  // handleDelete y handleDeleteZona se mantienen como referencia pero ya no se usan en la UI para prevenir el borrado físico.

  const handleMarkCompletedZona = async (id, isAuto = false, forcedIds = null) => {
    try {
        let idEstCompletadoRes = forcedIds?.idEstCompletadoRes;
        if (!idEstCompletadoRes) {
          const { data: stCompletada } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Completada').maybeSingle();
          idEstCompletadoRes = stCompletada?.id_estado || 3;
        }

        // Obtener info de la reserva para saber la zona
        const { data: resInfo } = await supabase.from('reserva_zona').select('id_zona').eq('id_reserva_zona', id).single();

        // ORDEN ATÓMICO: Liberar plazas de la zona PRIMERO
        if (resInfo?.id_zona) {
          console.log(`[CleanupZona] Paso 1: Liberando plazas de zona ${resInfo.id_zona}`);
          await liberarPlazasZona(resInfo.id_zona);
        }

        // Paso 2: Actualizar la reserva
        console.log(`[CleanupZona] Paso 2: Actualizando reserva_zona ${id} a estado ${idEstCompletadoRes}`);
        await supabase.from('reserva_zona').update({ id_estado: idEstCompletadoRes }).eq('id_reserva_zona', id);

        if (!isAuto) {
          Swal.fire('Éxito', 'Reserva de zona completada.', 'success');
          registrarLog('Cambio de Estado', `Reserva de zona completada (ID: ${id})`);
        }
        loadReservasZona();
    } catch (e) { console.error("Error al completar zona:", e); }
  };

  const handleCancelReservaZona = async (id) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La zona quedará disponible.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        const { data: stCancelada } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Cancelada').maybeSingle();
        const idEstCanceladaRes = stCancelada?.id_estado || 2;
        
        // Info de zona
        const { data: resInfo } = await supabase.from('reserva_zona').select('id_zona').eq('id_reserva_zona', id).single();

        await supabase.from('reserva_zona').update({ id_estado: idEstCanceladaRes }).eq('id_reserva_zona', id);
        
        if (resInfo?.id_zona) {
          await liberarPlazasZona(resInfo.id_zona);
        }

        registrarLog('Reserva Cancelada', `Reserva de zona cancelada (ID: ${id})`);
        loadReservasZona();
    }
  };

  // Se previene el borrado físico de zonas.

  const liberarPlazasZona = async (idZona) => {
    try {
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibrePlaza = epLibre?.id_estado || 1;

      // Obtener plazas de la zona
      const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', idZona);
      if (!plazasZona || plazasZona.length === 0) return;

      // Obtener reservas individuales activas
      const { data: stActiva } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Activa').maybeSingle();
      const idEstActivaRes = stActiva?.id_estado || 1;
      const { data: resActivas } = await supabase.from('reserva').select('id_plaza').eq('id_estado', idEstActivaRes);
      const idsPlazasOcupadas = new Set((resActivas || []).map(r => r.id_plaza));

      // Filtrar las que están LIBRES de reservas individuales
      const idsAFreerar = plazasZona
        .map(p => p.id_plaza)
        .filter(id => !idsPlazasOcupadas.has(id));

      if (idsAFreerar.length > 0) {
        await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).in('id_plaza', idsAFreerar);
      }
    } catch (error) { console.error("Error al liberar zona:", error); }
  };

  const handleEditZona = (res) => {
    setEditingReservaId(res.id_reserva_zona);
    const toInputFormat = (str) => {
      if (!str) return '';
      const d = new Date(str);
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    };
    setFormData({
      id_persona: res.id_persona,
      id_zona: res.id_zona,
      id_tipo_reserva: res.id_tipo,
      descripcion: res.descripcion || '',
      Fecha_Hora_Inicio: toInputFormat(res.fecha_hora_inicio),
      Fecha_Hora_Fin: toInputFormat(res.fecha_hora_fin)
    });
    setShowModal(true);
  };

  // --- 5. FORMULARIO ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        if (!orgId) {
          setLoading(false);
          return Swal.fire('Error de Sesión', 'No se pudo identificar tu organización. Por favor, recarga la página.', 'error');
        }

        const { data: stActiva } = await supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Activa').maybeSingle();
        const idEstActivaRes = stActiva?.id_estado || 1;
        const { data: epReservado } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Reservad%').maybeSingle();
        const idEstReservPlaza = epReservado?.id_estado || 3;
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idEstLibrePlaza = epLibre?.id_estado || 1;

        if (activeTab === 'personas') {
            // --- Lógica de Reserva por Persona (Existente) ---
            if (formData.Fecha_Hora_Inicio && formData.Fecha_Hora_Fin) {
                const inicio = new Date(formData.Fecha_Hora_Inicio);
                const fin = new Date(formData.Fecha_Hora_Fin);
                const duracionHoras = (fin - inicio) / (1000 * 60 * 60);
                const cfg = JSON.parse(localStorage.getItem('appSettings') || '{}');
                const maxHoras = cfg.tiempoMaximoReserva || 4;
                if (duracionHoras > maxHoras) {
                    setLoading(false);
                    return Swal.fire('Duración excedida', `La reserva no puede superar las ${maxHoras} hora(s). Para cambiar esto, ve a configuración.`, 'warning');
                }
                if (duracionHoras <= 0) {
                    setLoading(false);
                    return Swal.fire('Fecha inválida', 'La fecha de fin debe ser posterior a la fecha de inicio.', 'error');
                }
            }

            const payload = {
                id_persona: formData.id_persona,
                id_plaza: parseInt(formData.Id_Plaza),
                id_vehiculo: formData.id_vehiculo ? parseInt(formData.id_vehiculo) : null,
                fecha_hora_inicio: new Date(formData.Fecha_Hora_Inicio).toISOString(),
                fecha_hora_fin: new Date(formData.Fecha_Hora_Fin).toISOString(),
                id_estado: idEstActivaRes,
                organizacion_id: orgId
            };

            if (isUpdating) {
                const { error: updateError } = await supabase.from('reserva').update(payload).eq('id_reserva', editingReservaId);
                if (updateError) throw updateError;
                if (parseInt(formData.Id_Plaza) !== originalPlazaId) {
                    await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', originalPlazaId);
                    await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
                }
            } else {
                const { error: insertError } = await supabase.from('reserva').insert([payload]);
                if (insertError) throw insertError;
                await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
            }

            const plazaSelect = plazasList.find(p => p.id_plaza === parseInt(formData.Id_Plaza));
            const personaSelect = personasList.find(p => p.id_persona === formData.id_persona);
            registrarLog(
                isUpdating ? 'Cambio de Estado' : 'Reserva Creada',
                `${isUpdating ? 'Edición' : 'Creación'} de reserva: ${personaSelect?.nombre} ${personaSelect?.apellido} en Plaza ${plazaSelect?.numero_plaza || formData.Id_Plaza}`, 
                parseInt(formData.Id_Plaza)
            );
            loadReservas();
            loadAuxData();
        } else {
            // --- Lógica de Reserva por Zona (Nueva) ---
            if (!formData.id_zona || !formData.id_tipo_reserva || !formData.descripcion || !formData.id_persona) {
              setLoading(false);
              return Swal.fire('Campos requeridos', 'Zona, Motivo y Descripción son obligatorios.', 'warning');
            }

              const selectedTipo = tiposReservaZona.find(t => t.id_tipo === parseInt(formData.id_tipo_reserva));

              const payloadZona = {
                id_zona: parseInt(formData.id_zona),
                id_tipo: parseInt(formData.id_tipo_reserva),
                id_persona: formData.id_persona,
                id_estado: idEstActivaRes,
                fecha_hora_inicio: new Date(formData.Fecha_Hora_Inicio).toISOString(),
                fecha_hora_fin: new Date(formData.Fecha_Hora_Fin).toISOString(),
                descripcion: formData.descripcion,
                id_empleado_aprobador: currentEmpleadoId,
                organizacion_id: orgId
              };

              if (isUpdating) {
                const { error } = await supabase.from('reserva_zona').update(payloadZona).eq('id_reserva_zona', editingReservaId);
                if (error) throw error;
                registrarLog('Cambio de Estado', `Edición de reserva de zona (ID: ${editingReservaId})`);
              } else {
                const { error } = await supabase.from('reserva_zona').insert([payloadZona]);
                if (error) throw error;

                // Marcar todas las plazas de la zona como reservadas
                const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', parseInt(formData.id_zona));
                if (plazasZona && plazasZona.length > 0) {
                    const idsPlazas = plazasZona.map(p => p.id_plaza);
                    await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).in('id_plaza', idsPlazas);
                }

                registrarLog('Reserva Creada', `Nueva reserva de zona: ${selectedTipo?.nombre || 'General'}`);
              }
            loadReservasZona();
        }
        
        resetForm();
        Swal.fire('¡Éxito!', `La reserva se ha ${isUpdating ? 'actualizado' : 'creado'} correctamente.`, 'success');
    } catch (error) { Swal.fire('Error', error.message, 'error'); } 
    finally { setLoading(false); }
  };

  const handleEdit = (res) => {
    setEditingReservaId(res.id_reserva);
    setOriginalPlazaId(res.id_plaza);
    const toInputFormat = (str) => {
      if (!str) return '';
      const d = new Date(str);
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    };
    setFormData({
      id_persona: res.id_persona,
      Id_Plaza: res.id_plaza,
      id_vehiculo: res.id_vehiculo ? String(res.id_vehiculo) : '',
      Fecha_Hora_Inicio: toInputFormat(res.fecha_hora_inicio),
      Fecha_Hora_Fin: toInputFormat(res.fecha_hora_fin)
    });
    setShowModal(true);
  };

  const resetForm = async () => {
    setFormData(initialForm);
    setEditingReservaId(null);
    setShowModal(false);
  };

  const handleOpenCreate = async () => {
    await resetForm();
    
    if (activeTab === 'personas') {
      // Recargar plazas libres al instante
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibrePlaza = epLibre?.id_estado || 1;
      const { data: plazaData } = await supabase.from('plaza').select('id_plaza, numero_plaza').eq('id_estado', idEstLibrePlaza).order('numero_plaza');
      setPlazasList(plazaData || []);
    } else {
      // Cargar tipos y zonas
      loadAuxDataZona();
    }

    setShowModal(true);
  };

  const formatDisplayDate = (dateStr) => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      return d.toLocaleString('es-DO', { 
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true 
      });
  };

  if (loadingOrg) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium animate-pulse">Identificando organización...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <header className="mb-6">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Reservaciones</h2>
                <p className="text-gray-500 font-medium text-sm mt-1">Gestión de tiempos, plazas y áreas reservadas.</p>
            </div>
            {canCreate && !showModal && (
            <button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-xl font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 text-sm">
                <FaPlus /> {activeTab === 'personas' ? 'Nueva Reserva' : 'Nueva Reserva de Zona'}
            </button>
            )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-6">
          <button 
            className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'personas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('personas')}
          >
            <FaUsers className="inline mr-2 mb-0.5" size={14} /> Reservas por Persona
          </button>
          <button 
            className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'zonas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('zonas')}
          >
            <FaLayerGroup className="inline mr-2 mb-0.5" size={14} /> Reservaciones por Zona
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Buscar persona o plaza..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
              </div>
              <button
                onClick={() => { loadReservas(); loadReservasZona(); loadAuxData(); loadAuxDataZona(); }}
                disabled={isRefreshing}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                title="Refrescar lista"
              >
                <FaSync className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            {activeTab === 'personas' ? (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Persona</th>
                      <th className="px-6 py-4 text-left">Plaza</th>
                      <th className="px-6 py-4 text-left">Fecha Creación</th>
                      <th className="px-6 py-4 text-left">Inicio</th>
                      <th className="px-6 py-4 text-left">Fin</th>
                      <th className="px-6 py-4 text-left">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                      {reservas.filter(r => `${r.persona?.nombre} ${r.persona?.apellido} ${r.plaza?.numero_plaza}`.toLowerCase().includes(searchTerm.toLowerCase())).map(r => {
                      const nombreEstado = r.estado?.nombre;
                      const isActive = nombreEstado === 'Activa' || r.id_estado === 1;
                      return (
                        <tr key={r.id_reserva} className={`transition-all text-sm ${isActive ? 'hover:bg-gray-50/50' : 'bg-gray-50/30 opacity-60 grayscale-[0.4]'}`}>
                          <td className="px-6 py-4 font-bold text-gray-700">{r.persona?.nombre} {r.persona?.apellido}</td>
                          <td className="px-6 py-4"><span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-black text-xs">#{r.plaza?.numero_plaza}</span></td>
                          <td className="px-6 py-4 text-gray-500 font-medium">
                            {r.created_at ? new Date(r.created_at).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.fecha_hora_inicio)}</td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.fecha_hora_fin)}</td>
                          <td className="px-6 py-4">
                              <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${isActive ? 'bg-green-100 text-green-800' : nombreEstado === 'Cancelada' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {nombreEstado || 'Activa'}
                              </span>
                          </td>
                          <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                            {isActive ? (
                               <>
                                {canEdit && <button onClick={() => handleMarkCompleted(r.id_reserva, r.id_plaza)} className="text-green-500 hover:scale-110 transition-transform" title="Completar"><FaCheckCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleCancelReserva(r.id_reserva, r.id_plaza)} className="text-orange-500 hover:scale-110 transition-transform" title="Cancelar"><FaTimesCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleEdit(r)} className="text-blue-500 hover:scale-110 transition-transform" title="Editar"><FaEdit size={20}/></button>}
                               </>
                            ) : (
                               <div className="text-gray-400 italic text-[10px] flex items-center gap-1 font-bold"><FaLock size={10} /> FINALIZADA</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                 <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Zona / Tipo</th>
                      <th className="px-6 py-4 text-left">Solicitado por</th>
                      <th className="px-6 py-4 text-left">Motivo</th>
                      <th className="px-6 py-4 text-left">Inicio</th>
                      <th className="px-6 py-4 text-left">Fin</th>
                      <th className="px-6 py-4 text-left">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {reservasZona.filter(rz => `${rz.zona?.nombre} ${rz.tipo?.nombre} ${rz.persona?.nombre} ${rz.motivo}`.toLowerCase().includes(searchTerm.toLowerCase())).map(rz => {
                      const nombreEstado = rz.estado?.nombre;
                      const isActive = nombreEstado === 'Activa' || rz.id_estado === 1;
                      return (
                        <tr key={rz.id_reserva_zona} className={`transition-all text-sm ${isActive ? 'hover:bg-gray-50/50' : 'bg-gray-50/30 opacity-60 grayscale-[0.4]'}`}>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">{rz.zona?.nombre}</span>
                              <span className="text-[10px] font-bold text-blue-500 uppercase">{rz.tipo?.nombre}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 font-medium">{rz.persona?.nombre} {rz.persona?.apellido}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col max-w-xs">
                              <p className="text-gray-900 font-semibold truncate" title={rz.tipo?.nombre}>{rz.tipo?.nombre}</p>
                              {rz.descripcion && <p className="text-[10px] text-gray-400 truncate" title={rz.descripcion}>{rz.descripcion}</p>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(rz.fecha_hora_inicio)}</td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(rz.fecha_hora_fin)}</td>
                          <td className="px-6 py-4">
                             <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${isActive ? 'bg-green-100 text-green-800' : nombreEstado === 'Cancelada' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                {nombreEstado || 'Activa'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                            {isActive ? (
                               <>
                                {canEdit && <button onClick={() => handleMarkCompletedZona(rz.id_reserva_zona)} className="text-green-500 hover:scale-110 transition-transform" title="Completar"><FaCheckCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleCancelReservaZona(rz.id_reserva_zona)} className="text-orange-500 hover:scale-110 transition-transform" title="Cancelar"><FaTimesCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleEditZona(rz)} className="text-blue-500 hover:scale-110 transition-transform" title="Editar"><FaEdit size={20}/></button>}
                               </>
                            ) : (
                               <div className="text-gray-400 italic text-[10px] flex items-center gap-1 font-bold"><FaLock size={10} /> FINALIZADA</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                 </table>
              </div>
            )}
          </div>
        </div>

        {showModal && (
        <aside className="w-full lg:w-[400px] flex-shrink-0">
           <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                    <FaCalendarAlt className="text-blue-600"/> {isUpdating ? 'Editar Reserva' : 'Nueva Reserva'}
                </h3>
                <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                    <FaTimesCircle size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Persona Solicitante *</label>
                   <SearchableSelect
                     options={personasList.filter(p => {
                        if (isUpdating && p.id_persona === formData.id_persona) return true;
                        // Solo filtrar si es reserva por persona (plaza única)
                        if (activeTab === 'personas') {
                          const tieneActiva = reservas.some(r => r.id_persona === p.id_persona && (r.estado?.nombre === 'Activa' || r.id_estado === 1));
                          return !tieneActiva;
                        }
                        return true;
                     }).map(p => ({ value: p.id_persona, label: `${p.nombre} ${p.apellido}` }))}
                     value={formData.id_persona}
                     onChange={(val) => setFormData({...formData, id_persona: val})}
                     placeholder="— Seleccionar Persona —"
                     focusRingClass="focus:ring-blue-500"
                     selectedItemClass="bg-blue-100 text-blue-800"
                     className="bg-gray-50/50 text-sm"
                   />
                 </div>

                 {activeTab === 'personas' && (
                    <>
                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Plaza *</label>
                      <SearchableSelect
                        options={plazasList.map(p => ({ value: p.id_plaza, label: p.numero_plaza }))}
                        value={formData.Id_Plaza}
                        onChange={(val) => setFormData({...formData, Id_Plaza: val})}
                        placeholder="— Seleccionar Plaza —"
                        focusRingClass="focus:ring-blue-500"
                        selectedItemClass="bg-blue-100 text-blue-800"
                        className="bg-gray-50/50 text-sm"
                      />
                    </div>
                    
                    {formData.id_persona && (
                      <div className="animate-fadeIn">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Vehículo Habilitado *</label>
                        {vehiculosMap[formData.id_persona]?.length > 0 ? (
                          <SearchableSelect
                            options={vehiculosMap[formData.id_persona].map(v => ({
                              value: v.id_vehiculo,
                              label: `${v.placa} - ${v.modelo?.marca?.nombre || ''} ${v.modelo?.nombre || ''}`,
                              subtitle: v.color?.nombre || 'Sin color'
                            }))}
                            value={formData.id_vehiculo}
                            onChange={(val) => setFormData({...formData, id_vehiculo: val})}
                            placeholder="— Seleccionar Vehículo —"
                            focusRingClass="focus:ring-blue-500"
                            selectedItemClass="bg-blue-100 text-blue-800"
                            className="bg-gray-50/50 text-sm"
                          />
                        ) : (
                          <div className="p-2 bg-red-50 border border-red-100 rounded-lg">
                            <p className="text-[10px] text-red-500 font-bold italic">Esta persona no tiene vehículos habilitados para reservar.</p>
                          </div>
                        )}
                      </div>
                    )}
                    </>
                 )}

                 {activeTab === 'zonas' && (
                   <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Zona a Reservar *</label>
                        <select 
                          className="w-full border rounded-lg p-2.5 text-sm focus:ring-blue-500 bg-gray-50 outline-none"
                          value={formData.id_zona}
                          onChange={(e) => setFormData({...formData, id_zona: e.target.value})}
                          required
                        >
                          <option value="">-- Zona --</option>
                          {zonasDisponibles.map(z => (
                            <option key={z.id_zona} value={z.id_zona}>{z.nombre}</option>
                          ))}
                        </select>
                      </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Motivo *</label>
                      <select
                        className="w-full border rounded-lg p-2.5 text-sm focus:ring-blue-500 bg-gray-50 outline-none"
                        value={formData.id_tipo_reserva}
                        onChange={(e) => setFormData({...formData, id_tipo_reserva: e.target.value})}
                        required
                      >
                        <option value="">-- Motivo --</option>
                        {tiposReservaZona.map(t => (
                          <option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción *</label>
                        <textarea
                          placeholder="Detalle de la reserva (Ej: reparación de luces, evento...)"
                          className="w-full border rounded-lg p-2.5 text-sm focus:ring-blue-500 bg-gray-50 outline-none h-24 resize-none"
                          value={formData.descripcion}
                          onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                          required
                        />
                    </div>
                  </div>
                   </>
                 )}

                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Inicio *</label>
                     <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none" value={formData.Fecha_Hora_Inicio} onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})} required />
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fin *</label>
                      <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none" value={formData.Fecha_Hora_Fin} onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})} required />
                   </div>
                 </div>
                 <div className="pt-2">
                   <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md flex justify-center items-center gap-2">
                     <FaCalendarAlt /> {isUpdating ? 'GUARDAR CAMBIOS' : 'CONFIRMAR RESERVA'}
                   </button>
                 </div>
              </form>
           </section>
        </aside>
        )}

      </div>
    </Layout>
  );
}



import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { 
  FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, 
  FaPlus, FaCalendarAlt, FaTrash, FaLock, FaSync,
  FaUsers, FaLayerGroup, FaMapMarkedAlt, FaInfoCircle, FaUserCheck
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';
import { ESTADO_PLAZA, ESTADO_RESERVA } from '../lib/constants';

export default function Reservaciones() {
  const { tienePermiso } = useRbac();
  const { orgId, loadingOrg } = useOrg();

  const canCreate = tienePermiso('Reservas', 'crear');
  const canEdit = tienePermiso('Reservas', 'editar');
  const canDelete = tienePermiso('Reservas', 'eliminar');

  const [activeTab, setActiveTab] = useState('personas'); // personas | zonas | aprobaciones
  const [reservas, setReservas] = useState([]);
  const [reservasZona, setReservasZona] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState(null);
  
  const [editingReservaId, setEditingReservaId] = useState(null);
  const [editingOriginalData, setEditingOriginalData] = useState(null); // Para diff logs
  const [originalPlazaId, setOriginalPlazaId] = useState(null); 

  const [personasList, setPersonasList] = useState([]); 
  const [plazasList, setPlazasList] = useState([]);
  const [tiposReservaZona, setTiposReservaZona] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);
  const [aprobacionesPendientes, setAprobacionesPendientes] = useState([]);
  
  const initialForm = {
    id_persona: '',
    Id_Plaza: '',
    id_zona: '',
    id_tipo_reserva: '',
    descripcion: '',
    Fecha_Hora_Fin: '',
    tipo_reserva: 'plaza', // plaza | zona
  };
  const [formData, setFormData] = useState(initialForm);
  const [plazasDeZona, setPlazasDeZona] = useState([]);
  const isUpdating = !!editingReservaId;

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    if (orgId) {
      loadAllData();

      // Sincronización en tiempo real
      const r_channel = supabase.channel('realtime_reservaciones_all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, loadAllData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva_zona' }, loadAllData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadAllData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, loadAllData)
        .subscribe();
        
      return () => { supabase.removeChannel(r_channel); };
    }
  }, [orgId]);
  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  // --- 2. VERIFICADOR DE TIEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => {
      checkExpiredReservations();
    }, 5000); 
    return () => clearInterval(timer);
  }, [reservas]); 

  const loadAllData = async () => {
    if (!orgId) return;
    setIsRefreshing(true);
    try {
        const ahoraISO = new Date().toISOString();
        const [
            { data: resData },
            { data: resZonaData },
            { data: epLibre },
            { data: uData },
            { data: erActivo },
            { data: asigsActivas },
            { data: zonas },
            { data: tiposRZ }
        ] = await Promise.all([
            supabase.from('reserva').select('*, persona:id_persona(id_persona, nombre, apellido), plaza:id_plaza(id_plaza, numero_plaza), estado:estado_reserva!id_estado(nombre)').eq('organizacion_id', orgId).order('fecha_hora_inicio', { ascending: false }),
            supabase.from('reserva_zona').select('*, zona:id_zona(id_zona, nombre), tipo:tipo_reserva_zona!id_tipo(nombre), persona:id_persona(id_persona, nombre, apellido), estado:estado_reserva!id_estado(nombre)').eq('organizacion_id', orgId).order('fecha_hora_inicio', { ascending: false }),
            supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle(),
            supabase.rpc('get_usuarios_org'),
            supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Activa').maybeSingle(),
            supabase.from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1),
            supabase.from('zona').select('*, estado:estado_zona!id_estado(nombre)').eq('organizacion_id', orgId).order('nombre'),
            supabase.from('tipo_reserva_zona').select('*').order('nombre')
        ]);

        setReservas(resData || []);
        setReservasZona(resZonaData || []);
        setAprobacionesPendientes((resZonaData || []).filter(rz => rz.id_estado === 5));
        
        const idLibre = ESTADO_PLAZA.LIBRE;
        const idResActiva = ESTADO_RESERVA.ACTIVA;

        // 1. Procesar Personas y Bloqueos
        const soloUsuarios = (uData || []).map(u => ({ id_persona: u.id_persona || u.persona_id, nombre: u.nombre, apellido: u.apellido }));
        
        // Calcular bloqueos por reservas activas
        const resActivasIds = new Set((resData || []).filter(r => r.id_estado === idResActiva && (!r.fecha_hora_fin || r.fecha_hora_fin > ahoraISO)).map(r => r.id_persona));
        
        setPersonasList(soloUsuarios.map(p => ({
            ...p,
            _ocupada: resActivasIds.has(p.id_persona),
            _razon: resActivasIds.has(p.id_persona) ? 'Reserva activa' : null
        })));

        // 2. Procesar Zonas y Plazas
        const zonasActivas = (zonas || []).filter(z => (z.estado?.nombre || 'Activa') !== 'Inactiva');
        setZonasDisponibles(zonasActivas);
        setTiposReservaZona(tiposRZ || []);

        const idsZonasActivas = zonasActivas.map(z => z.id_zona);
        if (idsZonasActivas.length > 0) {
            const { data: plazas } = await supabase.from('plaza').select('id_plaza, numero_plaza, id_zona').in('id_zona', idsZonasActivas).eq('id_estado', idLibre).order('numero_plaza');
            const asigIds = new Set((asigsActivas || []).map(a => a.id_plaza));
            setPlazasList((plazas || []).filter(p => !asigIds.has(p.id_plaza)));
        } else {
            setPlazasList([]);
        }

    } catch (error) { 
        console.error("Error loadAllData Reservaciones:", error.message); 
    } finally { 
        setIsRefreshing(false); 
    }
  };

  // Cargar plazas de una zona específica
  useEffect(() => {
    if (formData.id_zona && activeTab === 'zonas') {
      const fetchPlazas = async () => {
        const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;
        const { data } = await supabase.from('plaza').select('id_plaza, numero_plaza').eq('id_zona', formData.id_zona).eq('id_estado', idEstLibrePlaza).order('numero_plaza');
        setPlazasDeZona(data || []);
      };
      fetchPlazas();
    } else {
      setPlazasDeZona([]);
    }
  }, [formData.id_zona, activeTab]);

  // --- 3. LÓGICA DE PRECISIÓN PARA AUTO-COMPLETADO ---
  const checkExpiredReservations = async () => {
    // Usamos el tiempo local como referencia simplificada
    const ahora = new Date();
    
    // Fallback seguro para IDs
    const idEstVencida = ESTADO_RESERVA.VENCIDA;
    const idEstLibre = ESTADO_PLAZA.LIBRE;

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
        if (expired) console.log(`[AutoExpire] Reserva ${r.id_reserva} vencida. Ahora: ${ahora.toISOString()}, Fin: ${fechaFin.toISOString()}`);
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
          idEstCompletadoRes = ESTADO_RESERVA.COMPLETADA;
        }
        if (!idEstLibrePlaza) {
          idEstLibrePlaza = ESTADO_PLAZA.LIBRE;
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
            
            registrarLog({
              tipo_nombre: EVENT_TYPES.TICKET_CERRADO,
              descripcion: `Reserva finalizada (Completada) para plaza ${p?.numero_plaza || finalPlazaId}`,
              id_persona: currentPersonaId,
              organizacion_id: orgId,
              id_plaza: finalPlazaId,
              origen: 'Panel Web - Reservas'
            });
        }
        loadAllData(); 
    } catch (e) { console.error("Error al completar reserva:", e); }
  };

  const handleCancelReserva = async (idReserva, idPlaza) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La plaza se liberará.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        const idEstCanceladaRes = ESTADO_RESERVA.CANCELADA;
        const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;

        await supabase.from('reserva').update({ id_estado: idEstCanceladaRes }).eq('id_reserva', idReserva);
        if (idPlaza) await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', idPlaza);
        const p = plazasList.find(p => p.id_plaza === idPlaza);
        
        registrarLog({
          tipo_nombre: EVENT_TYPES.RESERVA_CANCELADA,
          descripcion: `Reserva cancelada por el administrador para plaza ${p?.numero_plaza || idPlaza}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          id_plaza: idPlaza,
          origen: 'Panel Web - Reservas'
        });
        loadAllData();
    }
  };

  // handleDelete y handleDeleteZona se mantienen como referencia pero ya no se usan en la UI para prevenir el borrado físico.

  const handleMarkCompletedZona = async (id, isAuto = false, forcedIds = null) => {
    try {
        let idEstCompletadoRes = forcedIds?.idEstCompletadoRes;
        if (!idEstCompletadoRes) {
          idEstCompletadoRes = ESTADO_RESERVA.COMPLETADA;
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
          
          registrarLog({
            tipo_nombre: EVENT_TYPES.TICKET_CERRADO,
            descripcion: `Reserva de zona/grupal finalizada (ID: ${id})`,
            id_persona: currentPersonaId,
            organizacion_id: orgId,
            origen: 'Panel Web - Reservas'
          });
        }
        loadAllData();
    } catch (e) { console.error("Error al completar zona:", e); }
  };

  const handleCancelReservaZona = async (id) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La zona quedará disponible.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        const idEstCanceladaRes = ESTADO_RESERVA.CANCELADA;
        
        // Info de zona
        const { data: resInfo } = await supabase.from('reserva_zona').select('id_zona').eq('id_reserva_zona', id).single();

        await supabase.from('reserva_zona').update({ id_estado: idEstCanceladaRes }).eq('id_reserva_zona', id);
        
        if (resInfo?.id_zona) {
          await liberarPlazasZona(resInfo.id_zona);
        }

        registrarLog('Reserva Cancelada', `Reserva de zona cancelada (ID: ${id})`);
        loadAllData();
    }
  };

  // Se previene el borrado físico de zonas.

  const liberarPlazasZona = async (idZona) => {
    try {
      const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;

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
      Fecha_Hora_Fin: toInputFormat(res.fecha_hora_fin),
      tipo_reserva: 'zona'
    });
    setEditingOriginalData(res);
    setShowModal(true);
  };

  const handleApproveRequest = async (rz) => {
    const confirm = await Swal.fire({
      title: '¿Confirmar Aprobación?',
      text: `Se activará la reserva para la zona ${rz.zona?.nombre}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar',
      confirmButtonColor: '#10B981'
    });

    if (confirm.isConfirmed) {
      setLoading(true);
      try {
        const { error } = await supabase.from('reserva_zona').update({ id_estado: 1 }).eq('id_reserva_zona', rz.id_reserva_zona);
        if (error) throw error;

        registrarLog({
          tipo_nombre: EVENT_TYPES.PERMISO_ACTUALIZADO,
          descripcion: `Reserva de zona (ID: ${rz.id_reserva_zona}) APROBADA por el administrador.`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Aprobaciones'
        });

        Swal.fire('¡Éxito!', 'La solicitud ha sido aprobada.', 'success');
        loadAllData();
      } catch (e) {
        Swal.fire('Error', e.message, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRejectRequest = async (rz) => {
    const { value: reason, isConfirmed } = await Swal.fire({
      title: 'Rechazar Solicitud',
      input: 'textarea',
      inputLabel: 'Motivo del rechazo',
      inputPlaceholder: 'Escribe aquí por qué se rechaza la solicitud...',
      showCancelButton: true,
      confirmButtonText: 'Confirmar Rechazo',
      confirmButtonColor: '#EF4444'
    });

    if (isConfirmed) {
      setLoading(true);
      try {
        const { error } = await supabase.from('reserva_zona').update({ 
          id_estado: 2,
          descripcion: rz.descripcion + ` [RECHAZADO: ${reason}]`
        }).eq('id_reserva_zona', rz.id_reserva_zona);

        if (error) throw error;

        registrarLog({
          tipo_nombre: EVENT_TYPES.RESERVA_CANCELADA,
          descripcion: `Reserva de zona (ID: ${rz.id_reserva_zona}) RECHAZADA. Motivo: ${reason}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Aprobaciones'
        });

        Swal.fire('Rechazada', 'La solicitud ha sido rechazada.', 'info');
        loadAllData();
      } catch (e) {
        Swal.fire('Error', e.message, 'error');
      } finally {
        setLoading(false);
      }
    }
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

        const idEstActivaRes = ESTADO_RESERVA.ACTIVA;
        const idEstReservPlaza = ESTADO_PLAZA.RESERVADA;
        const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;

        if (formData.tipo_reserva === 'plaza') {
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
            
            let descLog = '';
            if (isUpdating) {
              descLog = generarDescripcionCambio(editingOriginalData, payload, `Edición de reserva para ${personaSelect?.nombre}`);
            } else {
              descLog = `Nueva reserva creada para ${personaSelect?.nombre} ${personaSelect?.apellido} en Plaza ${plazaSelect?.numero_plaza}`;
            }

            registrarLog({
              tipo_nombre: isUpdating ? EVENT_TYPES.CAMBIO_ESTADO : EVENT_TYPES.RESERVA_CREADA,
              descripcion: descLog,
              id_persona: currentPersonaId,
              organizacion_id: orgId,
              id_plaza: parseInt(formData.Id_Plaza),
              origen: 'Panel Web - Reservas'
            });
            loadAllData();
        } else {
            // --- Lógica de Reserva por Zona / Grupo ---
            if (!formData.id_zona || !formData.id_tipo_reserva || !formData.id_persona) {
              setLoading(false);
              return Swal.fire('Campos requeridos', 'Zona, Motivo y Persona son obligatorios.', 'warning');
            }

            // VALIDACIÓN DE FECHA (Mismo día bloqueado según requerimiento)
            const inicio = new Date(formData.Fecha_Hora_Inicio);
            const hoy = new Date();
            hoy.setHours(23, 59, 59, 999);
            if (inicio <= hoy) {
                setLoading(false);
                return Swal.fire('Regla del Parqueo', 'Las reservaciones de zona deben realizarse con al menos 24h de antelación (a partir de mañana).', 'info');
            }

            const selectedZona = zonasDisponibles.find(z => z.id_zona === parseInt(formData.id_zona));
            const requiresApproval = selectedZona?.requiere_aprobacion;

            const payloadZona = {
              id_zona: parseInt(formData.id_zona),
              id_tipo: parseInt(formData.id_tipo_reserva),
              id_persona: formData.id_persona,
              id_estado: requiresApproval ? 5 : idEstActivaRes, // 5 = En Espera
              fecha_hora_inicio: new Date(formData.Fecha_Hora_Inicio).toISOString(),
              fecha_hora_fin: new Date(formData.Fecha_Hora_Fin).toISOString(),
              descripcion: formData.descripcion,
              id_empleado_aprobador: currentEmpleadoId,
              organizacion_id: orgId,
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
              const idsAMarcar = plazasZona?.map(p => p.id_plaza) || [];

              if (idsAMarcar.length > 0) {
                  await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).in('id_plaza', idsAMarcar);
              }

              registrarLog({
                tipo_nombre: isUpdating ? EVENT_TYPES.CAMBIO_ESTADO : EVENT_TYPES.RESERVA_CREADA,
                descripcion: isUpdating 
                  ? generarDescripcionCambio(editingOriginalData, payloadZona, 'Edición de reserva de zona')
                  : `Reserva de zona creada para ${tiposReservaZona.find(t => String(t.id_tipo) === String(formData.id_tipo_reserva))?.nombre ?? 'tipo desconocido'}. Plazas involucradas: ${idsAMarcar.length}`,
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Reservas'
              });
            }
            loadAllData();
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
      Fecha_Hora_Inicio: toInputFormat(res.fecha_hora_inicio),
      Fecha_Hora_Fin: toInputFormat(res.fecha_hora_fin)
    });
    setEditingOriginalData(res);
    setShowModal(true);
  };

  const resetForm = async () => {
    setFormData(initialForm);
    setEditingReservaId(null);
    setShowModal(false);
  };

  const handleOpenCreate = async (tipoForzado = null) => {
    await resetForm();
    const tipo = tipoForzado || (activeTab === 'personas' ? 'plaza' : 'zona');

    if (tipo === 'plaza') {
      const { data: plazaData } = await supabase
        .from('plaza').select('id_plaza, numero_plaza')
        .eq('organizacion_id', orgId)
        .eq('id_estado', ESTADO_PLAZA.LIBRE)
        .order('numero_plaza');
      setPlazasList(plazaData || []);
    } else {
      await loadAllData();
    }

    setFormData(prev => ({ ...prev, tipo_reserva: tipo }));
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
            {!showModal && (
              <div className="flex gap-2">
                {activeTab === 'personas' && (
                  <button
                    onClick={() => handleOpenCreate('plaza')}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-xl font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 text-sm"
                  >
                    <FaPlus /> Reserva de Plaza
                  </button>
                )}
                {activeTab === 'zonas' && (
                  <button
                    onClick={() => handleOpenCreate('zona')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-5 rounded-xl font-bold shadow-md flex items-center gap-2 transition-all active:scale-95 text-sm"
                  >
                    <FaLayerGroup size={13}/> Reserva de Zona
                  </button>
                )}
              </div>
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
          <button 
            className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'aprobaciones' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('aprobaciones')}
          >
            <div className="relative inline-block mr-2 mb-0.5">
              <FaUserCheck size={14} />
              {aprobacionesPendientes.length > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] font-black px-1 rounded-full animate-bounce">
                  {aprobacionesPendientes.length}
                </span>
              )}
            </div>
            Aprobaciones Pendientes
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
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
              <div className="flex items-center gap-2">
                {activeTab === 'personas' && (
                  <button
                    onClick={() => handleOpenCreate('plaza')}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-2 px-4 rounded-xl font-bold shadow flex items-center gap-2 text-sm transition-all"
                  >
                    <FaPlus size={12} /> Nueva Reserva de Plaza
                  </button>
                )}
                {activeTab === 'zonas' && (
                  <button
                    onClick={() => handleOpenCreate('zona')}
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2 px-4 rounded-xl font-bold shadow flex items-center gap-2 text-sm transition-all"
                  >
                    <FaLayerGroup size={12} /> Nueva Reserva de Zona
                  </button>
                )}
                <button
                  onClick={loadAllData}
                  disabled={isRefreshing}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                  title="Refrescar lista"
                >
                  <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
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
                      <th className="px-6 py-4 text-left">Tipo</th>
                      <th className="px-6 py-4 text-left">Zona / Plaza</th>
                      <th className="px-6 py-4 text-left">Inicio</th>
                      <th className="px-6 py-4 text-left">Fin</th>
                      <th className="px-6 py-4 text-left">Días</th>
                      <th className="px-6 py-4 text-left">Estado</th>
                      <th className="px-6 py-4 text-left">Placa</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {reservasZona.filter(rz => `${rz.zona?.nombre} ${rz.tipo?.nombre} ${rz.persona?.nombre} ${rz.placa}`.toLowerCase().includes(searchTerm.toLowerCase())).map(rz => {
                      const nombreEstado = rz.estado?.nombre;
                      const isActive = nombreEstado === 'Activa' || rz.id_estado === 1;
                      
                      // Cálculo de días
                      const d1 = new Date(rz.fecha_hora_inicio);
                      const d2 = new Date(rz.fecha_hora_fin);
                      const diffTime = Math.abs(d2 - d1);
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      return (
                        <tr key={rz.id_reserva_zona} className={`transition-all text-sm ${isActive ? 'hover:bg-gray-50/50' : 'bg-gray-50/30 opacity-60 grayscale-[0.4]'}`}>
                          <td className="px-6 py-4 font-bold text-blue-600 uppercase text-[10px]">Por Zona</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">{rz.zona?.nombre}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-tight">
                                  Zona Completa
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(rz.fecha_hora_inicio)}</td>
                          <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(rz.fecha_hora_fin)}</td>
                          <td className="px-6 py-4 text-gray-500 font-medium">
                             <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md font-bold text-xs">{diffDays}d</span>
                          </td>
                          <td className="px-6 py-4">
                             <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${isActive ? 'bg-green-100 text-green-800' : rz.id_estado === 5 ? 'bg-orange-100 text-orange-800 animate-pulse' : 'bg-blue-100 text-blue-800'}`}>
                                {nombreEstado || 'Activa'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                             <span className="font-mono font-black text-gray-700 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{rz.placa || 'N/A'}</span>
                          </td>
                          <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                            {isActive ? (
                               <>
                                {canEdit && <button onClick={() => handleMarkCompletedZona(rz.id_reserva_zona)} className="text-green-500 hover:scale-110 transition-transform" title="Completar"><FaCheckCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleCancelReservaZona(rz.id_reserva_zona)} className="text-orange-500 hover:scale-110 transition-transform" title="Cancelar"><FaTimesCircle size={20}/></button>}
                                {canEdit && <button onClick={() => handleEditZona(rz)} className="text-blue-500 hover:scale-110 transition-transform" title="Editar"><FaEdit size={20}/></button>}
                               </>
                            ) : (
                               <div className="text-gray-400 italic text-[10px] flex items-center gap-1 font-bold">
                                 {rz.id_estado === 5 ? <><FaSync className="animate-spin" size={10}/> PENDIENTE</> : <><FaLock size={10}/> FINALIZADA</>}
                               </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                 </table>
              </div>
            )}

            {activeTab === 'aprobaciones' && (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                 <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Solicitante</th>
                      <th className="px-6 py-4 text-left">Zona</th>
                      <th className="px-6 py-4 text-left">Fechas</th>
                      <th className="px-6 py-4 text-left">Placa</th>
                      <th className="px-6 py-4 text-left">Descripción / Motivo</th>
                      <th className="px-6 py-4 text-right">Decisión</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {aprobacionesPendientes.filter(rz => `${rz.zona?.nombre} ${rz.persona?.nombre} ${rz.placa}`.toLowerCase().includes(searchTerm.toLowerCase())).map(rz => (
                        <tr key={rz.id_reserva_zona} className="transition-all text-sm hover:bg-orange-50/30">
                          <td className="px-6 py-4 font-bold text-gray-700">{rz.persona?.nombre} {rz.persona?.apellido}</td>
                          <td className="px-6 py-4 text-blue-600 font-black">{rz.zona?.nombre}</td>
                          <td className="px-6 py-4">
                             <div className="text-[10px] space-y-0.5">
                                <p className="font-bold text-gray-600">INICIO: {formatDisplayDate(rz.fecha_hora_inicio)}</p>
                                <p className="font-bold text-orange-600">FIN: {formatDisplayDate(rz.fecha_hora_fin)}</p>
                             </div>
                          </td>
                          <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded font-mono font-black">{rz.placa}</span></td>
                          <td className="px-6 py-4">
                             <div className="max-w-xs overflow-hidden">
                                <p className="text-[10px] font-black text-gray-400 uppercase mb-0.5">{rz.tipo?.nombre}</p>
                                <p className="text-xs text-gray-600 italic">"{rz.descripcion}"</p>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                             <button 
                                onClick={() => handleApproveRequest(rz)} 
                                className="bg-green-100 hover:bg-green-600 text-green-700 hover:text-white px-3 py-1.5 rounded-lg font-black text-[10px] transition-all flex items-center gap-1"
                             >
                               <FaCheckCircle size={14}/> APROBAR
                             </button>
                             <button 
                                onClick={() => handleRejectRequest(rz)} 
                                className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg font-black text-[10px] transition-all flex items-center gap-1"
                             >
                               <FaTimesCircle size={14}/> RECHAZAR
                             </button>
                          </td>
                        </tr>
                    ))}
                    {aprobacionesPendientes.length === 0 && (
                      <tr>
                        <td colSpan="6" className="px-6 py-20 text-center">
                           <div className="flex flex-col items-center gap-2 opacity-30 text-gray-400">
                             <FaUserCheck size={48} />
                             <p className="font-black uppercase tracking-tighter">No hay aprobaciones pendientes</p>
                           </div>
                        </td>
                      </tr>
                    )}
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

              {/* Selector de TIPO: Plaza vs Zona */}
              {!isUpdating && (
                <div className="mb-4">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Tipo de Reserva</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, tipo_reserva: 'plaza'})}
                      className={`py-3 rounded-xl text-[10px] font-black flex flex-col items-center gap-1 transition-all border-2 ${
                        formData.tipo_reserva === 'plaza'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-500'
                      }`}
                    >
                      <FaMapMarkedAlt size={16}/>
                      POR PLAZA
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, tipo_reserva: 'zona'})}
                      className={`py-3 rounded-xl text-[10px] font-black flex flex-col items-center gap-1 transition-all border-2 ${
                        formData.tipo_reserva === 'zona'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-500'
                      }`}
                    >
                      <FaLayerGroup size={16}/>
                      POR ZONA
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Persona Solicitante *</label>
                   <SearchableSelect
                     options={personasList.filter(p => {
                        if (isUpdating && p.id_persona === formData.id_persona) return true;
                        // Solo filtrar si es reserva por PERSONA/PLAZA (regla: 1 plaza activa por persona)
                        if (formData.tipo_reserva === 'plaza') {
                          const tieneActiva = reservas.some(r => r.id_persona === p.id_persona && (r.estado?.nombre === 'Activa' || r.id_estado === 1));
                          return !tieneActiva;
                        }
                        // Para Zonas no aplicamos esta restricción rígida
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

                 {formData.tipo_reserva === 'plaza' && (
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
                    
                    {/* El selector de vehículo ha sido eliminado para desacoplar el derecho de reserva del vehículo */}
                    </>
                 )}

                 {formData.tipo_reserva === 'zona' && (
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

                      {/* Advertencia de Aprobación */}
                      {(() => {
                        const z = zonasDisponibles.find(z => z.id_zona === parseInt(formData.id_zona));
                        if (z?.requiere_aprobacion) {
                          return (
                            <div className="bg-orange-50 border border-orange-200 p-3 rounded-xl flex gap-3 items-center animate-pulse">
                              <FaInfoCircle className="text-orange-500 flex-shrink-0" />
                              <p className="text-[10px] font-bold text-orange-700 leading-tight uppercase">⚠️ Esta zona requiere aprobación del administrador</p>
                            </div>
                          );
                        }
                        return null;
                      })()}

                  </div>
                    </>
                  )}

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Inicio *</label>
                      <input
                        type="datetime-local"
                        className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none"
                        value={formData.Fecha_Hora_Inicio}
                        onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                       <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Fin *</label>
                       <input
                        type="datetime-local"
                        className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none"
                        value={formData.Fecha_Hora_Fin}
                        onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                 <div className="pt-2">
                   <button
                     type="submit"
                     disabled={loading}
                     className={`w-full text-white py-3 rounded-xl font-black tracking-wide transition-all shadow-md flex justify-center items-center gap-2 text-sm ${
                       formData.tipo_reserva === 'zona'
                         ? 'bg-emerald-600 hover:bg-emerald-700'
                         : 'bg-blue-600 hover:bg-blue-700'
                     }`}
                   >
                     <FaCalendarAlt />
                     {isUpdating
                       ? 'GUARDAR CAMBIOS'
                       : formData.tipo_reserva === 'zona'
                         ? 'CONFIRMAR RESERVA DE ZONA'
                         : 'CONFIRMAR RESERVA DE PLAZA'}
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

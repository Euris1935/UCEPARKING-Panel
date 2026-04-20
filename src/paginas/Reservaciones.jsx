import { useEffect, useState, useRef } from 'react';
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
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';
import { ESTADO_PLAZA, ESTADO_RESERVA } from '../lib/constants';


/* ── Componente SearchableSelect ── */
function SearchableSelect({ value, onChange, options, placeholder, required }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || '';
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" value={value} required={required} />
      <input
        type="text"
        className="w-full border-2 border-gray-100 p-2.5 rounded-xl text-sm outline-none bg-gray-50/50"
        placeholder={placeholder || 'Buscar...'}
        value={open ? search : selectedLabel}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={e => setSearch(e.target.value)}
      />
      {open && (
        <div className="absolute z-50 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-2 text-sm text-gray-400">Sin resultados</div>
          ) : filtered.map(o => (
            <div
              key={o.value}
              className={`p-2 text-sm cursor-pointer hover:bg-blue-50 ${String(o.value) === String(value) ? 'bg-blue-100 font-bold' : ''}`}
              onClick={() => { onChange(o.value); setSearch(''); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Reservaciones() {
  const { tienePermiso } = useRbac();
  const { orgId, loadingOrg } = useOrg();
  const [serverTimeOffset, setServerTimeOffset] = useState(0); 

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
  const [editingOriginalData, setEditingOriginalData] = useState(null); 
  const [originalPlazaId, setOriginalPlazaId] = useState(null); 

  const [personasList, setPersonasList] = useState([]);
  const [plazasList, setPlazasList] = useState([]);
  const [tiposReservaZona, setTiposReservaZona] = useState([]);
  const [zonasDisponibles, setZonasDisponibles] = useState([]);
  
  const initialForm = {
    id_persona: '',
    Id_Plaza: '',
    id_zona: '',
    id_tipo_reserva: '',
    descripcion: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: '',
    es_reserva_grupal: false,
    ids_plazas_grupal: []
  };
  const [formData, setFormData] = useState(initialForm);
  const [plazasDeZona, setPlazasDeZona] = useState([]); 
  const isUpdating = !!editingReservaId;

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    if (orgId) {
      loadAllData();

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
    loadAllData();
  }, [activeTab, orgId]);

  // --- 2. VERIFICADOR DE TIEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => {
      checkExpiredReservations();
    }, 5000);
    return () => clearInterval(timer);
  }, [reservas, reservasZona]);

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
            supabase.from('reserva').select('*, persona(id_persona, nombre, apellido), plaza(id_plaza, numero_plaza), estado:estado_reserva(nombre)').eq('organizacion_id', orgId).order('fecha_hora_inicio', { ascending: false }),
            supabase.from('reserva_zona').select('*, zona(id_zona, nombre), tipo:tipo_reserva_zona(nombre), persona(id_persona, nombre, apellido), estado:estado_reserva(nombre)').eq('organizacion_id', orgId).order('fecha_hora_inicio', { ascending: false }),
            supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle(),
            supabase.rpc('get_usuarios_org').eq('organizacion_id', orgId),
            supabase.from('estado_reserva').select('id_estado').ilike('nombre', 'Activa').maybeSingle(),
            supabase.from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1),
            supabase.from('zona').select('id_zona, nombre, estado_zona(nombre)').eq('organizacion_id', orgId).order('nombre'),
            supabase.from('tipo_reserva_zona').select('*').order('nombre')
        ]);

        setReservas(resData || []);
        setReservasZona(resZonaData || []);
        
        const idLibre = ESTADO_PLAZA.LIBRE;
        const idResActiva = ESTADO_RESERVA.ACTIVA;

        const soloUsuarios = (uData || []).map(u => ({ id_persona: u.id_persona || u.persona_id, nombre: u.nombre, apellido: u.apellido }));
        const resActivasIds = new Set((resData || []).filter(r => r.id_estado === idResActiva && (!r.fecha_hora_fin || r.fecha_hora_fin > ahoraISO)).map(r => r.id_persona));
        
        setPersonasList(soloUsuarios.map(p => ({
            ...p,
            _ocupada: resActivasIds.has(p.id_persona),
            _razon: resActivasIds.has(p.id_persona) ? 'Reserva activa' : null
        })));

        const zonasActivas = (zonas || []).filter(z => (z.estado_zona?.nombre || 'Activa') === 'Activa');
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

  const checkExpiredReservations = async () => {
    const ahora = new Date(Date.now() + serverTimeOffset);
    const idEstVencida = ESTADO_RESERVA.VENCIDA;
    const idEstLibre = ESTADO_PLAZA.LIBRE;

    const commonIds = {
      idEstVencidaRes: idEstVencida,
      idEstLibrePlaza: idEstLibre
    };

    if (reservas.length > 0) {
      const vencidas = reservas.filter(r => {
        const nombreEstado = r.estado?.nombre?.trim();
        const esActiva = nombreEstado === 'Activa' || r.id_estado === 1;
        if (!esActiva) return false;
        if (!r.fecha_hora_fin) return false;
        const fechaFin = new Date(r.fecha_hora_fin);
        return ahora.getTime() >= (fechaFin.getTime() + 60000);
      });
      for (const res of vencidas) {
        const targetPlazaId = res.id_plaza || res.plaza?.id_plaza;
        await handleMarkCompleted(res.id_reserva, targetPlazaId, true, { ...commonIds, idEstCompletadoRes: commonIds.idEstVencidaRes });
      }
    }

    if (reservasZona.length > 0) {
      const vencidasZ = reservasZona.filter(rz => {
        const nombreEstado = rz.estado?.nombre?.trim();
        const esActiva = nombreEstado === 'Activa' || rz.id_estado === 1;
        if (!esActiva) return false;
        if (!rz.fecha_hora_fin) return false;
        return ahora.getTime() >= (new Date(rz.fecha_hora_fin).getTime() + 60000);
      });
      for (const rz of vencidasZ) {
        await handleMarkCompletedZona(rz.id_reserva_zona, true, { ...commonIds, idEstCompletadoRes: commonIds.idEstVencidaRes });
      }
    }
  };

  const handleMarkCompleted = async (id, idPlaza, isAuto = false, forcedIds = null) => {
    try {
        let idEstCompletadoRes = forcedIds?.idEstCompletadoRes;
        let idEstLibrePlaza = forcedIds?.idEstLibrePlaza;
        let finalPlazaId = (idPlaza && typeof idPlaza === 'object') ? idPlaza.id_plaza : idPlaza;

        if (!finalPlazaId) {
          const { data: resData } = await supabase.from('reserva').select('id_plaza').eq('id_reserva', id).maybeSingle();
          finalPlazaId = resData?.id_plaza;
        }

        if (!idEstCompletadoRes) idEstCompletadoRes = ESTADO_RESERVA.COMPLETADA;
        if (!idEstLibrePlaza) idEstLibrePlaza = ESTADO_PLAZA.LIBRE;

        if (finalPlazaId) {
          await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', finalPlazaId);
        }
        await supabase.from('reserva').update({ id_estado: idEstCompletadoRes }).eq('id_reserva', id);

        if (!isAuto) {
            Swal.fire('Éxito', 'Reserva completada.', 'success');
            registrarLog({
              tipo_nombre: EVENT_TYPES.TICKET_CERRADO,
              descripcion: `Reserva finalizada (Completada)`,
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
        
        registrarLog({
          tipo_nombre: EVENT_TYPES.RESERVA_CANCELADA,
          descripcion: `Reserva cancelada por el administrador`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          id_plaza: idPlaza,
          origen: 'Panel Web - Reservas'
        });
        loadAllData();
    }
  };

  const handleMarkCompletedZona = async (id, isAuto = false, forcedIds = null) => {
    try {
        let idEstCompletadoRes = forcedIds?.idEstCompletadoRes;
        if (!idEstCompletadoRes) idEstCompletadoRes = ESTADO_RESERVA.COMPLETADA;

        const { data: resInfo } = await supabase.from('reserva_zona').select('id_zona').eq('id_reserva_zona', id).single();
        if (resInfo?.id_zona) {
          await liberarPlazasZona(resInfo.id_zona);
        }
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
        const { data: resInfo } = await supabase.from('reserva_zona').select('id_zona').eq('id_reserva_zona', id).single();

        await supabase.from('reserva_zona').update({ id_estado: idEstCanceladaRes }).eq('id_reserva_zona', id);
        if (resInfo?.id_zona) {
          await liberarPlazasZona(resInfo.id_zona);
        }
        registrarLog({
          tipo_nombre: EVENT_TYPES.TICKET_CERRADO,
          descripcion: `Reserva de zona cancelada (ID: ${id})`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Reservas'
        });
        loadAllData();
    }
  };

  const liberarPlazasZona = async (idZona) => {
    try {
      const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;
      const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', idZona);
      if (!plazasZona || plazasZona.length === 0) return;

      const idEstActivaRes = ESTADO_RESERVA.ACTIVA;
      const { data: resActivas } = await supabase.from('reserva').select('id_plaza').eq('id_estado', idEstActivaRes);
      const idsPlazasOcupadas = new Set((resActivas || []).map(r => r.id_plaza));
      const idsAFreerar = plazasZona.map(p => p.id_plaza).filter(id => !idsPlazasOcupadas.has(id));

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
      es_reserva_grupal: res.es_reserva_grupal || false,
      ids_plazas_grupal: res.ids_plazas_grupal || []
    });
    setEditingOriginalData(res);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        if (!orgId) {
          setLoading(false);
          return Swal.fire('Error de Sesión', 'No se pudo identificar tu organización.', 'error');
        }

        const idEstActivaRes = ESTADO_RESERVA.ACTIVA;
        const idEstReservPlaza = ESTADO_PLAZA.RESERVADA;
        const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;

        if (activeTab === 'personas') {
            const payload = {
                id_persona: formData.id_persona,
                id_plaza: parseInt(formData.Id_Plaza),
                fecha_hora_inicio: new Date(formData.Fecha_Hora_Inicio).toISOString(),
                fecha_hora_fin: new Date(formData.Fecha_Hora_Fin).toISOString(),
                id_estado: idEstActivaRes,
                organizacion_id: orgId
            };

            if (isUpdating) {
                await supabase.from('reserva').update(payload).eq('id_reserva', editingReservaId);
                if (parseInt(formData.Id_Plaza) !== originalPlazaId) {
                    await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', originalPlazaId);
                    await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
                }
            } else {
                await supabase.from('reserva').insert([payload]);
                await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
            }

            registrarLog({
              tipo_nombre: isUpdating ? EVENT_TYPES.CAMBIO_ESTADO : EVENT_TYPES.RESERVA_CREADA,
              descripcion: isUpdating ? 'Edición de reserva' : 'Nueva reserva creada',
              id_persona: currentPersonaId,
              organizacion_id: orgId,
              id_plaza: parseInt(formData.Id_Plaza),
              origen: 'Panel Web - Reservas'
            });
            loadAllData();
        } else {
            const payloadZona = {
              id_zona: parseInt(formData.id_zona),
              id_tipo: parseInt(formData.id_tipo_reserva),
              id_persona: formData.id_persona,
              id_estado: idEstActivaRes,
              fecha_hora_inicio: new Date(formData.Fecha_Hora_Inicio).toISOString(),
              fecha_hora_fin: new Date(formData.Fecha_Hora_Fin).toISOString(),
              descripcion: formData.descripcion,
              id_empleado_aprobador: currentEmpleadoId,
              organizacion_id: orgId,
              es_reserva_grupal: formData.es_reserva_grupal,
              ids_plazas_grupal: formData.es_reserva_grupal ? formData.ids_plazas_grupal : []
            };

            if (isUpdating) {
              await supabase.from('reserva_zona').update(payloadZona).eq('id_reserva_zona', editingReservaId);
              registrarLog({
                tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
                descripcion: 'Edición de reserva de zona',
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Reservas'
              });
            } else {
              await supabase.from('reserva_zona').insert([payloadZona]);
              let idsAMarcar = [];
              if (formData.es_reserva_grupal) {
                idsAMarcar = formData.ids_plazas_grupal;
              } else {
                const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', parseInt(formData.id_zona));
                idsAMarcar = plazasZona?.map(p => p.id_plaza) || [];
              }
              if (idsAMarcar.length > 0) {
                  await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).in('id_plaza', idsAMarcar);
              }
              registrarLog({
                tipo_nombre: EVENT_TYPES.RESERVA_CREADA,
                descripcion: 'Reserva de zona/grupo creada',
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Reservas'
              });
            }
            loadAllData();
        }
        resetForm();
        Swal.fire('¡Éxito!', `Reserva ${isUpdating ? 'actualizada' : 'creada'}.`, 'success');
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

  const handleOpenCreate = async () => {
    await resetForm();
    if (activeTab === 'personas') {
      const idEstLibrePlaza = ESTADO_PLAZA.LIBRE;
      const { data: plazaData } = await supabase.from('plaza').select('id_plaza, numero_plaza').eq('id_estado', idEstLibrePlaza).order('numero_plaza');
      setPlazasList(plazaData || []);
    } else {
      loadAllData();
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
          <p className="text-gray-500 font-medium animate-pulse">Cargando organización...</p>
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
                onClick={loadAllData}
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
                      <th className="px-6 py-4 text-left">Inicio</th>
                      <th className="px-6 py-4 text-left">Fin</th>
                      <th className="px-6 py-4 text-left">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {reservasZona.filter(rz => `${rz.zona?.nombre} ${rz.tipo?.nombre} ${rz.persona?.nombre}`.toLowerCase().includes(searchTerm.toLowerCase())).map(rz => {
                      const nombreEstado = rz.estado?.nombre;
                      const isActive = nombreEstado === 'Activa' || rz.id_estado === 1;
                      return (
                        <tr key={rz.id_reserva_zona} className={`transition-all text-sm ${isActive ? 'hover:bg-gray-50/50' : 'bg-gray-50/30 opacity-60 grayscale-[0.4]'}`}>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">{rz.zona?.nombre}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${rz.es_reserva_grupal ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'} uppercase tracking-tight`}>
                                  {rz.es_reserva_grupal ? 'Grupo' : 'Zona'}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">{rz.tipo?.nombre}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 font-medium">{rz.persona?.nombre} {rz.persona?.apellido}</td>
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
                     options={personasList.map(p => ({ value: p.id_persona, label: `${p.nombre} ${p.apellido}` }))}
                     value={formData.id_persona}
                     onChange={(val) => setFormData({...formData, id_persona: val})}
                     placeholder="— Seleccionar Persona —"
                   />
                 </div>
                 {activeTab === 'personas' && (
                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Plaza *</label>
                      <SearchableSelect
                        options={plazasList.map(p => ({ value: p.id_plaza, label: p.numero_plaza }))}
                        value={formData.Id_Plaza}
                        onChange={(val) => setFormData({...formData, Id_Plaza: val})}
                        placeholder="— Seleccionar Plaza —"
                      />
                    </div>
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
                           placeholder="Detalle de la reserva..."
                           className="w-full border rounded-lg p-2.5 text-sm focus:ring-blue-500 bg-gray-50 outline-none h-24 resize-none"
                           value={formData.descripcion}
                           onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                           required
                         />
                    </div>
                    <div className="md:col-span-2 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-200">
                       <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Alcance de la Reserva</label>
                       <div className="grid grid-cols-2 gap-2">
                          <button 
                            type="button"
                            className={`py-2 text-[10px] font-black rounded-lg transition-all ${!formData.es_reserva_grupal ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-400 border'}`}
                            onClick={() => setFormData({...formData, es_reserva_grupal: false})}
                          >TODA LA ZONA</button>
                          <button 
                            type="button"
                            className={`py-2 text-[10px] font-black rounded-lg transition-all ${formData.es_reserva_grupal ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-400 border'}`}
                            onClick={() => setFormData({...formData, es_reserva_grupal: true})}
                          >SELECCIONAR GRUPO</button>
                       </div>
                       {formData.es_reserva_grupal && (
                         <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 flex justify-between">
                               <span>Selecciona Plazas </span>
                               <span className="text-purple-600">({formData.ids_plazas_grupal.length} Marcadas)</span>
                            </label>
                            <div className="max-h-32 overflow-y-auto grid grid-cols-3 gap-1.5 p-1 bg-white rounded-lg border shadow-inner">
                               {plazasDeZona.map(p => (
                                 <button
                                   key={p.id_plaza}
                                   type="button"
                                   onClick={() => {
                                      const ids = [...formData.ids_plazas_grupal];
                                      if (ids.includes(p.id_plaza)) {
                                        setFormData({...formData, ids_plazas_grupal: ids.filter(id => id !== p.id_plaza)});
                                      } else {
                                        setFormData({...formData, ids_plazas_grupal: [...ids, p.id_plaza]});
                                      }
                                   }}
                                   className={`py-1.5 rounded text-[10px] font-bold transition-all border ${formData.ids_plazas_grupal.includes(p.id_plaza) ? 'bg-purple-100 border-purple-300 text-purple-700 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-300'}`}
                                 >
                                   {p.numero_plaza}
                                 </button>
                               ))}
                            </div>
                         </div>
                       )}
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

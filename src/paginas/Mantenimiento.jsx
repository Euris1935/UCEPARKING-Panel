
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaTools, FaCalendarAlt, FaEdit, FaTrash, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_MANT, ESTADO_PLAZA, ESTADO_ZONA, ESTADO_DISPOSITIVO } from '../lib/constants';

export default function Mantenimiento() {
    const { orgId } = useOrg();
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Catalogos para el formulario
    const [dispositivos, setDispositivos] = useState([]);
    const [allDispositivos, setAllDispositivos] = useState([]);
    const [plazasList, setPlazasList] = useState([]);
    const [allPlazas, setAllPlazas] = useState([]);
    const [zonas, setZonas] = useState([]);
    const [allZonas, setAllZonas] = useState([]);
    const [tecnicos, setTecnicos] = useState([]);
    const [tiposMantenimiento, setTiposMantenimiento] = useState([]);
    const [estadosMantenimiento, setEstadosMantenimiento] = useState([]);

    // Modal y Formulario
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [resueltosIds, setResueltosIds] = useState(new Set()); // track locally
    const [dispositivosOcupados, setDispositivosOcupados] = useState(new Set()); // dispositivos con mantenimiento activo
    const [targetType, setTargetType] = useState('dispositivo'); // 'zona', 'plaza', 'dispositivo'
    const [formData, setFormData] = useState({
        descripcion: '',
        id_dispositivo: '',
        id_plaza: '',
        id_zona: '',
        id_empleado: '',
        id_tipo: '',
        id_estado: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: ''
    });

    const [currentPersonaId,    setCurrentPersonaId]    = useState(null);
    const [changingStatusFor,   setChangingStatusFor]   = useState(null);
    const [newStatusChoice,     setNewStatusChoice]     = useState('');
    useEffect(() => {
        if (orgId) {
            loadData();
            // Suscripción en tiempo real
            const channel = supabase.channel('realtime_mantenimiento')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'mantenimiento' }, loadData)
                .subscribe();
            return () => supabase.removeChannel(channel);
        }
    }, [orgId]);

    const loadData = async () => {
        if (!orgId) return;
        setLoading(true);
        setIsRefreshing(true);
        try {
            // 1. Carga paralela de todo lo necesario
            const [
                { data: mantData, error: mantErr },
                { data: dispData },
                { data: rpcUsers, error: rpcErr },
                { data: allEmps },
                { data: fullZonas },
                { data: fullPlazas },
                { data: tipoData },
                { data: estData }
            ] = await Promise.all([
                supabase.from('mantenimiento').select(`
                    id_mantenimiento, fecha_inicio, fecha_fin, descripcion, id_dispositivo, id_zona, id_plaza, id_empleado, id_tipo, id_estado,
                    estado:estado_mantenimiento!id_estado ( nombre ),
                    tipo:tipo_mantenimiento!id_tipo ( nombre ),
                    dispositivo:id_dispositivo ( id_dispositivo, id_plaza, tipo:tipo_dispositivo!id_tipo ( nombre ) ),
                    empleado:id_empleado ( id_empleado, persona:id_persona ( nombre, apellido ) )
                `).eq('organizacion_id', orgId).order('fecha_inicio', { ascending: false }),
                supabase.from('dispositivo').select('id_dispositivo, id_plaza, id_estado, tipo:tipo_dispositivo!id_tipo(nombre), modelo:id_modelo(nombre, marca:id_marca(nombre)), plaza:id_plaza(numero_plaza)').eq('organizacion_id', orgId),
                supabase.rpc('get_usuarios_org'),
                supabase.from('empleado').select('id_empleado, id_persona').eq('organizacion_id', orgId),
                supabase.from('zona').select('id_zona, nombre, nivel_piso, id_estado, estado:estado_zona!id_estado(nombre)').eq('organizacion_id', orgId),
                supabase.from('plaza').select('id_plaza, numero_plaza, id_zona, id_estado, estado:estado_plaza!id_estado(nombre), zona:id_zona(id_zona, nombre, nivel_piso)').eq('organizacion_id', orgId),
                supabase.from('tipo_mantenimiento').select('*').order('nombre'),
                supabase.from('estado_mantenimiento').select('*').order('nombre')
            ]);

            if (mantErr) throw mantErr;
            setMantenimientos(mantData || []);
            setDispositivosOcupados(new Set((mantData || []).filter(m => !m.fecha_fin).map(m => m.id_dispositivo)));

            // Procesar Técnicos
            let users = [];
            if (!rpcErr && rpcUsers) {
                users = rpcUsers;
            } else {
                const { data: directUsers } = await supabase.from('usuario').select('id_persona, rol_id, rol:rol_id(nombre), persona:id_persona(nombre, apellido)').eq('organizacion_id', orgId);
                users = (directUsers || []).map(u => ({ id_persona: u.id_persona, nombre: u.persona?.nombre, apellido: u.persona?.apellido, nombre_rol: u.rol?.nombre }));
            }

            const tecnicosFiltrados = users.filter(u => {
                const rName = (u.nombre_rol || u.rol_nombre || '').toLowerCase();
                const personaId = u.id_persona || u.persona_id;
                return rName.includes('tec') && (allEmps || []).some(e => String(e.id_persona) === String(personaId));
            }).map(u => {
                const personaId = u.id_persona || u.persona_id;
                const emp = (allEmps || []).find(e => String(e.id_persona) === String(personaId));
                return { id_empleado: emp.id_empleado, nombre_label: `${u.nombre || ''} ${u.apellido || ''}`.trim(), disabled: false };
            });

            setTecnicos(tecnicosFiltrados.sort((a,b) => a.nombre_label.localeCompare(b.nombre_label)));
            setAllDispositivos(dispData || []);
            setDispositivos((dispData || []).filter(d => d.id_estado === 1));
            setAllPlazas(fullPlazas || []);
            setPlazasList((fullPlazas || []).filter(p => p.estado?.nombre === 'Libre' && (fullZonas || []).some(z => z.id_zona === p.id_zona && z.estado?.nombre === 'Activa')));
            setAllZonas(fullZonas || []);
            setZonas((fullZonas || []).filter(z => z.estado?.nombre === 'Activa'));
            setTiposMantenimiento(tipoData || []);
            setEstadosMantenimiento(estData || []);

        } catch (error) {
            console.error("Error loadData Mantenimiento:", error.message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleRegistrarLog = async (tipo_nombre, descripcion, idDispositivo = null, idPlaza = null) => {
        if (!currentPersonaId) return;
        await registrarLog({
            tipo_nombre,
            descripcion,
            id_persona: currentPersonaId,
            organizacion_id: orgId,
            id_plaza: idPlaza,
            id_dispositivo: idDispositivo,
            origen: 'Panel Web - Mantenimiento'
        });
    };

    const handleEdit = (item) => {
        setEditingId(item.id_mantenimiento);
        let type = 'dispositivo';
        if (item.id_zona) type = 'zona';
        else if (item.id_plaza) type = 'plaza';
        setTargetType(type);

        setFormData({
            descripcion: item.descripcion || '',
            id_dispositivo: item.id_dispositivo || '',
            id_plaza: item.id_plaza || '',
            id_zona: item.id_zona || '',
            id_empleado: item.id_empleado || '',
            id_tipo: item.id_tipo || '',
            id_estado: item.id_estado || '',
            fecha_inicio: item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '',
            fecha_fin: item.fecha_fin ? item.fecha_fin.split('T')[0] : ''
        });
        setShowModal(true);
    };

    // Lógica de Sincronización en Cascada
    const syncEntityStatus = async (target, id, isStarting) => {
        try {
            const statusZon = isStarting ? ESTADO_ZONA.MANTENIMIENTO : ESTADO_ZONA.ACTIVA;
            const statusPla = isStarting ? ESTADO_PLAZA.MANTENIMIENTO : ESTADO_PLAZA.LIBRE;
            const statusDis = isStarting ? ESTADO_DISPOSITIVO.MANTENIMIENTO : ESTADO_DISPOSITIVO.OPERATIVO;

            if (target === 'zona') {
                await supabase.from('zona').update({ id_estado: statusZon }).eq('id_zona', id);
                await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_zona', id);
                const { data: plazas } = await supabase.from('plaza').select('id_plaza').eq('id_zona', id);
                const plazaIds = (plazas || []).map(p => p.id_plaza);
                if (plazaIds.length > 0) {
                    await supabase.from('dispositivo').update({ id_estado: statusDis }).in('id_plaza', plazaIds);
                }
            } else if (target === 'plaza') {
                await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_plaza', id);
                await supabase.from('dispositivo').update({ id_estado: statusDis }).eq('id_plaza', id);
            } else if (target === 'dispositivo') {
                await supabase.from('dispositivo').update({ id_estado: statusDis }).eq('id_dispositivo', id);
                
                // Buscar en el catálogo global para no perder la referencia de la plaza
                const disp = allDispositivos.find(d => d.id_dispositivo === id);
                if (disp?.id_plaza) {
                    await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_plaza', disp.id_plaza);
                }
            }
        } catch (err) { console.warn('Error sync:', err.message); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!orgId) {
            return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
        }

        setLoading(true);
        try {
            if (formData.fecha_fin && formData.fecha_fin < formData.fecha_inicio) {
            setLoading(false);
            return Swal.fire('Error', 'La fecha de finalización no puede ser anterior a la de inicio.', 'error');
        }

        const payload = {
            descripcion: formData.descripcion,
            fecha_inicio: formData.fecha_inicio,
            id_dispositivo: targetType === 'dispositivo' ? parseInt(formData.id_dispositivo) : null,
            id_plaza: targetType === 'plaza' ? parseInt(formData.id_plaza) : null,
            id_zona: targetType === 'zona' ? parseInt(formData.id_zona) : null,
            id_empleado: parseInt(formData.id_empleado),
            id_tipo: parseInt(formData.id_tipo),
            id_estado: editingId ? parseInt(formData.id_estado) : (estadosMantenimiento.find(e => e.nombre?.toLowerCase().includes('pendiente'))?.id_estado || 1),
            fecha_fin: formData.fecha_fin || null,
            organizacion_id: orgId
        };

        const isFinalState = estadosMantenimiento.find(e => e.id_estado === parseInt(payload.id_estado))?.nombre.toLowerCase().includes('completado') || 
                             estadosMantenimiento.find(e => e.id_estado === parseInt(payload.id_estado))?.nombre.toLowerCase().includes('cancelado');
            const nombreEstadoActual = estadosMantenimiento.find(e => e.id_estado === parseInt(payload.id_estado))?.nombre || 'Actualizado';

            const ESTADO_A_EVENTO = {
                'completado': EVENT_TYPES.MANTENIMIENTO_COMPLETADO,
                'en progreso': EVENT_TYPES.MANTENIMIENTO_INICIADO,
                'cancelado': EVENT_TYPES.CAMBIO_ESTADO,
                'en espera': EVENT_TYPES.CAMBIO_ESTADO,
            };
            const estadoLower = nombreEstadoActual.toLowerCase();
            const nombreEventoLog = editingId
                ? (Object.entries(ESTADO_A_EVENTO).find(([key]) => estadoLower.includes(key))?.[1] || EVENT_TYPES.MANTENIMIENTO_INICIADO)
                : EVENT_TYPES.MANTENIMIENTO_INICIADO;

            let error;
            if (editingId) {
                const { error: updateError } = await supabase.from('mantenimiento').update(payload).eq('id_mantenimiento', editingId);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('mantenimiento').insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            // Sincronizar estados en cascada
            const targetId = payload.id_dispositivo || payload.id_plaza || payload.id_zona;
            if (targetId) {
                await syncEntityStatus(targetType, targetId, !isFinalState);
            }

            // Log automático (RF10)
            const disp = dispositivos.find(d => d.id_dispositivo === payload.id_dispositivo);
            const idPlazaLog = payload.id_plaza || disp?.id_plaza || null;
            await handleRegistrarLog(
                nombreEventoLog,
                `${editingId ? 'Actualización' : 'Nueva solicitud'} de mantenimiento (Estado: ${nombreEstadoActual}): "${formData.descripcion}"`,
                payload.id_dispositivo,
                idPlazaLog
            );

            Swal.fire('Éxito', editingId ? 'Registro actualizado' : 'Solicitud registrada', 'success');
            closeModal();
            loadData();

        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setTargetType('dispositivo');
        setFormData({
            descripcion: '',
            id_dispositivo: '',
            id_plaza: '',
            id_zona: '',
            id_empleado: '',
            id_tipo: '',
            id_estado: '',
            fecha_inicio: new Date().toISOString().split('T')[0],
            fecha_fin: ''
        });
    };

    const handleConfirmarCambioEstado = async (item) => {
        if (!newStatusChoice) return setChangingStatusFor(null);
        setLoading(true);
        try {
            const nuevoEstadoId = parseInt(newStatusChoice);
            const statusObj = estadosMantenimiento.find(e => e.id_estado === nuevoEstadoId);
            const statusName = statusObj?.nombre || 'Actualizado';
            const statusLower = statusName.toLowerCase();
            
            // Determinar si es un estado final (completado/cancelado)
            const isFinal = ['completado', 'cancelado'].some(s => statusLower.includes(s));
            const fechaFin = isFinal ? new Date().toISOString() : null;

            const { error } = await supabase
                .from('mantenimiento')
                .update({ 
                    id_estado: nuevoEstadoId,
                    fecha_fin: fechaFin
                })
                .eq('id_mantenimiento', item.id_mantenimiento);

            if (error) throw error;

            // Sincronizar infraestructura en cascada
            const type = item.id_zona ? 'zona' : (item.id_plaza ? 'plaza' : 'dispositivo');
            const targetId = item.id_zona || item.id_plaza || item.id_dispositivo;
            if (targetId) {
                await syncEntityStatus(type, targetId, !isFinal);
            }

            // Registrar Log
            const ESTADO_A_EVENTO = {
                'completado': EVENT_TYPES.MANTENIMIENTO_COMPLETADO,
                'en progreso': EVENT_TYPES.MANTENIMIENTO_INICIADO,
                'cancelado': EVENT_TYPES.CAMBIO_ESTADO,
                'en espera': EVENT_TYPES.CAMBIO_ESTADO,
            };
            const eventName = Object.entries(ESTADO_A_EVENTO).find(([key]) => statusLower.includes(key))?.[1] || EVENT_TYPES.MANTENIMIENTO_INICIADO;
            
            await handleRegistrarLog(
                eventName,
                `Cambio de estado rápido a "${statusName}" para mantenimiento ID-${item.id_mantenimiento}.`,
                item.id_dispositivo,
                item.dispositivo?.id_plaza || item.id_plaza
            );

            Swal.fire({
                title: 'Estado Actualizado',
                text: `Mantenimiento marcado como ${statusName}`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });

            setChangingStatusFor(null);
            loadData();
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filtrado
    const filteredItems = mantenimientos.filter(m =>
        m.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (`${m.empleado?.persona?.nombre || ''} ${m.empleado?.persona?.apellido || ''}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.dispositivo?.tipo?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (zonas.find(z => z.id_zona === m.id_zona)?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (plazasList.find(p => p.id_plaza === m.id_plaza)?.numero_plaza || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Mantenimiento</h2>
                    <p className="text-gray-500 font-medium">Gestión de incidencias, reparaciones preventivas y correctivas.</p>
                </div>
                {!showModal && (
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition duration-150"
                >
                    <FaPlus /> Nueva Solicitud
                </button>
                )}
            </header>

            <div className="flex flex-col lg:flex-row gap-6">
                
                <div className="flex-1 min-w-0">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <div className="relative w-72">
                                <input
                                    type="text"
                                    placeholder="Buscar por descripción, técnico o dispositivo..."
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 text-sm"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                <FaSearch className="absolute left-3 top-3 text-gray-400" />
                            </div>
                            <button
                                onClick={loadData}
                                disabled={isRefreshing}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                                title="Refrescar vista"
                            >
                                <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Objetivo / Ubicación</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Problema</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tipo</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Técnico</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                                        <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {loading && mantenimientos.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-8 text-sm italic text-gray-500">Cargando datos...</td></tr>
                                    ) : filteredItems.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-8 text-sm italic text-gray-500">No hay mantenimientos registrados.</td></tr>
                                    ) : (
                                        filteredItems.map((item) => {
                                            const isResuelto = !!item.fecha_fin || resueltosIds.has(item.id_mantenimiento);
                                            
                                            return (
                                                <tr key={item.id_mantenimiento} className={`transition duration-150 ${isResuelto ? 'bg-gray-50 text-gray-400 opacity-75' : 'hover:bg-blue-50/20 group'}`}>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs font-bold text-gray-900 uppercase">
                                                            {item.id_zona ? `ZONA: ${allZonas.find(z => z.id_zona === item.id_zona)?.nombre || 'N/A'}` :
                                                             item.id_plaza ? `PLAZA: ${allPlazas.find(p => p.id_plaza === item.id_plaza)?.numero_plaza || 'N/A'}` :
                                                             (() => {
                                                                 const dispRef = allDispositivos.find(d => d.id_dispositivo === item.id_dispositivo);
                                                                 return dispRef ? (dispRef.plaza?.numero_plaza ? `Plaza: ${dispRef.plaza.numero_plaza}` : 'Sin plaza asig.') : 'Dispositivo';
                                                             })()}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 italic mt-0.5">
                                                            {(() => {
                                                                if (item.id_zona) {
                                                                    const z = allZonas.find(zv => zv.id_zona === item.id_zona);
                                                                    return z ? (z.nivel_piso === 0 ? 'Planta Baja' : (z.nivel_piso < 0 ? `Sótano ${Math.abs(z.nivel_piso)}` : `Piso ${z.nivel_piso}`)) : 'Área completa';
                                                                }
                                                                if (item.id_plaza) {
                                                                    const p = allPlazas.find(pv => pv.id_plaza === item.id_plaza);
                                                                    const z = p?.zona;
                                                                    return z ? `${z.nombre} • ${z.nivel_piso === 0 ? 'P. Baja' : (z.nivel_piso < 0 ? `Sótano ${Math.abs(z.nivel_piso)}` : `Piso ${z.nivel_piso}`)}` : 'General';
                                                                }
                                                                const dispRef = allDispositivos.find(d => d.id_dispositivo === item.id_dispositivo);
                                                                if (dispRef?.plaza?.zona) {
                                                                    const z = dispRef.plaza.zona;
                                                                    return `${dispRef.tipo?.nombre || 'Equipo'} • ${z.nivel_piso === 0 ? 'P. Baja' : (z.nivel_piso < 0 ? `Sótano ${Math.abs(z.nivel_piso)}` : `Piso ${z.nivel_piso}`)}`;
                                                                }
                                                                return dispRef?.tipo?.nombre ? `Equipo: ${dispRef.tipo.nombre}` : 'Sin datos técnicos';
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-medium text-gray-600 max-w-xs truncate" title={item.descripcion}>
                                                        {item.descripcion}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-tighter ${item.tipo?.nombre === 'Preventivo'
                                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                            : 'bg-orange-50 text-orange-700 border-orange-200'
                                                            }`}>
                                                            {item.tipo?.nombre || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-bold text-gray-700 uppercase">
                                                        {item.empleado?.persona?.nombre} {item.empleado?.persona?.apellido}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-medium text-gray-500">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 text-gray-700 font-bold">
                                                                <FaCalendarAlt className="text-blue-500" size={10} />
                                                                {new Date(item.fecha_inicio).toLocaleDateString()}
                                                            </div>
                                                            {item.fecha_fin && (
                                                                <div className="flex items-center gap-1.5 text-[10px] text-green-600 italic">
                                                                    <FaCheckCircle size={10} />
                                                                    Fin: {new Date(item.fecha_fin).toLocaleDateString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {changingStatusFor === item.id_mantenimiento ? (
                                                            <div className="flex items-center gap-1">
                                                                <select 
                                                                    className="text-xs p-1 border rounded bg-white font-bold text-gray-700 outline-none focus:ring-1 focus:ring-blue-500"
                                                                    value={newStatusChoice}
                                                                    onChange={(e) => setNewStatusChoice(e.target.value)}
                                                                >
                                                                    <option value="">Estado...</option>
                                                                    {estadosMantenimiento.map(est => (
                                                                        <option key={est.id_estado} value={est.id_estado}>{est.nombre}</option>
                                                                    ))}
                                                                </select>
                                                                <button 
                                                                    onClick={() => handleConfirmarCambioEstado(item)}
                                                                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                                    title="Confirmar"
                                                                >
                                                                    <FaCheckCircle size={14} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setChangingStatusFor(null)}
                                                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                                    title="Cancelar"
                                                                >
                                                                    <FaTimesCircle size={14} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-tighter ${isResuelto
                                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                                }`}>
                                                                {item.estado?.nombre || 'N/A'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            <button
                                                                onClick={() => {
                                                                    setNewStatusChoice(item.id_estado);
                                                                    setChangingStatusFor(item.id_mantenimiento);
                                                                }}
                                                                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold transition shadow-sm"
                                                                title="Cambiar Estado Rápido"
                                                            >
                                                                <FaSync size={10} /> Estado
                                                            </button>
                                                            <button
                                                                onClick={() => handleEdit(item)}
                                                                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 font-bold transition shadow-sm"
                                                                title="Editar Detalles Completos"
                                                            >
                                                                <FaEdit size={10} /> Editar
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {showModal && (
                <aside className="w-full lg:w-[400px] flex-shrink-0">
                    <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FaTools className="text-blue-600" /> {editingId ? 'Editar Solicitud' : 'Nueva Solicitud'}
                            </h3>
                            <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                                <FaTimesCircle size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="mb-4">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Objetivo del Mantenimiento *</label>
                                <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
                                    {['dispositivo', 'plaza', 'zona'].map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            disabled={!!editingId} // Bloqueado en edición
                                            onClick={() => setTargetType(type)}
                                            className={`py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                                                targetType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                            } ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {targetType === 'dispositivo' && (
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dispositivo *</label>
                                    <SearchableSelect
                                        options={(editingId ? allDispositivos : dispositivos).map(d => {
                                            const esMismoDispositivo = editingId && parseInt(formData.id_dispositivo) === d.id_dispositivo;
                                            const ocupado = dispositivosOcupados.has(d.id_dispositivo) && !esMismoDispositivo;
                                            const numPlaza = d.plaza?.numero_plaza || 'N/A';
                                            return {
                                                value: d.id_dispositivo,
                                                label: `${d.tipo?.nombre || 'Disp.'} — Plaza ${numPlaza} ${d.modelo ? `(${d.modelo.marca?.nombre} ${d.modelo.nombre})` : ''} ${ocupado ? '[OCUPADO]' : ''}`,
                                                disabled: ocupado
                                            };
                                        })}
                                        value={formData.id_dispositivo}
                                        onChange={val => setFormData({ ...formData, id_dispositivo: val })}
                                        disabled={!!editingId}
                                        placeholder="— Seleccionar Dispositivo —"
                                        focusRingClass="focus:ring-blue-500"
                                        selectedItemClass="bg-blue-100 text-blue-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>
                            )}

                            {targetType === 'plaza' && (
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Plaza de Parqueo *</label>
                                    <SearchableSelect
                                        options={(editingId ? allPlazas : plazasList).map(p => ({
                                            value: p.id_plaza,
                                            label: `Plaza: ${p.numero_plaza} (${allZonas.find(z => z.id_zona === p.id_zona)?.nombre || 'N/A'})`
                                        }))}
                                        value={formData.id_plaza}
                                        onChange={val => setFormData({ ...formData, id_plaza: val })}
                                        disabled={!!editingId}
                                        placeholder="— Seleccionar Plaza —"
                                        focusRingClass="focus:ring-blue-500"
                                        selectedItemClass="bg-blue-100 text-blue-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>
                            )}

                            {targetType === 'zona' && (
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Zona Completa *</label>
                                    <SearchableSelect
                                        options={(editingId ? allZonas : zonas).map(z => ({
                                            value: z.id_zona,
                                            label: `Zona: ${z.nombre}`
                                        }))}
                                        value={formData.id_zona}
                                        onChange={val => setFormData({ ...formData, id_zona: val })}
                                        disabled={!!editingId}
                                        placeholder="— Seleccionar Zona —"
                                        focusRingClass="focus:ring-blue-500"
                                        selectedItemClass="bg-blue-100 text-blue-800"
                                        className="bg-gray-50/50"
                                    />
                                    <p className="text-[9px] text-orange-600 font-bold mt-1 uppercase leading-tight italic">
                                        ⚠️ Afectará a todas las plazas y sensores asignados a esta zona.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo Mantenimiento *</label>
                                    <SearchableSelect
                                        options={tiposMantenimiento.map(t => ({ value: t.id_tipo || t.id, label: t.nombre }))}
                                        value={formData.id_tipo}
                                        onChange={val => setFormData({ ...formData, id_tipo: val })}
                                        placeholder="— Tipo —"
                                        focusRingClass="focus:ring-blue-500"
                                        selectedItemClass="bg-blue-100 text-blue-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Técnico Asignado *</label>
                                    <SearchableSelect
                                        options={tecnicos.map(t => ({ 
                                            value: t.id_empleado, 
                                            label: t.nombre_label,
                                            disabled: t.disabled
                                        }))}
                                        value={formData.id_empleado}
                                        onChange={val => setFormData({ ...formData, id_empleado: val })}
                                        placeholder="— Técnico —"
                                        focusRingClass="focus:ring-blue-500"
                                        selectedItemClass="bg-blue-100 text-blue-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500"
                                        value={formData.fecha_inicio}
                                        onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })}
                                    />
                                </div>
                                {editingId && (
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Fin</label>
                                        <input
                                            type="date"
                                            className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500"
                                            value={formData.fecha_fin}
                                            onChange={e => setFormData({ ...formData, fecha_fin: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>

                            {editingId && (
                                <div>
                                    <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Estado *</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded-lg text-sm bg-blue-50 border-blue-200 font-bold outline-none focus:ring-blue-500"
                                        value={formData.id_estado}
                                        onChange={e => setFormData({ ...formData, id_estado: e.target.value })}
                                    >
                                        <option value="">— Estado —</option>
                                        {estadosMantenimiento.map(est => (
                                            <option key={est.id_estado || est.id} value={est.id_estado || est.id}>{est.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción del Problema *</label>
                                <textarea
                                    required
                                    rows="3"
                                    className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500"
                                    placeholder="Detalle la falla o tarea a realizar..."
                                    value={formData.descripcion}
                                    onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                ></textarea>
                            </div>

                            <div className="pt-2">
                                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 py-3 rounded-lg font-black uppercase text-[10px] tracking-wide transition-all shadow-md">
                                    <FaTools /> {loading ? 'Procesando...' : editingId ? 'Guardar Cambios' : 'Registrar'}
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

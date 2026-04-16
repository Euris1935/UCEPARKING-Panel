

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaTools, FaCalendarAlt, FaEdit, FaTrash, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Mantenimiento() {
    const { orgId } = useOrg();
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Catalogos para el formulario
    const [dispositivos, setDispositivos] = useState([]);
    const [tecnicos, setTecnicos] = useState([]);
    const [tiposMantenimiento, setTiposMantenimiento] = useState([]);
    const [estadosMantenimiento, setEstadosMantenimiento] = useState([]);

    // Modal y Formulario
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [resueltosIds, setResueltosIds] = useState(new Set()); // track locally
    const [dispositivosOcupados, setDispositivosOcupados] = useState(new Set()); // dispositivos con mantenimiento activo
    const [formData, setFormData] = useState({
        descripcion: '',
        id_dispositivo: '',
        id_empleado: '',
        id_tipo: '',
        id_estado: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: ''
    });

    const [currentPersonaId, setCurrentPersonaId] = useState(null);

    useEffect(() => {
        const getPersona = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
                if (data) setCurrentPersonaId(data.id_persona);
            }
        };
        getPersona();
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setIsRefreshing(true);
        try {

            const { data: mantData, error } = await supabase
                .from('mantenimiento')
                .select(`
                id_mantenimiento,
                fecha_inicio,
                fecha_fin,
                descripcion,
                id_dispositivo,
                id_empleado,
                id_tipo,
                id_estado,
                estado:estado_mantenimiento ( nombre ),
                tipo:tipo_mantenimiento ( nombre ),
                dispositivo ( 
                    id_dispositivo,
                    id_plaza,
                    ubicacion, 
                    tipo:tipo_dispositivo ( nombre ) 
                ),
                empleado ( 
                    id_empleado,
                    persona ( nombre, apellido ) 
                )
            `)
                .eq('organizacion_id', orgId)
                .order('fecha_inicio', { ascending: false });

            if (error) throw error;
            setMantenimientos(mantData || []);

            const ocupados = new Set(
                (mantData || [])
                    .filter(m => !m.fecha_fin)
                    .map(m => m.id_dispositivo)
            );
            setDispositivosOcupados(ocupados);

            const { data: dispData, error: dispError } = await supabase
                .from('dispositivo')
                .select('id_dispositivo, id_plaza, ubicacion, id_estado, tipo:tipo_dispositivo(nombre), modelo(nombre, marca(nombre))')
                .eq('organizacion_id', orgId)
                .order('ubicacion', { ascending: true });

            if (dispError) console.warn('Error cargando dispositivos:', dispError.message);
            const { data: empData } = await supabase.from('empleado').select('id_empleado, persona(nombre, apellido)').eq('organizacion_id', orgId);
            const { data: tipoData } = await supabase.from('tipo_mantenimiento').select('*').order('nombre');
            const { data: estData } = await supabase.from('estado_mantenimiento').select('*').order('nombre');

            setDispositivos(dispData || []);
            setTecnicos((empData || []).sort((a, b) => {
                const na = `${a.persona?.nombre ?? ''} ${a.persona?.apellido ?? ''}`.toLowerCase();
                const nb = `${b.persona?.nombre ?? ''} ${b.persona?.apellido ?? ''}`.toLowerCase();
                return na.localeCompare(nb);
            }));
            setTiposMantenimiento(tipoData || []);
            setEstadosMantenimiento(estData || []);

        } catch (error) {
            console.error("Error cargando mantenimientos:", error.message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const registrarLog = async (tipo_nombre, descripcion, idDispositivo = null, idPlaza = null) => {
        if (!currentPersonaId) return;
        try {
            // #RF10: Fallback dinámico para evitar N/A en logs
            let { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
            if (!te) {
                const { data: fallback } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', 'Mantenimiento Iniciado').maybeSingle();
                te = fallback;
            }            const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Mantenimiento').maybeSingle();
            await supabase.from('evento').insert([{
                fecha_hora: new Date().toISOString(),
                descripcion: descripcion,
                id_persona: currentPersonaId,
                id_tipo: te?.id_tipo || null,
                id_origen_evento: oe?.id_origen || null,
                id_dispositivo: idDispositivo,
                id_plaza: idPlaza,
                organizacion_id: orgId
            }]);
        } catch (err) { console.warn('Error log:', err.message); }
    };

    const handleEdit = (item) => {
        setEditingId(item.id_mantenimiento);
        setFormData({
            descripcion: item.descripcion || '',
            id_dispositivo: item.id_dispositivo || '',
            id_empleado: item.id_empleado || '',
            id_tipo: item.id_tipo || '',
            id_estado: item.id_estado || '',
            fecha_inicio: item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '',
            fecha_fin: item.fecha_fin ? item.fecha_fin.split('T')[0] : ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        const result = await Swal.fire({
            title: '¿Eliminar registro?',
            text: "Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('mantenimiento').delete().eq('id_mantenimiento', id);
                if (error) throw error;
                Swal.fire('Eliminado', 'El registro ha sido borrado.', 'success');
                loadData();
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const estadoCompletadoId = estadosMantenimiento.find(e => e.nombre?.toLowerCase().includes('completado'))?.id_estado;
            const estadoInicialId = estadosMantenimiento.find(e => e.nombre?.toLowerCase().includes('pendiente'))?.id_estado || 1;
            const nuevoEstadoId = parseInt(formData.id_estado);
            const nombreEstadoActual = estadosMantenimiento.find(e => e.id_estado === nuevoEstadoId)?.nombre || 'Actualizado';

            // Mapear nombre del estado al tipo de evento correspondiente
            const ESTADO_A_EVENTO = {
                'completado': 'Mantenimiento Completado',
                'en progreso': 'Mantenimiento En Progreso',
                'cancelado': 'Mantenimiento Cancelado',
                'en espera': 'Mantenimiento En Espera',
            };
            const estadoLower = nombreEstadoActual.toLowerCase();
            const nombreEventoLog = editingId
                ? (Object.entries(ESTADO_A_EVENTO).find(([key]) => estadoLower.includes(key))?.[1] || 'Mantenimiento Iniciado')
                : 'Mantenimiento Iniciado';

            const payload = {
                descripcion: formData.descripcion,
                fecha_inicio: formData.fecha_inicio,
                id_dispositivo: parseInt(formData.id_dispositivo),
                id_empleado: parseInt(formData.id_empleado),
                id_tipo: parseInt(formData.id_tipo),
                id_estado: editingId ? nuevoEstadoId : estadoInicialId,
                fecha_fin: formData.fecha_fin || null,
                organizacion_id: orgId
            };

            let error;
            if (editingId) {
                const { error: updateError } = await supabase.from('mantenimiento').update(payload).eq('id_mantenimiento', editingId);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('mantenimiento').insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            // Log automático (RF10)
            const disp = dispositivos.find(d => d.id_dispositivo === parseInt(formData.id_dispositivo));
            const idPlazaLog = disp?.id_plaza || null;
            await registrarLog(
                nombreEventoLog,
                `${editingId ? 'Actualización' : 'Nueva solicitud'} de mantenimiento (Estado: ${nombreEstadoActual}): "${formData.descripcion}" en dispositivo ${disp?.tipo?.nombre || 'desconocido'}.`,
                parseInt(formData.id_dispositivo),
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
        setFormData({
            descripcion: '',
            id_dispositivo: '',
            id_empleado: '',
            id_tipo: '',
            id_estado: '',
            fecha_inicio: new Date().toISOString().split('T')[0],
            fecha_fin: ''
        });
    };

    const handleResolve = async (id) => {
        const { value: confirm } = await Swal.fire({
            title: '¿Marcar como Resuelto?',
            text: "El dispositivo volverá a estar operativo.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, finalizar'
        });

        if (confirm) {
            // Buscar ID de estado Completado (con fallback)
            const idCompletado = estadosMantenimiento.find(e => e.nombre?.toLowerCase().includes('completado'))?.id_estado || null;
            const fechaFin = new Date().toISOString();

            const updatePayload = { 
                fecha_fin: fechaFin
            };
            if (idCompletado) updatePayload.id_estado = idCompletado;

            const { error } = await supabase.from('mantenimiento').update(updatePayload).eq('id_mantenimiento', id);

            if (!error) {
                // Actualizar UI inmediatamente sin esperar reload
                setResueltosIds(prev => new Set([...prev, id]));
                setMantenimientos(prev => prev.map(m => 
                    m.id === id ? { ...m, fecha_fin: fechaFin, id_estado: idCompletado || m.id_estado } : m
                ));
                
                // Log automático (RF10)
                const mant = mantenimientos.find(m => m.id === id);
                const idDisp = mant?.dispositivo?.id_dispositivo || mant?.id_dispositivo || null;
                const idPlaza = mant?.dispositivo?.id_plaza || null;
                await registrarLog(
                    'Mantenimiento Completado',
                    `Mantenimiento ID-${id} marcado como COMPLETADO. Dispositivo: ${mant?.dispositivo?.tipo?.nombre || 'N/A'}.`,
                    idDisp,
                    idPlaza
                );
                Swal.fire('Listo', 'Mantenimiento finalizado.', 'success');
                loadData();
            }
        }
    };

    // Filtrado
    const filteredItems = mantenimientos.filter(m =>
        m.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.empleado?.persona?.nombre + ' ' + m.empleado?.persona?.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.dispositivo?.tipo?.nombre.toLowerCase().includes(searchTerm.toLowerCase())
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
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Dispositivo / Ubicación</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Problema</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tipo</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Técnico</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                                        <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acción</th>
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
                                                        <div className="text-xs font-bold text-gray-900 uppercase">{item.dispositivo?.tipo?.nombre || 'Dispositivo Desconocido'}</div>
                                                        <div className="text-[10px] text-gray-500 italic mt-0.5">{item.dispositivo?.ubicacion || 'Sin ubicación'}</div>
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
                                                        <div className="flex items-center gap-1.5">
                                                            <FaCalendarAlt className="text-gray-400" />
                                                            {new Date(item.fecha_inicio).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-tighter ${isResuelto
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                            }`}>
                                                            {item.estado?.nombre || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            {!isResuelto ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleResolve(item.id_mantenimiento)}
                                                                        className="text-green-500 hover:text-green-700 transition"
                                                                        title="Marcar como Resuelto"
                                                                    >
                                                                        <FaCheckCircle size={17} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleEdit(item)}
                                                                        className="text-blue-500 hover:text-blue-700 transition"
                                                                        title="Editar"
                                                                    >
                                                                        <FaEdit size={17} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDelete(item.id_mantenimiento)}
                                                                        className="text-red-400 hover:text-red-600 transition"
                                                                        title="Eliminar"
                                                                    >
                                                                        <FaTrash size={15} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] font-black text-gray-400 italic">FINALIZADO</span>
                                                            )}
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
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dispositivo *</label>
                                <SearchableSelect
                                    options={dispositivos.map(d => {
                                        const esMismoDispositivo = editingId && parseInt(formData.id_dispositivo) === d.id_dispositivo;
                                        const ocupado = dispositivosOcupados.has(d.id_dispositivo) && !esMismoDispositivo;
                                        return {
                                            value: d.id_dispositivo,
                                            label: `${d.tipo?.nombre || 'Disp.'} — ${d.ubicacion || 'Sin ubicación'} ${d.modelo ? `(${d.modelo.marca?.nombre} ${d.modelo.nombre})` : ''} ${ocupado ? '[OCUPADO]' : ''}`,
                                            disabled: ocupado
                                        };
                                    })}
                                    value={formData.id_dispositivo}
                                    onChange={val => setFormData({ ...formData, id_dispositivo: val })}
                                    placeholder="— Seleccionar Dispositivo —"
                                    focusRingClass="focus:ring-blue-500"
                                    selectedItemClass="bg-blue-100 text-blue-800"
                                    className="bg-gray-50/50"
                                />
                            </div>

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
                                        options={tecnicos.map(t => ({ value: t.id_empleado, label: `${t.persona?.nombre} ${t.persona?.apellido}` }))}
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

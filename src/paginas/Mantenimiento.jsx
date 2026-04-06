

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaWrench, FaTools, FaFilter, FaCalendarAlt, FaEdit, FaTrash } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';

export default function Mantenimiento() {
    const { orgId } = useOrg();
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(true);
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
        id_tecnico: '',
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
                const { data } = await supabase.from('usuarios').select('id_persona').eq('id', user.id).single();
                if (data) setCurrentPersonaId(data.id_persona);
            }
        };
        getPersona();
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {

            const { data: mantData, error } = await supabase
                .from('mantenimientos')
                .select(`
                Id_Mantenimiento,
                Fecha_Inicio,
                Fecha_Fin,
                Descripcion_Problema,
                id_dispositivo,
                ID_Empleado_Tecnico,
                id_tipo_mantenimiento,
                id_estado,
                estado_mantenimiento ( nombre_estado ),
                tipo_mantenimiento ( nombre_tipo ),
                dispositivos ( 
                    id_dispositivo,
                    id_plaza,
                    ubicacion, 
                    tipos_dispositivos ( nombre_tipo ) 
                ),
                empleados ( 
                    Id_Empleado,
                    personas ( nombre, apellido ) 
                )
            `)
                .order('Fecha_Inicio', { ascending: false });

            if (error) throw error;
            setMantenimientos(mantData || []);

            // Calcular qué dispositivos tienen un mantenimiento activo (sin Fecha_Fin)
            const ocupados = new Set(
                (mantData || [])
                    .filter(m => !m.Fecha_Fin)
                    .map(m => m.id_dispositivo)
            );
            setDispositivosOcupados(ocupados);


            const { data: dispData, error: dispError } = await supabase
                .from('dispositivos')
                .select('id_dispositivo, id_plaza, ubicacion, id_estado, tipos_dispositivos(nombre_tipo), modelos_equipo_cat(nombre, marcas_equipo(nombre))')
                .order('id_dispositivo', { ascending: true });
            if (dispError) console.warn('Error cargando dispositivos:', dispError.message);
            const { data: empData } = await supabase.from('empleados').select('Id_Empleado, personas(nombre, apellido)');
            const { data: tipoData } = await supabase.from('tipo_mantenimiento').select('*');
            const { data: estData } = await supabase.from('estado_mantenimiento').select('*');

            setDispositivos(dispData || []);
            setTecnicos(empData || []);
            setTiposMantenimiento(tipoData || []);
            setEstadosMantenimiento(estData || []);

        } catch (error) {
            console.error("Error cargando mantenimientos:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const registrarLog = async (tipo, descripcion, idDispositivo = null, idPlaza = null) => {
        if (!currentPersonaId) return;
        try {
            // #RF10: Fallback dinámico para evitar N/A en logs
            let { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
            if (!te) {
                const { data: fallback } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', 'Mantenimiento Iniciado').maybeSingle();
                te = fallback;
            }            const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Mantenimiento').maybeSingle();
            await supabase.from('eventos').insert([{
                Fecha_Hora: new Date().toISOString(),
                Descripcion: descripcion,
                id_persona: currentPersonaId,
                id_dispositivo: idDispositivo,
                id_tipo_evento: te?.id_tipo || null,
                id_origen_evento: oe?.id_origen || null,
                Id_Plaza: idPlaza || null,
                organizacion_id: orgId
            }]);
        } catch (err) { console.warn('Error log:', err.message); }
    };

    const handleEdit = (item) => {
        setEditingId(item.Id_Mantenimiento);
        setFormData({
            descripcion: item.Descripcion_Problema || '',
            id_dispositivo: item.id_dispositivo || '',
            id_tecnico: item.ID_Empleado_Tecnico || '',
            id_tipo: item.id_tipo_mantenimiento || '',
            id_estado: item.id_estado || '',
            fecha_inicio: item.Fecha_Inicio ? item.Fecha_Inicio.split('T')[0] : '',
            fecha_fin: item.Fecha_Fin ? item.Fecha_Fin.split('T')[0] : ''
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
                const { error } = await supabase.from('mantenimientos').delete().eq('Id_Mantenimiento', id);
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
            const estadoCompletadoId = estadosMantenimiento.find(e => e.nombre_estado?.toLowerCase().includes('completado'))?.id_estado;
            const estadoInicialId = estadosMantenimiento.find(e => e.nombre_estado?.toLowerCase().includes('pendiente'))?.id_estado || 1;
            const nuevoEstadoId = parseInt(formData.id_estado);
            const nombreEstadoActual = estadosMantenimiento.find(e => e.id_estado === nuevoEstadoId)?.nombre_estado || 'Actualizado';

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
                Descripcion_Problema: formData.descripcion,
                Fecha_Inicio: formData.fecha_inicio,
                id_dispositivo: parseInt(formData.id_dispositivo),
                ID_Empleado_Tecnico: parseInt(formData.id_tecnico),
                id_tipo_mantenimiento: parseInt(formData.id_tipo),
                id_estado: editingId ? nuevoEstadoId : estadoInicialId,
                Fecha_Fin: formData.fecha_fin || null,
                organizacion_id: orgId
            };

            let error;
            if (editingId) {
                const { error: updateError } = await supabase.from('mantenimientos').update(payload).eq('Id_Mantenimiento', editingId);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('mantenimientos').insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            // Log automático (RF10)
            const disp = dispositivos.find(d => d.id_dispositivo === parseInt(formData.id_dispositivo));
            const idPlazaLog = disp?.id_plaza || null;
            await registrarLog(
                nombreEventoLog,
                `${editingId ? 'Actualización' : 'Nueva solicitud'} de mantenimiento (Estado: ${nombreEstadoActual}): "${formData.descripcion}" en dispositivo ${disp?.tipos_dispositivos?.nombre_tipo || 'desconocido'}.`,
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
            id_tecnico: '',
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
            const idCompletado = estadosMantenimiento.find(e => e.nombre_estado?.toLowerCase().includes('completado'))?.id_estado || null;
            const fechaFin = new Date().toISOString();

            const updatePayload = { Fecha_Fin: fechaFin };
            if (idCompletado) updatePayload.id_estado = idCompletado;

            const { error } = await supabase.from('mantenimientos').update(updatePayload).eq('Id_Mantenimiento', id);

            if (!error) {
                // Actualizar UI inmediatamente sin esperar reload
                setResueltosIds(prev => new Set([...prev, id]));
                setMantenimientos(prev => prev.map(m => 
                    m.Id_Mantenimiento === id ? { ...m, Fecha_Fin: fechaFin, id_estado: idCompletado || m.id_estado } : m
                ));
                
                // Log automático (RF10)
                const mant = mantenimientos.find(m => m.Id_Mantenimiento === id);
                const idDisp = mant?.dispositivos?.id_dispositivo || mant?.id_dispositivo || null;
                const idPlaza = mant?.dispositivos?.id_plaza || null;
                await registrarLog(
                    'Mantenimiento Completado',
                    `Mantenimiento ID-${id} marcado como COMPLETADO. Dispositivo: ${mant?.dispositivos?.tipos_dispositivos?.nombre_tipo || 'N/A'}.`,
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
        m.Descripcion_Problema.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.empleados?.personas?.nombre + ' ' + m.empleados?.personas?.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.dispositivos?.tipos_dispositivos?.nombre_tipo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Mantenimiento</h2>
                    <p className="text-gray-500">Gestión de incidencias, reparaciones preventivas y correctivas.</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow flex items-center gap-2 transition"
                >
                    <FaPlus /> Nueva Solicitud
                </button>
            </header>


            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-4">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Buscar por descripción, técnico o dispositivo..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <FaSearch className="absolute left-3 top-3 text-gray-400" />
                </div>
                <FaFilter className="text-gray-400" />
            </div>


            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Dispositivo / Ubicación</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Problema</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Técnico</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan="7" className="text-center py-8">Cargando datos...</td></tr>
                            ) : filteredItems.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-8 text-gray-500">No hay mantenimientos registrados.</td></tr>
                            ) : (
                                filteredItems.map((item) => {
                                    // isResuelto: usa Fecha_Fin como indicador principal (siempre se asigna al resolver)
                                    // y el set local como respaldo inmediato post-clic
                                    const isResuelto = !!item.Fecha_Fin || resueltosIds.has(item.Id_Mantenimiento);
                                    
                                    return (
                                        <tr key={item.Id_Mantenimiento} className={`border-b transition ${isResuelto ? 'bg-gray-50 text-gray-400 opacity-75' : 'hover:bg-gray-50'}`}>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-bold text-gray-900">{item.dispositivos?.tipos_dispositivos?.nombre_tipo || 'Dispositivo Desconocido'}</div>
                                                <div className="text-xs text-gray-500">{item.dispositivos?.ubicacion || 'Sin ubicación'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={item.Descripcion_Problema}>
                                                {item.Descripcion_Problema}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs rounded-full border ${item.tipo_mantenimiento?.nombre_tipo === 'Preventivo'
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                    : 'bg-orange-50 text-orange-700 border-orange-200'
                                                    }`}>
                                                    {item.tipo_mantenimiento?.nombre_tipo || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {item.empleados?.personas?.nombre} {item.empleados?.personas?.apellido}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                <div className="flex items-center gap-1">
                                                    <FaCalendarAlt className="text-gray-400" size={12} />
                                                    {new Date(item.Fecha_Inicio).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs font-bold rounded-full ${isResuelto
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {item.estado_mantenimiento?.nombre_estado || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    {!isResuelto ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleResolve(item.Id_Mantenimiento)}
                                                                className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition border border-transparent hover:border-green-200"
                                                                title="Marcar como Resuelto"
                                                            >
                                                                <FaCheckCircle size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleEdit(item)}
                                                                className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition border border-transparent hover:border-blue-200"
                                                                title="Editar"
                                                            >
                                                                <FaEdit size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(item.Id_Mantenimiento)}
                                                                className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition border border-transparent hover:border-red-200"
                                                                title="Eliminar"
                                                            >
                                                                <FaTrash size={15} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-400 italic">LECTURA / FINALIZADO</span>
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


            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <FaTools className="text-primary" /> {editingId ? 'Editar Mantenimiento' : 'Nueva Solicitud'}
                            </h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Dispositivo *</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded bg-gray-50"
                                        value={formData.id_dispositivo}
                                        onChange={e => setFormData({ ...formData, id_dispositivo: e.target.value })}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {dispositivos.length === 0 && (
                                            <option disabled>— No hay dispositivos registrados —</option>
                                        )}
                                        {dispositivos.map(d => {
                                            // Un dispositivo está ocupado si tiene mantenimiento activo
                                            // EXCEPTO si es el mismo dispositivo del registro que se está editando
                                            const esMismoDispositivo = editingId && parseInt(formData.id_dispositivo) === d.id_dispositivo;
                                            const ocupado = dispositivosOcupados.has(d.id_dispositivo) && !esMismoDispositivo;
                                            return (
                                                <option
                                                    key={d.id_dispositivo}
                                                    value={d.id_dispositivo}
                                                    disabled={ocupado}
                                                    style={ocupado ? { color: '#9ca3af', backgroundColor: '#f9fafb' } : {}}
                                                >
                                                    [{d.id_dispositivo}] {d.tipos_dispositivos?.nombre_tipo || 'Dispositivo'}{d.modelos_equipo_cat ? ` — ${d.modelos_equipo_cat.marcas_equipo?.nombre || ''} ${d.modelos_equipo_cat.nombre}` : ''}{d.ubicacion ? ` (${d.ubicacion})` : ''}{ocupado ? ' — EN MANTENIMIENTO' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Tipo Mantenimiento *</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded bg-gray-50"
                                        value={formData.id_tipo}
                                        onChange={e => setFormData({ ...formData, id_tipo: e.target.value })}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {tiposMantenimiento.map(t => (
                                            <option key={t.id_tipo} value={t.id_tipo}>{t.nombre_tipo}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Técnico Asignado *</label>
                                <select
                                    required
                                    className="w-full border p-2 rounded bg-gray-50"
                                    value={formData.id_tecnico}
                                    onChange={e => setFormData({ ...formData, id_tecnico: e.target.value })}
                                >
                                    <option value="">Seleccionar...</option>
                                    {tecnicos.map(t => (
                                        <option key={t.Id_Empleado} value={t.Id_Empleado}>
                                            {t.personas?.nombre} {t.personas?.apellido}
                                        </option>
                                    ))}
                                </select>
                            </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full border p-2 rounded bg-gray-50"
                                        value={formData.fecha_inicio}
                                        onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })}
                                    />
                                </div>
                                {editingId && (
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Fecha Fin</label>
                                        <input
                                            type="date"
                                            className="w-full border p-2 rounded bg-gray-50"
                                            value={formData.fecha_fin}
                                            onChange={e => setFormData({ ...formData, fecha_fin: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>

                            {editingId && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Estado de Mantenimiento *</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded bg-blue-50 border-blue-200"
                                        value={formData.id_estado}
                                        onChange={e => setFormData({ ...formData, id_estado: e.target.value })}
                                    >
                                        <option value="">Seleccionar estado...</option>
                                        {estadosMantenimiento.map(est => (
                                            <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">Descripción del Problema *</label>
                                <textarea
                                    required
                                    rows="3"
                                    className="w-full border p-2 rounded bg-gray-50"
                                    placeholder="Detalle la falla o tarea a realizar..."
                                    value={formData.descripcion}
                                    onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                ></textarea>
                            </div>

                             <div className="flex justify-end gap-2 pt-4">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                                <button type="submit" disabled={loading} className="px-6 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow font-bold">
                                    {loading ? 'Procesando...' : editingId ? 'Guardar Cambios' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}

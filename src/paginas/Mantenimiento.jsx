

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaWrench, FaTools, FaFilter, FaCalendarAlt, FaEdit, FaTrash } from 'react-icons/fa';

// Helper: fecha local YYYY-MM-DD (evita desfase UTC)
const fechaLocalHoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ── Componente SearchableSelect ── */
function SearchableSelect({ value, onChange, options, placeholder, required }) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Cerrar al hacer clic fuera
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
                className="w-full border p-2 rounded bg-gray-50 text-sm"
                placeholder={placeholder || 'Buscar...'}
                value={open ? search : selectedLabel}
                onFocus={() => { setOpen(true); setSearch(''); }}
                onChange={e => setSearch(e.target.value)}
            />
            {open && (
                <div className="absolute z-50 bg-white border rounded shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
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

export default function Mantenimiento() {
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
    const [formData, setFormData] = useState({
        descripcion: '',
        id_dispositivo: '',
        id_tecnico: '',
        id_tipo: '',
        id_estado: '',
        fecha_inicio: fechaLocalHoy()
    });

    const [currentPersonaId, setCurrentPersonaId] = useState(null);

    useEffect(() => {
        const getPersona = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('usuarios').select('persona_id').eq('id', user.id).single();
                if (data) setCurrentPersonaId(data.persona_id);
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
                id_estado,
                id_dispositivo,
                ID_Empleado_Tecnico,
                id_tipo_mantenimiento,
                Estado_Mantenimiento,
                Tipo_Dispositivo_Afectado,
                
                estado_mantenimiento ( id_estado, nombre_estado ),
                tipo_mantenimiento ( id_tipo, nombre_tipo ),
                dispositivos ( 
                    id_dispositivo,
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


            const { data: dispData } = await supabase.from('dispositivos').select('id_dispositivo, ubicacion, estado_operativo, tipos_dispositivos(nombre_tipo)');

            // Solo empleados con rol de Tecnico
            const { data: rolTecnico } = await supabase.from('roles').select('Id_Rol').eq('Nombre_Rol', 'Tecnico').maybeSingle();
            let empData = [];
            if (rolTecnico) {
                const { data } = await supabase.from('empleados').select('Id_Empleado, personas(nombre, apellido)').eq('rol_id', rolTecnico.Id_Rol);
                empData = data || [];
            }
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

    const registrarLog = async (tipo, descripcion, idDispositivo = null) => {
        if (!currentPersonaId) return;
        try {
            await supabase.from('eventos').insert([{
                Fecha_Hora: new Date().toISOString(),
                Tipo_Evento: tipo,
                Descripcion: descripcion,
                id_persona: currentPersonaId,
                id_dispositivo: idDispositivo,
                origen_evento: 'Panel Web - Mantenimiento'
            }]);
        } catch (err) { console.warn('Error log:', err.message); }
    };

    const openNewModal = () => {
        setEditingId(null);
        setFormData({
            descripcion: '',
            id_dispositivo: '',
            id_tecnico: '',
            id_tipo: '',
            id_estado: '',
            fecha_inicio: fechaLocalHoy()
        });
        setShowModal(true);
    };

    const openEditModal = (item) => {
        setEditingId(item.Id_Mantenimiento);
        setFormData({
            descripcion: item.Descripcion_Problema || '',
            id_dispositivo: item.id_dispositivo || '',
            id_tecnico: item.ID_Empleado_Tecnico || '',
            id_tipo: item.id_tipo_mantenimiento || '',
            id_estado: item.id_estado || '',
            fecha_inicio: item.Fecha_Inicio ? item.Fecha_Inicio.split('T')[0] : fechaLocalHoy()
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                // ── EDITAR ──
                const estadoSeleccionado = estadosMantenimiento.find(es => es.id_estado === parseInt(formData.id_estado));
                const nombreEstado = estadoSeleccionado?.nombre_estado || 'Pendiente';

                const updateData = {
                    Descripcion_Problema: formData.descripcion,
                    id_dispositivo: parseInt(formData.id_dispositivo),
                    ID_Empleado_Tecnico: parseInt(formData.id_tecnico),
                    id_tipo_mantenimiento: parseInt(formData.id_tipo),
                    id_estado: parseInt(formData.id_estado),
                    Estado_Mantenimiento: nombreEstado,
                    Tipo_Dispositivo_Afectado: 'Hardware'
                };

                // Si el estado indica finalizado/resuelto, poner Fecha_Fin
                const esFinalizado = nombreEstado.toLowerCase().includes('finalizado') || nombreEstado.toLowerCase().includes('resuelto') || nombreEstado.toLowerCase().includes('completado');
                if (esFinalizado) {
                    updateData.Fecha_Fin = new Date().toISOString();
                }

                const { error } = await supabase.from('mantenimientos').update(updateData).eq('Id_Mantenimiento', editingId);
                if (error) throw error;

                await registrarLog(
                    'MANTENIMIENTO',
                    `Mantenimiento ID-${editingId} actualizado. Estado: ${nombreEstado}.`,
                    parseInt(formData.id_dispositivo)
                );

                Swal.fire('Actualizado', 'Mantenimiento actualizado correctamente.', 'success');

            } else {
                // ── CREAR ──
                const estadoInicial = estadosMantenimiento.find(e => e.nombre_estado.toLowerCase().includes('pendiente'))?.id_estado || 1;

                // Usar fecha local con hora actual para evitar desfase
                const fechaInicio = new Date(formData.fecha_inicio + 'T' + new Date().toTimeString().split(' ')[0]).toISOString();

                const { error } = await supabase.from('mantenimientos').insert([{
                    Descripcion_Problema: formData.descripcion,
                    Fecha_Inicio: fechaInicio,
                    id_dispositivo: parseInt(formData.id_dispositivo),
                    ID_Empleado_Tecnico: parseInt(formData.id_tecnico),
                    id_tipo_mantenimiento: parseInt(formData.id_tipo),
                    id_estado: estadoInicial,
                    Tipo_Dispositivo_Afectado: 'Hardware',
                    Estado_Mantenimiento: 'Pendiente'
                }]);

                if (error) throw error;

                const disp = dispositivos.find(d => d.id_dispositivo === parseInt(formData.id_dispositivo));
                await registrarLog(
                    'MANTENIMIENTO',
                    `Nueva solicitud de mantenimiento creada: "${formData.descripcion}" en dispositivo ${disp?.tipos_dispositivos?.nombre_tipo || 'desconocido'}.`,
                    parseInt(formData.id_dispositivo)
                );

                Swal.fire('Creado', 'Solicitud de mantenimiento registrada', 'success');
            }

            closeModal();
            loadData();

        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    };

    const handleResolve = async (id) => {
        // Mostrar selector de estado para finalizar
        const opciones = estadosMantenimiento
            .filter(e => {
                const n = e.nombre_estado.toLowerCase();
                return n.includes('finalizado') || n.includes('resuelto') || n.includes('completado');
            });

        const estadoFinal = opciones.length > 0 ? opciones[0] : estadosMantenimiento[estadosMantenimiento.length - 1];

        const { value: confirm } = await Swal.fire({
            title: '¿Marcar como Finalizado?',
            html: `Se cambiará el estado a <b>${estadoFinal?.nombre_estado || 'Finalizado'}</b> y se registrará la fecha de finalización.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, finalizar',
            confirmButtonColor: '#16a34a'
        });

        if (confirm) {
            const { error } = await supabase.from('mantenimientos').update({
                id_estado: estadoFinal?.id_estado,
                Fecha_Fin: new Date().toISOString(),
                Estado_Mantenimiento: estadoFinal?.nombre_estado || 'Finalizado'
            }).eq('Id_Mantenimiento', id);

            if (!error) {
                const mant = mantenimientos.find(m => m.Id_Mantenimiento === id);
                await registrarLog(
                    'MANTENIMIENTO',
                    `Mantenimiento ID-${id} marcado como ${estadoFinal?.nombre_estado}. Dispositivo: ${mant?.dispositivos?.tipos_dispositivos?.nombre_tipo || 'N/A'}.`,
                    null
                );
                Swal.fire('Listo', 'Mantenimiento finalizado.', 'success');
                loadData();
            } else {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const handleDelete = async (id) => {
        const { isConfirmed } = await Swal.fire({
            title: '¿Eliminar mantenimiento?',
            text: 'Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });
        if (!isConfirmed) return;

        try {
            const { error } = await supabase.from('mantenimientos').delete().eq('Id_Mantenimiento', id);
            if (error) throw error;

            await registrarLog('MANTENIMIENTO', `Mantenimiento ID-${id} eliminado.`);
            Swal.fire('Eliminado', 'Mantenimiento eliminado correctamente.', 'success');
            loadData();
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        }
    };

    // Filtrado
    const filteredItems = mantenimientos.filter(m =>
        (m.Descripcion_Problema || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((m.empleados?.personas?.nombre || '') + ' ' + (m.empleados?.personas?.apellido || '')).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.dispositivos?.tipos_dispositivos?.nombre_tipo || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Helper: color del badge de estado
    const estadoBadge = (nombreEstado) => {
        if (!nombreEstado) return 'bg-gray-100 text-gray-600';
        const n = nombreEstado.toLowerCase();
        if (n.includes('pendiente')) return 'bg-yellow-100 text-yellow-800';
        if (n.includes('progreso') || n.includes('proceso')) return 'bg-blue-100 text-blue-800';
        if (n.includes('finalizado') || n.includes('resuelto') || n.includes('completado')) return 'bg-green-100 text-green-800';
        if (n.includes('cancelado')) return 'bg-red-100 text-red-800';
        return 'bg-gray-100 text-gray-600';
    };

    const isEstadoFinal = (nombreEstado) => {
        if (!nombreEstado) return false;
        const n = nombreEstado.toLowerCase();
        return n.includes('finalizado') || n.includes('resuelto') || n.includes('completado') || n.includes('cancelado');
    };

    return (
        <Layout>
            <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Mantenimiento</h2>
                    <p className="text-gray-500">Gestión de incidencias, reparaciones preventivas y correctivas.</p>
                </div>
                <button
                    onClick={openNewModal}
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
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan="7" className="text-center py-8">Cargando datos...</td></tr>
                            ) : filteredItems.length === 0 ? (
                                <tr><td colSpan="7" className="text-center py-8 text-gray-500">No hay mantenimientos registrados.</td></tr>
                            ) : (
                                filteredItems.map(item => {
                                    const nombreEstado = item.estado_mantenimiento?.nombre_estado || item.Estado_Mantenimiento;
                                    const finalizado = isEstadoFinal(nombreEstado);

                                    return (
                                        <tr key={item.Id_Mantenimiento} className="hover:bg-gray-50">
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
                                                    {new Date(item.Fecha_Inicio).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                                                </div>
                                                {item.Fecha_Fin && (
                                                    <div className="text-xs text-green-600 mt-1">
                                                        Fin: {new Date(item.Fecha_Fin).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs font-bold rounded-full ${estadoBadge(nombreEstado)}`}>
                                                    {nombreEstado || 'Sin estado'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex gap-1 justify-center">
                                                    <button
                                                        onClick={() => openEditModal(item)}
                                                        className="text-blue-500 hover:bg-blue-50 p-2 rounded-full transition"
                                                        title="Editar mantenimiento"
                                                    >
                                                        <FaEdit size={16} />
                                                    </button>
                                                    {!finalizado && (
                                                        <button
                                                            onClick={() => handleResolve(item.Id_Mantenimiento)}
                                                            className="text-green-600 hover:bg-green-50 p-2 rounded-full transition"
                                                            title="Marcar como Finalizado"
                                                        >
                                                            <FaCheckCircle size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(item.Id_Mantenimiento)}
                                                        className="text-red-500 hover:bg-red-50 p-2 rounded-full transition"
                                                        title="Eliminar mantenimiento"
                                                    >
                                                        <FaTrash size={14} />
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
                                    <SearchableSelect
                                        value={formData.id_dispositivo}
                                        onChange={val => setFormData({ ...formData, id_dispositivo: val })}
                                        placeholder="Buscar dispositivo..."
                                        options={dispositivos.map(d => ({
                                            value: d.id_dispositivo,
                                            label: d.tipos_dispositivos?.nombre_tipo || `Dispositivo #${d.id_dispositivo}`
                                        }))}
                                        required
                                    />
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Técnico Asignado *</label>
                                    <SearchableSelect
                                        value={formData.id_tecnico}
                                        onChange={val => setFormData({ ...formData, id_tecnico: val })}
                                        placeholder="Buscar técnico..."
                                        options={tecnicos.map(t => ({
                                            value: t.Id_Empleado,
                                            label: `${t.personas?.nombre || ''} ${t.personas?.apellido || ''}`.trim()
                                        }))}
                                        required
                                    />
                                </div>
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
                            </div>

                            {/* Estado — solo visible al editar */}
                            {editingId && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Estado *</label>
                                    <select
                                        required
                                        className="w-full border p-2 rounded bg-gray-50"
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
                                <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow">
                                    {editingId ? 'Guardar Cambios' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}



import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
    FaSearch, FaPlus, FaUserTie, FaTrash, FaSuitcase, FaCalendarAlt, FaCar, FaEdit
} from 'react-icons/fa';

export default function Asignaciones() {
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);

    // Modo edición
    const [editingAsignacion, setEditingAsignacion] = useState(null); // null = creando, objeto = editando

    // Catálogos
    const [empleadosList, setEmpleadosList] = useState([]);
    const [plazasList, setPlazasList] = useState([]);
    // Map: persona_id → vehiculo
    const [vehiculosMap, setVehiculosMap] = useState({});
    // Vehículo vinculado al empleado seleccionado
    const [vehiculoVinculado, setVehiculoVinculado] = useState(null);

    // Formulario
    const initialForm = {
        Id_Empleado: '',
        Id_Plaza: '',
        Fecha_Inicio: new Date().toISOString().split('T')[0],
        Fecha_Fin: '',
        Notas: ''
    };
    const [formData, setFormData] = useState(initialForm);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Cargar asignaciones
            const { data: asigData, error: asigError } = await supabase
                .from('asignaciones_parqueo')
                .select('*')
                .order('Fecha_Inicio', { ascending: false });

            if (asigError) {
                console.error("Error cargando asignaciones:", asigError);
                setAsignaciones([]);
                setLoading(false);
                return;
            }

            // 2. Cargar todos los empleados
            const { data: todosEmpleados } = await supabase
                .from('empleados')
                .select('Id_Empleado, personas(nombre, apellido)');

            // 3. Cargar todas las plazas (para mostrar en tabla)
            const { data: todasPlazas } = await supabase
                .from('plazas')
                .select('Id_Plaza, Numero_Plaza');

            // 4. Unir datos manualmente
            const asignacionesConDatos = asigData.map(asig => {
                const empleado = todosEmpleados?.find(e => e.Id_Empleado === asig.Id_Empleado_Asignado);
                const plaza = todasPlazas?.find(p => p.Id_Plaza === asig.Id_Plaza);
                return {
                    ...asig,
                    empleados: empleado || null,
                    plazas: plaza || null
                };
            });

            setAsignaciones(asignacionesConDatos || []);

            // 5. Empleados con persona_id para el selector
            const { data: empData } = await supabase
                .from('empleados')
                .select(`Id_Empleado, persona_id, personas ( nombre, apellido )`);
            setEmpleadosList(empData || []);

            // 6. Mapa de vehículos por persona_id
            const { data: vehData } = await supabase
                .from('vehiculos')
                .select('id, persona_id, placa, Marca, Color');

            const mapa = {};
            (vehData || []).forEach(v => {
                if (v.persona_id && !mapa[v.persona_id]) {
                    mapa[v.persona_id] = v;
                }
            });
            setVehiculosMap(mapa);

            // 7. Plazas libres para el selector (al crear, solo libres; al editar se añade la plaza actual)
            const { data: plazaData } = await supabase
                .from('plazas')
                .select('Id_Plaza, Numero_Plaza, Estado_Actual')
                .ilike('Estado_Actual', 'LIBRE')
                .order('Numero_Plaza');
            setPlazasList(plazaData || []);

        } catch (error) {
            console.error("Error general:", error.message);
        } finally {
            setLoading(false);
        }
    };

    // Cuando el usuario selecciona un empleado, buscar su vehículo vinculado
    const handleEmpleadoChange = (idEmpleado) => {
        setFormData(prev => ({ ...prev, Id_Empleado: idEmpleado }));
        if (!idEmpleado) {
            setVehiculoVinculado(null);
            return;
        }
        const empleado = empleadosList.find(e => String(e.Id_Empleado) === String(idEmpleado));
        const vehiculo = empleado?.persona_id ? (vehiculosMap[empleado.persona_id] || null) : null;
        setVehiculoVinculado(vehiculo);
    };

    // Abrir modal para CREAR
    const handleOpenCreate = async () => {
        setEditingAsignacion(null);
        setFormData(initialForm);
        setVehiculoVinculado(null);
        setShowModal(true);
    };

    // Abrir modal para EDITAR
    const handleOpenEdit = async (asignacion) => {
        setEditingAsignacion(asignacion);

        // Buscar el vehículo del empleado actual
        const empleado = empleadosList.find(e => e.Id_Empleado === asignacion.Id_Empleado_Asignado);
        const vehiculo = empleado?.persona_id ? (vehiculosMap[empleado.persona_id] || null) : null;
        setVehiculoVinculado(vehiculo);

        setFormData({
            Id_Empleado: String(asignacion.Id_Empleado_Asignado || ''),
            Id_Plaza: String(asignacion.Id_Plaza || ''),
            Fecha_Inicio: asignacion.Fecha_Inicio || new Date().toISOString().split('T')[0],
            Fecha_Fin: asignacion.Fecha_Fin || '',
            Notas: asignacion.Notas || ''
        });

        // Cargar plazas libres + la plaza actual de la asignación
        const { data: plazaData } = await supabase
            .from('plazas')
            .select('Id_Plaza, Numero_Plaza, Estado_Actual')
            .or(`Estado_Actual.ilike.LIBRE,Id_Plaza.eq.${asignacion.Id_Plaza}`)
            .order('Numero_Plaza');
        setPlazasList(plazaData || []);

        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingAsignacion(null);
        setFormData(initialForm);
        setVehiculoVinculado(null);
    };

    // CREAR asignación
    const handleCreate = async () => {
        const { data: estadoData } = await supabase
            .from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Asignada').single();
        const idAsignada = estadoData?.id_estado || 2;

        const { error: insertError } = await supabase.from('asignaciones_parqueo').insert([{
            Id_Empleado_Asignado: parseInt(formData.Id_Empleado),
            Id_Plaza: parseInt(formData.Id_Plaza),
            Fecha_Inicio: formData.Fecha_Inicio,
            Fecha_Fin: formData.Fecha_Fin || null,
            Notas: formData.Notas,
            Estado_Asignacion: 'Activa'
        }]);
        if (insertError) throw insertError;

        await supabase.from('plazas').update({
            Estado_Actual: 'ASIGNADA', id_estado: idAsignada
        }).eq('Id_Plaza', formData.Id_Plaza);

        Swal.fire('Éxito', 'Plaza asignada correctamente.', 'success');
    };

    // EDITAR asignación
    const handleUpdate = async () => {
        const plazaAnterior = editingAsignacion.Id_Plaza;
        const plazaNueva = parseInt(formData.Id_Plaza);
        const plazaCambia = plazaAnterior !== plazaNueva;

        const { data: estadoData } = await supabase
            .from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Asignada').single();
        const idAsignada = estadoData?.id_estado || 2;

        // Actualizar la asignación
        const { error: updateError } = await supabase
            .from('asignaciones_parqueo')
            .update({
                Id_Empleado_Asignado: parseInt(formData.Id_Empleado),
                Id_Plaza: plazaNueva,
                Fecha_Inicio: formData.Fecha_Inicio,
                Fecha_Fin: formData.Fecha_Fin || null,
                Notas: formData.Notas,
            })
            .eq('Id_Asignacion', editingAsignacion.Id_Asignacion);
        if (updateError) throw updateError;

        if (plazaCambia) {
            // Liberar la plaza anterior
            await supabase.from('plazas').update({
                Estado_Actual: 'LIBRE', id_estado: 1
            }).eq('Id_Plaza', plazaAnterior);

            // Asignar la nueva plaza
            await supabase.from('plazas').update({
                Estado_Actual: 'ASIGNADA', id_estado: idAsignada
            }).eq('Id_Plaza', plazaNueva);
        }

        Swal.fire('Actualizado', 'Asignación modificada correctamente.', 'success');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.Id_Empleado || !formData.Id_Plaza) {
            return Swal.fire('Error', 'Debe seleccionar empleado y plaza', 'warning');
        }
        try {
            setLoading(true);
            if (editingAsignacion) {
                await handleUpdate();
            } else {
                await handleCreate();
            }
            setFormData(initialForm);
            setVehiculoVinculado(null);
            setShowModal(false);
            setEditingAsignacion(null);
            loadData();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleLiberar = async (asignacion) => {
        const result = await Swal.fire({
            title: '¿Liberar Plaza?',
            text: "Se eliminará la asignación y la plaza quedará libre.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar',
            confirmButtonColor: '#d33'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('asignaciones_parqueo').delete().eq('Id_Asignacion', asignacion.Id_Asignacion);
                if (error) throw error;

                await supabase.from('plazas').update({
                    Estado_Actual: 'LIBRE', id_estado: 1
                }).eq('Id_Plaza', asignacion.Id_Plaza);

                Swal.fire('Liberado', 'La plaza está disponible nuevamente.', 'success');
                loadData();
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const filteredData = asignaciones.filter(item => {
        const empData = item.empleados;
        const nombre = empData?.personas?.nombre || empData?.nombre || '';
        const apellido = empData?.personas?.apellido || empData?.apellido || '';
        const plaza = item.plazas?.Numero_Plaza || '';
        const fullString = `${nombre} ${apellido} ${plaza}`.toLowerCase();
        return fullString.includes(searchTerm.toLowerCase());
    });

    // Plazas disponibles en el modal (incluye la actual si estamos editando)
    const plazasDisponibles = editingAsignacion
        ? plazasList  // ya cargadas con OR (libre OR plaza actual)
        : plazasList;

    return (
        <Layout>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Asignaciones Fijas</h2>
                    <p className="text-gray-500">Gestión de parqueos asignados a empleados.</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow flex items-center gap-2 transition"
                >
                    <FaPlus /> Nueva Asignación
                </button>
            </header>

            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                <div className="flex justify-end mb-4">
                    <div className="relative w-64">
                        <input
                            type="text"
                            placeholder="Buscar empleado o plaza..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-purple-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <FaSearch className="absolute left-3 top-3 text-gray-400" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-purple-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Empleado</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Plaza</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Inicio</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Fin</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Notas</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-purple-800 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredData.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-8 text-gray-500 italic">No hay asignaciones registradas.</td></tr>
                            ) : (
                                filteredData.map(item => (
                                    <tr key={item.Id_Asignacion} className="hover:bg-purple-50/20 transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                                            <div className="bg-purple-100 p-2 rounded-full text-purple-600"><FaUserTie /></div>
                                            {item.empleados ?
                                                `${item.empleados.personas?.nombre || ''} ${item.empleados.personas?.apellido || ''}`.trim()
                                                : <span className="text-gray-400 italic font-normal">Sin datos</span>
                                            }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-700">
                                            {item.plazas?.Numero_Plaza || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <FaCalendarAlt className="text-gray-400" />
                                                {item.Fecha_Inicio ? new Date(item.Fecha_Inicio).toLocaleDateString() : '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {item.Fecha_Fin
                                                ? <span className="flex items-center gap-1"><FaCalendarAlt className="text-red-400" />{new Date(item.Fecha_Fin).toLocaleDateString()}</span>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate">
                                            {item.Notas || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenEdit(item)}
                                                    className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 text-xs font-bold transition"
                                                >
                                                    <FaEdit className="inline mr-1" /> Editar
                                                </button>
                                                <button
                                                    onClick={() => handleLiberar(item)}
                                                    className="text-red-600 hover:bg-red-50 px-3 py-1 rounded border border-red-200 text-xs font-bold transition"
                                                >
                                                    <FaTrash className="inline mr-1" /> Liberar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-[420px] animate-fade-in-down border-t-4 border-purple-600">
                        <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                            {editingAsignacion
                                ? <><FaEdit className="text-blue-500" /> Editar Asignación</>
                                : <><FaSuitcase className="text-purple-600" /> Asignar Plaza</>
                            }
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Selector de Empleado */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">Empleado</label>
                                <select
                                    className="w-full border p-2 rounded focus:ring-purple-500 outline-none"
                                    value={formData.Id_Empleado}
                                    onChange={e => handleEmpleadoChange(e.target.value)}
                                    required
                                >
                                    <option value="">-- Seleccionar Empleado --</option>
                                    {empleadosList.map(emp => (
                                        <option key={emp.Id_Empleado} value={emp.Id_Empleado}>
                                            {emp.personas ? `${emp.personas.nombre} ${emp.personas.apellido}` : `ID: ${emp.Id_Empleado}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Vehículo Vinculado (solo lectura) */}
                            {formData.Id_Empleado && (
                                <div className={`rounded-lg p-3 border flex items-start gap-3 ${vehiculoVinculado ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className={`mt-0.5 p-1.5 rounded-full ${vehiculoVinculado ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'}`}>
                                        <FaCar size={13} />
                                    </div>
                                    {vehiculoVinculado ? (
                                        <div>
                                            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-0.5">Vehículo Vinculado</p>
                                            <p className="text-sm font-bold text-gray-800 font-mono">{vehiculoVinculado.placa}</p>
                                            {(vehiculoVinculado.Marca || vehiculoVinculado.Color) && (
                                                <p className="text-xs text-gray-500">
                                                    {[vehiculoVinculado.Marca, vehiculoVinculado.Color].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">Sin vehículo vinculado</p>
                                            <p className="text-xs text-gray-400">Este empleado no tiene vehículo registrado.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Plaza */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">
                                    Plaza {editingAsignacion ? '(Disponibles + Actual)' : 'Disponible'}
                                </label>
                                <select
                                    className="w-full border p-2 rounded focus:ring-purple-500 outline-none"
                                    value={formData.Id_Plaza}
                                    onChange={e => setFormData({ ...formData, Id_Plaza: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Plaza --</option>
                                    {plazasDisponibles.map(p => (
                                        <option key={p.Id_Plaza} value={p.Id_Plaza}>
                                            {p.Numero_Plaza}
                                            {editingAsignacion && p.Id_Plaza === editingAsignacion.Id_Plaza ? ' (actual)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Fechas */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="w-full border p-2 rounded focus:ring-purple-500 outline-none"
                                        value={formData.Fecha_Inicio}
                                        onChange={e => setFormData({ ...formData, Fecha_Inicio: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">Fecha Fin</label>
                                    <input
                                        type="date"
                                        className="w-full border p-2 rounded focus:ring-purple-500 outline-none"
                                        value={formData.Fecha_Fin}
                                        onChange={e => setFormData({ ...formData, Fecha_Fin: e.target.value })}
                                        min={formData.Fecha_Inicio || undefined}
                                    />
                                </div>
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">Notas</label>
                                <textarea
                                    className="w-full border p-2 rounded focus:ring-purple-500 outline-none"
                                    rows="2"
                                    placeholder="Detalles adicionales..."
                                    value={formData.Notas}
                                    onChange={e => setFormData({ ...formData, Notas: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 font-bold">Cancelar</button>
                                <button type="submit" disabled={loading}
                                    className={`px-4 py-2 text-white rounded font-bold shadow transition ${editingAsignacion ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                                >
                                    {loading ? 'Guardando...' : editingAsignacion ? 'Guardar Cambios' : 'Guardar Asignación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}

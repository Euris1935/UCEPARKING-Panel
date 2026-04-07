

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
    FaSearch, FaPlus, FaUserTie, FaTrash, FaSuitcase, FaCalendarAlt, FaCar, FaEdit, FaSync, FaTimesCircle
} from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Asignaciones() {
    const { orgId } = useOrg();
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Modo edición
    const [editingAsignacion, setEditingAsignacion] = useState(null); // null = creando, objeto = editando
    const [isPermanent, setIsPermanent] = useState(false);

    // Catálogos
    const [empleadosList, setEmpleadosList] = useState([]);
    const [empleadosConPlaza, setEmpleadosConPlaza] = useState(new Set()); // Empleados con plaza asignada
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
        setIsRefreshing(true);
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

            const { data: todosEmpleados } = await supabase
                .from('empleados')
                .select('Id_Empleado, personas(nombre, apellido)');
            const todosEmpleadosOrdenados = (todosEmpleados || []).sort((a, b) => {
                const na = `${a.personas?.nombre ?? ''} ${a.personas?.apellido ?? ''}`.toLowerCase();
                const nb = `${b.personas?.nombre ?? ''} ${b.personas?.apellido ?? ''}`.toLowerCase();
                return na.localeCompare(nb);
            });

            // 3. Cargar todas las plazas (para mostrar en tabla)
            const { data: todasPlazas } = await supabase
                .from('plazas')
                .select('Id_Plaza, Numero_Plaza');

            // 4. Unir datos manualmente
            const asignacionesConDatos = asigData.map(asig => {
                const empleado = todosEmpleadosOrdenados?.find(e => e.Id_Empleado === asig.Id_Empleado_Asignado);
                const plaza = todasPlazas?.find(p => p.Id_Plaza === asig.Id_Plaza);
                return {
                    ...asig,
                    empleados: empleado || null,
                    plazas: plaza || null
                };
            });

            setAsignaciones(asignacionesConDatos || []);

            // 4.1. Calcular conjunto de empleados que ya tienen plaza (solo activas)
            const ocupados = new Set(
                (asigData || [])
                .filter(a => a.id_estado === 1 && (!a.Fecha_Fin || new Date(a.Fecha_Fin) >= new Date(new Date().setHours(0,0,0,0))))
                .map(a => a.Id_Empleado_Asignado)
            );
            setEmpleadosConPlaza(ocupados);

            // 5. Empleados con persona_id para el selector
            const { data: empData } = await supabase
                .from('empleados')
                .select(`Id_Empleado, id_persona, personas ( nombre, apellido )`);
            const sortedEmpData = (empData || []).sort((a, b) => {
                const na = `${a.personas?.nombre ?? ''} ${a.personas?.apellido ?? ''}`.toLowerCase();
                const nb = `${b.personas?.nombre ?? ''} ${b.personas?.apellido ?? ''}`.toLowerCase();
                return na.localeCompare(nb);
            });
            setEmpleadosList(sortedEmpData);

            // 6. Mapa de vehículos por persona_id
            const { data: vehData } = await supabase
                .from('vehiculos')
                .select('id_vehiculo, id_persona, placa, marcas_vehiculo(nombre), colores_vehiculo(nombre)');

            const mapa = {};
            (vehData || []).forEach(v => {
                if (v.id_persona && !mapa[v.id_persona]) {
                    mapa[v.id_persona] = v;
                }
            });
            setVehiculosMap(mapa);

            // 7. Plazas libres para el selector (al crear, solo libres; al editar se añade la plaza actual)
            const { data: plazaData } = await supabase
                .from('plazas')
                .select('Id_Plaza, Numero_Plaza')
                .eq('id_estado', 1)
                .order('Numero_Plaza');
            setPlazasList(plazaData || []);

        } catch (error) {
            console.error("Error general:", error.message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
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
        const vehiculo = empleado?.id_persona ? (vehiculosMap[empleado.id_persona] || null) : null;
        setVehiculoVinculado(vehiculo);
    };

    // Abrir modal para CREAR
    const handleOpenCreate = async () => {
        setEditingAsignacion(null);
        setFormData(initialForm);
        setVehiculoVinculado(null);
        setIsPermanent(false);
        setShowModal(true);
    };

    // Abrir modal para EDITAR
    const handleOpenEdit = async (asignacion) => {
        setEditingAsignacion(asignacion);

        // Buscar el vehículo del empleado actual
        const empleado = empleadosList.find(e => e.Id_Empleado === asignacion.Id_Empleado_Asignado);
        const vehiculo = empleado?.id_persona ? (vehiculosMap[empleado.id_persona] || null) : null;
        setVehiculoVinculado(vehiculo);

        setFormData({
            Id_Empleado: String(asignacion.Id_Empleado_Asignado || ''),
            Id_Plaza: String(asignacion.Id_Plaza || ''),
            Fecha_Inicio: asignacion.Fecha_Inicio || new Date().toISOString().split('T')[0],
            Fecha_Fin: asignacion.Fecha_Fin || '',
            Notas: asignacion.Notas || ''
        });
        setIsPermanent(!asignacion.Fecha_Fin);

        // Cargar plazas libres + la plaza actual de la asignación
        const { data: plazaData } = await supabase
            .from('plazas')
            .select('Id_Plaza, Numero_Plaza')
            .or(`id_estado.eq.1,Id_Plaza.eq.${asignacion.Id_Plaza}`)
            .order('Numero_Plaza');
        setPlazasList(plazaData || []);

        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingAsignacion(null);
        setFormData(initialForm);
        setVehiculoVinculado(null);
        setIsPermanent(false);
    };

    // CREAR asignación
    const handleCreate = async () => {
        if (!vehiculoVinculado) {
            return Swal.fire({
                title: 'Sin vehículo registrado',
                text: 'No se puede crear la asignación. El empleado seleccionado no tiene un vehículo registrado en el sistema. Registra el vehículo primero en el módulo de Vehículos.',
                icon: 'warning',
                confirmButtonText: 'Entendido'
            });
        }

        const { data: estadosCat } = await supabase.from('estado_plaza').select('id_estado, nombre_estado');
        const estadoAsig = (estadosCat || []).find(e => 
            e.nombre_estado.toUpperCase().includes('ASIGN') || 
            e.nombre_estado.toUpperCase().includes('FIJA')
        );
        const idAsignada = estadoAsig?.id_estado || 2;

        const { error: insertError } = await supabase.from('asignaciones_parqueo').insert([{
            Id_Empleado_Asignado: parseInt(formData.Id_Empleado),
            Id_Plaza: parseInt(formData.Id_Plaza),
            Fecha_Inicio: formData.Fecha_Inicio,
            Fecha_Fin: isPermanent ? null : (formData.Fecha_Fin || null),
            Notas: formData.Notas,
            id_estado: 1,
            organizacion_id: orgId
        }]);
        if (insertError) throw insertError;

        await supabase.from('plazas').update({
            id_estado: idAsignada
        }).eq('Id_Plaza', formData.Id_Plaza);

        Swal.fire('Éxito', 'Plaza asignada correctamente.', 'success');
    };

    // EDITAR asignación
    const handleUpdate = async () => {
        const plazaAnterior = editingAsignacion.Id_Plaza;
        const plazaNueva = parseInt(formData.Id_Plaza);
        const plazaCambia = plazaAnterior !== plazaNueva;

        const { data: estadosCat } = await supabase.from('estado_plaza').select('id_estado, nombre_estado');
        const estadoAsig = (estadosCat || []).find(e => 
            e.nombre_estado.toUpperCase().includes('ASIGN') || 
            e.nombre_estado.toUpperCase().includes('FIJA')
        );
        const idAsignada = estadoAsig?.id_estado || 2;

        // Actualizar la asignación
        const { error: updateError } = await supabase
            .from('asignaciones_parqueo')
            .update({
                Id_Empleado_Asignado: parseInt(formData.Id_Empleado),
                Id_Plaza: plazaNueva,
                Fecha_Inicio: formData.Fecha_Inicio,
                Fecha_Fin: isPermanent ? null : (formData.Fecha_Fin || null),
                Notas: formData.Notas,
            })
            .eq('Id_Asignacion', editingAsignacion.Id_Asignacion);
        if (updateError) throw updateError;

        if (plazaCambia) {
            // Liberar la plaza anterior
            await supabase.from('plazas').update({
                id_estado: 1
            }).eq('Id_Plaza', plazaAnterior);

            // Asignar la nueva plaza
            await supabase.from('plazas').update({
                id_estado: idAsignada
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
            setIsPermanent(false);
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
                    id_estado: 1
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
                {!showModal && (
                    <button
                        onClick={handleOpenCreate}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow flex items-center gap-2 transition"
                    >
                        <FaPlus /> Nueva Asignación
                    </button>
                )}
            </header>

            <div className="flex flex-col lg:flex-row gap-6">

                <div className="flex-1 min-w-0">
                  <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-64">
                            <input
                                type="text"
                                placeholder="Buscar empleado o plaza..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
                        </div>
                        <button
                            onClick={loadData}
                            disabled={isRefreshing}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition disabled:opacity-50"
                            title="Refrescar lista"
                        >
                            <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-purple-50 sticky top-0 z-10 shadow-sm">
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
                                                    : <span className="flex items-center gap-1 font-bold text-green-600"><FaCalendarAlt className="text-green-600"/> Indeterminada</span>}
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
                </div>

                {showModal && (
                <aside className="w-full lg:w-[400px] flex-shrink-0">
                   <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                            <FaSuitcase className="text-purple-600"/> {editingAsignacion ? 'Editar Asignación' : 'Asignar Plaza'}
                        </h3>
                        <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                            <FaTimesCircle size={18} />
                        </button>
                      </div>
                      <form onSubmit={handleSubmit} className="space-y-4">
                         <div>
                           <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Empleado *</label>
                           <SearchableSelect
                             options={empleadosList.filter(emp => {
                                 const esMismoEmpleado = editingAsignacion && parseInt(formData.Id_Empleado) === emp.Id_Empleado;
                                 return !empleadosConPlaza.has(emp.Id_Empleado) || esMismoEmpleado;
                             }).map(emp => ({
                                 value: emp.Id_Empleado,
                                 label: emp.personas ? `${emp.personas.nombre} ${emp.personas.apellido}` : `ID: ${emp.Id_Empleado}`
                             }))}
                             value={formData.Id_Empleado}
                             onChange={(val) => handleEmpleadoChange(val)}
                             placeholder="— Seleccionar Empleado —"
                             focusRingClass="focus:ring-purple-500"
                             selectedItemClass="bg-purple-100 text-purple-800"
                             className="bg-gray-50/50"
                           />
                         </div>

                         {/* Vehículo Vinculado (solo lectura) */}
                         {formData.Id_Empleado && (
                             <div className={`rounded-lg p-3 border flex items-start gap-3 ${vehiculoVinculado ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                                 <div className={`mt-0.5 p-1.5 rounded-full ${vehiculoVinculado ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'}`}>
                                     <FaCar size={13} />
                                 </div>
                                 {vehiculoVinculado ? (
                                     <div>
                                         <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide mb-0.5">Vehículo Vinculado</p>
                                         <p className="text-sm font-bold text-gray-800 font-mono">{vehiculoVinculado.placa}</p>
                                         {(vehiculoVinculado.marcas_vehiculo?.nombre || vehiculoVinculado.colores_vehiculo?.nombre) && (
                                             <p className="text-xs text-gray-500">
                                                 {[vehiculoVinculado.marcas_vehiculo?.nombre, vehiculoVinculado.colores_vehiculo?.nombre].filter(Boolean).join(' · ')}
                                             </p>
                                         )}
                                     </div>
                                 ) : (
                                     <div>
                                         <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Sin vehículo vinculado</p>
                                         <p className="text-xs text-gray-400">Este empleado no tiene vehículo registrado.</p>
                                     </div>
                                 )}
                             </div>
                         )}

                         <div>
                           <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                               Plaza {editingAsignacion ? '(Disponibles + Actual)' : 'Disponible'} *
                           </label>
                           <SearchableSelect
                             options={plazasDisponibles.map(p => ({
                                 value: p.Id_Plaza,
                                 label: `${p.Numero_Plaza}${editingAsignacion && String(p.Id_Plaza) === String(editingAsignacion.Id_Plaza) ? ' (actual)' : ''}`
                             }))}
                             value={formData.Id_Plaza}
                             onChange={(val) => setFormData({...formData, Id_Plaza: val})}
                             placeholder="— Seleccionar Plaza —"
                             focusRingClass="focus:ring-purple-500"
                             selectedItemClass="bg-purple-100 text-purple-800"
                             className="bg-gray-50/50"
                           />
                         </div>

                         <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Inicio *</label>
                             <input type="date" className="w-full border rounded-lg p-2 text-sm focus:ring-purple-500 bg-gray-50 outline-none" value={formData.Fecha_Inicio} onChange={(e) => setFormData({...formData, Fecha_Inicio: e.target.value})} required />
                           </div>
                           <div className="flex flex-col">
                              <div className="flex justify-between items-center mb-1">
                                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Fecha Fin *</label>
                                  <label className="flex items-center gap-1 text-[10px] uppercase font-bold text-purple-700 cursor-pointer">
                                      <input 
                                          type="checkbox" 
                                          checked={isPermanent}
                                          onChange={(e) => {
                                              setIsPermanent(e.target.checked);
                                              if (e.target.checked) setFormData({ ...formData, Fecha_Fin: '' });
                                          }}
                                          className="rounded text-purple-600 focus:ring-purple-500"
                                      />
                                      Fija
                                  </label>
                              </div>
                              <input type="date" className={`w-full border rounded-lg p-2 text-sm focus:ring-purple-500 bg-gray-50 outline-none ${isPermanent ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : ''}`} value={formData.Fecha_Fin} onChange={(e) => setFormData({...formData, Fecha_Fin: e.target.value})} min={formData.Fecha_Inicio || undefined} disabled={isPermanent} />
                           </div>
                         </div>
                         
                         <div>
                           <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Notas</label>
                           <textarea
                             className="w-full border rounded-lg p-2 text-sm focus:ring-purple-500 bg-gray-50 outline-none"
                             rows="2"
                             placeholder="Detalles adicionales..."
                             value={formData.Notas}
                             onChange={e => setFormData({ ...formData, Notas: e.target.value })}
                           />
                         </div>

                         <div className="pt-2">
                           <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md disabled:opacity-50 flex justify-center items-center gap-2">
                             <FaSuitcase /> {editingAsignacion ? 'GUARDAR CAMBIOS' : 'GUARDAR ASIGNACIÓN'}
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

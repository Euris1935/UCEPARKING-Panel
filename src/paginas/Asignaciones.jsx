
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
    FaSearch, FaPlus, FaUserTie, FaTrash, FaSuitcase,
    FaCalendarAlt, FaCar, FaEdit, FaSync, FaTimesCircle,
    FaCheck, FaTimes
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
    const [currentPersonaId, setCurrentPersonaId] = useState(null);

    // Modo edición
    const [editingAsignacion, setEditingAsignacion] = useState(null);
    const [isPermanent, setIsPermanent] = useState(false);

    // Catálogos
    const [empleadosList, setEmpleadosList] = useState([]);
    const [empleadosConPlaza, setEmpleadosConPlaza] = useState(new Set());
    const [plazasList, setPlazasList] = useState([]);

    // Map: persona_id → vehiculo
    const [vehiculosMap, setVehiculosMap] = useState({});
    const [vehiculoVinculado, setVehiculoVinculado] = useState(null);

    // Estados para cambio de estado "in-place"
    const [changingStatusFor, setChangingStatusFor] = useState(null);
    const [newStatusChoice, setNewStatusChoice] = useState(null);
    const [estadosAsigList, setEstadosAsigList] = useState([]);

    const getNowLocalISO = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    };

    const initialForm = {
        Id_Empleado: '',
        Id_Plaza: '',
        Id_Vehiculo: '',
        Fecha_Inicio: getNowLocalISO(),
        Fecha_Fin: '',
        Notas: ''
    };
    const [formData, setFormData] = useState(initialForm);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
                if (uData?.id_persona) setCurrentPersonaId(uData.id_persona);
            }
        };
        init();
        loadData();
        checkExpiredAssignments(); // Ejecutar monitor al inicio

        // Ejecutar limpieza cada 5 minutos
        const timer = setInterval(checkExpiredAssignments, 300000);

        // Sincronización en tiempo real
        const channel = supabase.channel('realtime_asignaciones')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, () => {
                console.log("Cambio en asignación detectado");
                loadData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, () => loadData())
            .subscribe();

        return () => { 
            supabase.removeChannel(channel); 
            clearInterval(timer);
        };
    }, []);
    
    /**
     * Monitor de Autocierre de Asignaciones
     * Busca contratos cuya fecha_fin ya pasó y los marca como Finalizada en la BD.
     */
    const checkExpiredAssignments = async () => {
        try {
            console.log("[AutoClose] Verificando asignaciones vencidas...");
            const ahora = new Date().toISOString();
            
            // 1. Buscar asignaciones activas (id_estado=1) cuya fecha_fin ya pasó
            const { data: vencidas, error } = await supabase
                .from('asignacion')
                .select('id_asignacion, id_plaza')
                .eq('id_estado', 1)
                .eq('organizacion_id', orgId)
                .not('fecha_fin', 'is', null)
                .lt('fecha_fin', ahora);
            
            if (error) throw error;
            if (!vencidas || vencidas.length === 0) return;

            console.log(`[AutoClose] Encontradas ${vencidas.length} asignaciones para cerrar.`);
            const { data: eaFinalizada } = await supabase.from('estado_asignacion').select('id_estado').ilike('nombre', 'Finalizada').maybeSingle();
            const idFinalizada = eaFinalizada?.id_estado || 2;
            const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
            const idLibre = epLibre?.id_estado || 1;

            for (const asig of vencidas) {
                // Cerrar asignación
                await supabase.from('asignacion').update({ id_estado: idFinalizada }).eq('id_asignacion', asig.id_asignacion);
                // Liberar plaza
                if (asig.id_plaza) {
                    await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', asig.id_plaza);
                }
            }
            
            console.log("[AutoClose] Proceso completado.");
            loadData();
        } catch (e) {
            console.error("[AutoClose] Error:", e.message);
        }
    };

    const loadData = async () => {
        setLoading(true);
        setIsRefreshing(true);
        try {
            // 1. Cargar asignaciones (Más recientes primero por fecha de creación)
            const { data: asigData, error: asigError } = await supabase
                .from('asignacion')
                .select('*')
                .order('created_at', { ascending: false });
            if (asigError) {
                console.error("Error cargando asignaciones:", asigError);
                setAsignaciones([]);
                setLoading(false);
                return;
            }

            // 2. Cargar todos los empleados con persona
            const { data: todosEmpleados } = await supabase
                .from('empleado')
                .select('id_empleado, persona(nombre, apellido)');
            const todosEmpleadosOrdenados = (todosEmpleados || []).sort((a, b) => {
                const na = `${a.persona?.nombre ?? ''} ${a.persona?.apellido ?? ''}`.toLowerCase();
                const nb = `${b.persona?.nombre ?? ''} ${b.persona?.apellido ?? ''}`.toLowerCase();
                return na.localeCompare(nb);
            });

            // 3. Cargar todas las plazas
            const { data: todasPlazas } = await supabase
                .from('plaza')
                .select('id_plaza, numero_plaza');

            // 4. Unir datos manualmente y calcular estado derivado
            const ahora = new Date();

            const asignacionesConDatos = asigData.map(asig => {
                const emp = todosEmpleadosOrdenados?.find(e => e.id_empleado === asig.id_empleado);
                const plz = todasPlazas?.find(p => p.id_plaza === asig.id_plaza);
                
                // Lógica de auto-vencimiento en el frontend
                let estadoFinal = asig.id_estado;
                if (asig.id_estado === 1 && asig.fecha_fin) {
                    const fFin = new Date(asig.fecha_fin);
                    if (fFin < ahora) estadoFinal = 2; // Mostrar como finalizada si ya venció
                }

                return { 
                    ...asig, 
                    empleado: emp || null, 
                    plaza: plz || null,
                    _estadoCalculado: estadoFinal 
                };
            });
            setAsignaciones(asignacionesConDatos || []);

            // 4.1. Conjunto de empleados con plaza activa
            const ocupados = new Set(
                (asigData || [])
                .filter(a => a.id_estado === 1 && (!a.fecha_fin || new Date(a.fecha_fin) >= new Date(new Date().setHours(0,0,0,0))))
                .map(a => a.id_empleado)
            );
            setEmpleadosConPlaza(ocupados);

            // 5. Empleados para el selector
            const { data: empData } = await supabase
                .from('empleado')
                .select('id_empleado, id_persona, persona(nombre, apellido)');
            const sortedEmpData = (empData || []).sort((a, b) => {
                const na = `${a.persona?.nombre ?? ''} ${a.persona?.apellido ?? ''}`.toLowerCase();
                const nb = `${b.persona?.nombre ?? ''} ${b.persona?.apellido ?? ''}`.toLowerCase();
                return na.localeCompare(nb);
            });

            // Restablecer lista de empleados para el componente SearchableSelect
            const empConEstado = sortedEmpData.map(emp => ({
                ...emp,
                _ocupadoPorOtro: false,
                _razon: null
            }));
            setEmpleadosList(empConEstado);

            // 6. Mapa de vehículos habilitados por persona_id
            const { data: vehData } = await supabase
                .from('vehiculo')
                .select('id_vehiculo, id_persona, placa, modelo(nombre, marca(nombre)), color(nombre)')
                .eq('id_estado', 1); // Solo Habilitados
            const mapa = {};
            (vehData || []).forEach(v => {
                if (v.id_persona) {
                    if (!mapa[v.id_persona]) mapa[v.id_persona] = [];
                    mapa[v.id_persona].push(v);
                }
            });
            setVehiculosMap(mapa);

            // 7. Plazas libres para el selector
            const { data: epLibre } = await supabase
                .from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
            const idEstLibrePlaza = epLibre?.id_estado || 1;
            const { data: plazaData } = await supabase
                .from('plaza')
                .select('id_plaza, numero_plaza, zona:id_zona(estado_zona(nombre))')
                .eq('id_estado', idEstLibrePlaza)
                .order('numero_plaza');
            
            // Filtro dinámico según estado de la zona
            const plazasDisponibles = (plazaData || []).filter(p => (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa');
            setPlazasList(plazasDisponibles);

            // 8. Cargar catálogo de estados de asignación
            const { data: catEst } = await supabase.from('estado_asignacion').select('*').order('id_estado');
            setEstadosAsigList(catEst || []);

        } catch (error) {
            console.error("Error general:", error.message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const registrarLog = async (tipo_nombre, descripcion) => {
        if (!currentPersonaId) return;
        try {
            const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
            const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Asignaciones').maybeSingle();
            await supabase.from('evento').insert([{
                fecha_hora: new Date().toISOString(),
                descripcion: descripcion,
                id_persona: currentPersonaId,
                id_tipo: te?.id_tipo || null,
                id_origen_evento: oe?.id_origen || null,
                organizacion_id: orgId
            }]);
        } catch (e) { console.warn('Log error:', e.message); }
    };

    const handleEmpleadoChange = (idEmpleado) => {
        setFormData(prev => ({ ...prev, Id_Empleado: idEmpleado, Id_Vehiculo: '' }));
        if (!idEmpleado) {
            setVehiculoVinculado(null);
            return;
        }
        const empleado = empleadosList.find(e => String(e.id_empleado) === String(idEmpleado));
        const vehiculos = empleado?.id_persona ? (vehiculosMap[empleado.id_persona] || []) : [];
        
        if (vehiculos.length === 1) {
            setFormData(prev => ({ ...prev, Id_Vehiculo: String(vehiculos[0].id_vehiculo) }));
        }
        setVehiculoVinculado(vehiculos);
    };

    const handleOpenCreate = async () => {
        setEditingAsignacion(null);
        setFormData({ ...initialForm, Fecha_Inicio: getNowLocalISO() });
        setVehiculoVinculado(null);
        setIsPermanent(false);
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idEstLibrePlaza = epLibre?.id_estado || 1;
        const { data: plazaData } = await supabase
            .from('plaza')
            .select('id_plaza, numero_plaza, zona:id_zona(estado_zona(nombre))')
            .eq('id_estado', idEstLibrePlaza)
            .order('numero_plaza');
        
        const plazasDisponibles = (plazaData || []).filter(p => (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa');
        setPlazasList(plazasDisponibles);
        setShowModal(true);
    };

    const handleOpenEdit = async (asig) => {
        setEditingAsignacion(asig);
        const empleado = empleadosList.find(e => e.id_empleado === asig.id_empleado);
        const vehiculos = empleado?.id_persona ? (vehiculosMap[empleado.id_persona] || []) : [];
        setVehiculoVinculado(vehiculos);
        setFormData({
            Id_Empleado: String(asig.id_empleado || ''),
            Id_Plaza: String(asig.id_plaza || ''),
            Id_Vehiculo: String(asig.id_vehiculo || ''),
            Fecha_Inicio: asig.fecha_inicio ? new Date(new Date(asig.fecha_inicio).getTime() - new Date(asig.fecha_inicio).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
            Fecha_Fin: asig.fecha_fin ? new Date(new Date(asig.fecha_fin).getTime() - new Date(asig.fecha_fin).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
            Notas: asig.notas || ''
        });
        setIsPermanent(!asig.fecha_fin);
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idEstLibrePlaza = epLibre?.id_estado || 1;
        const { data: plazaData } = await supabase
            .from('plaza')
            .select('id_plaza, numero_plaza, zona:id_zona(estado_zona(nombre))')
            .or(`id_estado.eq.${idEstLibrePlaza},id_plaza.eq.${asig.id_plaza}`)
            .order('numero_plaza');
        
        // Mantener la plaza actual aunque la zona esté bloqueada (para evitar errores en edición), 
        // pero filtrar las demás.
        const plazasDisponibles = (plazaData || []).filter(p => 
            p.id_plaza === asig.id_plaza || (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa'
        );
        setPlazasList(plazasDisponibles);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingAsignacion(null);
        setFormData(initialForm);
        setVehiculoVinculado(null);
        setIsPermanent(false);
    };

    const handleCreate = async () => {
        if (!formData.Id_Vehiculo) {
            return Swal.fire({
                title: 'Vehículo requerido',
                text: 'Debe seleccionar un vehículo habilitado para completar la asignación.',
                icon: 'warning',
                confirmButtonText: 'Entendido'
            });
        }
        const { data: epAsignado } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Asignado').maybeSingle();
        const idAsignadaPlaza = epAsignado?.id_estado || 2;
        const { data: eaActiva } = await supabase.from('estado_asignacion').select('id_estado').ilike('nombre', 'Activa').maybeSingle();
        const idEstadoAsig = eaActiva?.id_estado || 1;
        const { error: insertError } = await supabase.from('asignacion').insert([{
            id_empleado: parseInt(formData.Id_Empleado),
            id_plaza: parseInt(formData.Id_Plaza),
            id_vehiculo: parseInt(formData.Id_Vehiculo),
            fecha_inicio: new Date(formData.Fecha_Inicio).toISOString(),
            fecha_fin: isPermanent || !formData.Fecha_Fin ? null : new Date(formData.Fecha_Fin).toISOString(),
            notas: formData.Notas,
            id_estado: idEstadoAsig,
            organizacion_id: orgId
        }]);
        if (insertError) throw insertError;
        await supabase.from('plaza').update({ id_estado: idAsignadaPlaza }).eq('id_plaza', formData.Id_Plaza);
        Swal.fire('Exito', 'Plaza asignada correctamente.', 'success');
    };

    const handleUpdate = async () => {
        const plazaAnterior = editingAsignacion.id_plaza;
        const plazaNueva = parseInt(formData.Id_Plaza);
        const plazaCambia = plazaAnterior !== plazaNueva;
        const { data: epAsignado } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Asignado').maybeSingle();
        const idAsignadaPlaza = epAsignado?.id_estado || 2;
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idLibrePlaza = epLibre?.id_estado || 1;
        const { error: updateError } = await supabase
            .from('asignacion')
            .update({
                id_empleado: parseInt(formData.Id_Empleado),
                id_plaza: plazaNueva,
                id_vehiculo: parseInt(formData.Id_Vehiculo),
                fecha_inicio: new Date(formData.Fecha_Inicio).toISOString(),
                fecha_fin: isPermanent || !formData.Fecha_Fin ? null : new Date(formData.Fecha_Fin).toISOString(),
                notas: formData.Notas,
            })
            .eq('id_asignacion', editingAsignacion.id_asignacion);
        if (updateError) throw updateError;
        if (plazaCambia) {
            await supabase.from('plaza').update({ id_estado: idLibrePlaza }).eq('id_plaza', plazaAnterior);
            await supabase.from('plaza').update({ id_estado: idAsignadaPlaza }).eq('id_plaza', plazaNueva);
        }
        Swal.fire('Actualizado', 'Asignacion modificada correctamente.', 'success');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!orgId) {
            return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
        }
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
            const emp = empleadosList.find(e => e.id_empleado === parseInt(formData.Id_Empleado));
            const plz = plazasList.find(p => p.id_plaza === parseInt(formData.Id_Plaza));
            registrarLog(
                editingAsignacion ? 'Asignacion Modificada' : 'Cambio de Estado',
                `${editingAsignacion ? 'Edicion' : 'Creacion'} de asignacion: Empleado ${emp?.persona?.nombre} ${emp?.persona?.apellido} en Plaza ${plz?.numero_plaza}`
            );
            handleCloseModal();
            loadData();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmarCambioEstado = async (asig) => {
        if (!orgId) return;
        const oldStatus = asig.id_estado;
        const nextStatus = parseInt(newStatusChoice);

        if (oldStatus === nextStatus) {
            setChangingStatusFor(null);
            return;
        }

        try {
            setLoading(true);
            
            // 1. Calcular payload de actualización de asignación primero
            const updatePayload = { 
                id_estado: nextStatus,
                notas: asig.notas
            };
            
            if (nextStatus === 2) { // Finalizada
                    const momentAhora = new Date();
                    const momentInicio = new Date(asig.fecha_inicio);
                    
                    // Asegurar que la fecha de fin sea mayor o igual al inicio para cumplir con el constraint
                    const fechaFinFinal = momentAhora > momentInicio ? momentAhora.toISOString() : momentInicio.toISOString();
                    updatePayload.fecha_fin = fechaFinFinal;
                    
                    console.log(`[StatusChange] Inicio: ${asig.fecha_inicio} -> Fin: ${updatePayload.fecha_fin}`);
            }

            // 2. ACTUALIZAR ASIGNACIÓN PRIMERO (Si esto falla, no liberamos la plaza)
            const { error: upErr } = await supabase
                .from('asignacion')
                .update(updatePayload)
                .eq('id_asignacion', asig.id_asignacion);
            
            if (upErr) {
                console.error("Error al cerrar asignacion:", upErr);
                throw new Error(`No se pudo cerrar el contrato: ${upErr.message}`);
            }

            // 3. SOLO SI EL CONTRATO SE CERRÓ: Liberar la plaza
            if (nextStatus === 2 || nextStatus === 3) {
                const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
                const idLibrePlaza = epLibre?.id_estado || 1;
                
                if (asig.id_plaza) {
                    const { error: plzErr } = await supabase
                        .from('plaza')
                        .update({ id_estado: idLibrePlaza })
                        .eq('id_plaza', asig.id_plaza);
                    if (plzErr) console.error("Error liberando plaza (pos-contrato):", plzErr);
                }
            }

            Swal.fire({
                title: 'Actualizado',
                text: 'El contrato se ha cerrado y la plaza ha sido liberada.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            registrarLog('Finalización Contrato', `Asignación ${asig.id_asignacion} cerrada exitosamente.`);
            setChangingStatusFor(null);
            loadData();
        } catch (error) {
            Swal.fire('Error de Validación', error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSincronizarPlazas = async () => {
        const result = await Swal.fire({
            title: 'Sincronizar Plazas',
            text: '¿Deseas buscar y liberar plazas que no tienen asignaciones activas?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, sincronizar'
        });

        if (result.isConfirmed) {
            try {
                setLoading(true);
                // 1. Obtener estados
                const { data: epData } = await supabase.from('estado_plaza').select('id_estado, nombre');
                const idLibre = epData?.find(e => e.nombre === 'Libre')?.id_estado || 1;
                const idAsignada = epData?.find(e => e.nombre === 'Asignada')?.id_estado || 2;

                // 2. Obtener plazas marcadas como asignadas
                const { data: plazasAsignadas } = await supabase.from('plaza').select('id_plaza').eq('id_estado', idAsignada);
                
                // 3. Obtener asignaciones realmente activas (id_estado = 1)
                const { data: asignacionesActivas } = await supabase.from('asignacion').select('id_plaza').eq('id_estado', 1);
                const plazasConAsigReal = new Set(asignacionesActivas?.map(a => a.id_plaza));

                let corregidas = 0;
                for (const p of (plazasAsignadas || [])) {
                    if (!plazasConAsigReal.has(p.id_plaza)) {
                        await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', p.id_plaza);
                        corregidas++;
                    }
                }

                Swal.fire('Sincronización Completa', `Se detectaron y liberaron ${corregidas} plazas huérfanas.`, 'success');
                loadData();
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const filteredData = asignaciones.filter(item => {
        const empData = item.empleado;
        const nombre = empData?.persona?.nombre || empData?.nombre || '';
        const apellido = empData?.persona?.apellido || empData?.apellido || '';
        const plazaStr = item.plaza?.numero_plaza || '';
        const fullString = `${nombre} ${apellido} ${plazaStr}`.toLowerCase();
        return fullString.includes(searchTerm.toLowerCase());
    });

    return (
        <Layout>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Asignaciones Fijas</h2>
                    <p className="text-gray-500">Gestion de parqueos asignados a empleados.</p>
                </div>
                {!showModal && (
                    <button
                        onClick={handleOpenCreate}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow flex items-center gap-2 transition"
                    >
                        <FaPlus /> Nueva Asignacion
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
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadData}
                                        disabled={isRefreshing}
                                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition disabled:opacity-50"
                                        title="Refrescar lista"
                                    >
                                        <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-purple-50 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Empleado</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Plaza</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Creacion</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Inicio</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Fin</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Estado</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Notas</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-purple-800 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredData.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-8 text-gray-500 italic">No hay asignaciones registradas.</td></tr>
                                    ) : (
                                        filteredData.map(item => {
                                            const est = item._estadoCalculado;
                                            const isClosed = est !== 1;
                                            
                                            // Clases dinámicas para la fila
                                            let rowClass = "hover:bg-purple-50/20 transition";
                                            if (est === 2) rowClass = "bg-gray-50/50 grayscale-[0.4] opacity-80 opacity-60";
                                            if (est === 3) rowClass = "bg-amber-50/30 opacity-80";

                                            return (
                                                <tr key={item.id_asignacion} className={rowClass}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                                                        <div className={`p-2 rounded-full ${isClosed ? 'bg-gray-200 text-gray-500' : 'bg-purple-100 text-purple-600'}`}>
                                                            <FaUserTie />
                                                        </div>
                                                        <div className={isClosed ? 'text-gray-400 italic' : ''}>
                                                            {item.empleado
                                                                ? `${item.empleado.persona?.nombre || ''} ${item.empleado.persona?.apellido || ''}`.trim()
                                                                : <span className="text-gray-400 italic font-normal">Sin datos</span>
                                                            }
                                                        </div>
                                                    </td>
                                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${isClosed ? 'text-gray-400' : 'text-purple-700'}`}>
                                                        {item.plaza?.numero_plaza || 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                        <div className="flex items-center gap-1">
                                                            <FaCalendarAlt />
                                                            {item.created_at ? new Date(item.created_at).toLocaleString('es-DO', {
                                                                day: '2-digit', month: '2-digit', year: 'numeric'
                                                            }) : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-1">
                                                                <FaCalendarAlt className="text-gray-400" />
                                                                {item.fecha_inicio ? new Date(item.fecha_inicio).toLocaleDateString() : '-'}
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 ml-5 font-mono">
                                                                {item.fecha_inicio ? new Date(item.fecha_inicio).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {item.fecha_fin ? (
                                                            <div className="flex flex-col">
                                                                <span className="flex items-center gap-1">
                                                                    <FaCalendarAlt className={isClosed ? "text-gray-300" : "text-red-400"} />
                                                                    {new Date(item.fecha_fin).toLocaleDateString()}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 ml-5 font-mono">
                                                                    {new Date(item.fecha_fin).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className={`flex items-center gap-1 font-bold ${isClosed ? 'text-gray-300' : 'text-green-600'}`}>
                                                                <FaCalendarAlt /> Fija
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {changingStatusFor === item.id_asignacion ? (
                                                            <div className="flex items-center gap-1 animate-fadeIn">
                                                                <select 
                                                                    className="border border-purple-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-200 focus:border-purple-500 outline-none transition-all cursor-pointer bg-white"
                                                                    value={newStatusChoice}
                                                                    onChange={e => setNewStatusChoice(e.target.value)}
                                                                >
                                                                    {estadosAsigList.map(e => (
                                                                        <option key={e.id_estado} value={e.id_estado}>{e.nombre}</option>
                                                                    ))}
                                                                </select>
                                                                <button 
                                                                    onClick={() => handleConfirmarCambioEstado(item)} 
                                                                    className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition shadow-sm"
                                                                    title="Confirmar cambio"
                                                                >
                                                                    {loading ? <FaSync size={12} className="animate-spin" /> : <FaCheck size={12} />}
                                                                </button>
                                                                <button 
                                                                    onClick={() => setChangingStatusFor(null)} 
                                                                    className="p-1.5 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition"
                                                                    title="Cancelar"
                                                                >
                                                                    <FaTimes size={12} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {est === 1 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wider">Activa</span>}
                                                                {est === 2 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600 uppercase tracking-wider">Finalizada</span>}
                                                                {est === 3 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wider">Suspendida</span>}
                                                            </>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-400 italic max-w-xs truncate">
                                                        {item.notas || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {!isClosed ? (
                                                                <>
                                                                    {/* Botón Editar */}
                                                                    <button 
                                                                        onClick={() => handleOpenEdit(item)} 
                                                                        className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold transition flex items-center gap-1"
                                                                    >
                                                                        <FaEdit /> <span>Editar</span>
                                                                    </button>

                                                                    {/* Botón Estado */}
                                                                    <button 
                                                                        onClick={() => {
                                                                            setChangingStatusFor(item.id_asignacion);
                                                                            setNewStatusChoice(item.id_estado);
                                                                        }} 
                                                                        disabled={changingStatusFor === item.id_asignacion}
                                                                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1 ${changingStatusFor === item.id_asignacion ? 'bg-gray-50 text-gray-300 border-gray-100' : 'text-purple-600 hover:bg-purple-50 border-purple-200'}`}
                                                                    >
                                                                        <FaSync /> <span>Estado</span>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-gray-300 text-[10px] font-bold uppercase italic select-none px-2 py-1 bg-gray-50 rounded italic border border-gray-100">Sin acciones</span>
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
                                <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                                    <FaSuitcase className="text-purple-600" /> {editingAsignacion ? 'Editar Asignacion' : 'Asignar Plaza'}
                                </h3>
                                <button type="button" onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                                    <FaTimesCircle size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Empleado *</label>
                                    <SearchableSelect
                                        options={empleadosList.map(emp => {
                                            const esMismo = editingAsignacion && parseInt(formData.Id_Empleado) === emp.id_empleado;
                                            const tieneAsig = !esMismo && empleadosConPlaza.has(emp.id_empleado);
                                            const tieneOtro = !esMismo && emp._ocupadoPorOtro;
                                            const ocupado = tieneAsig || tieneOtro;
                                            const razon = tieneAsig ? 'Ya tiene plaza asignada' : emp._razon;
                                            return {
                                                value: emp.id_empleado,
                                                label: emp.persona ? `${emp.persona.nombre} ${emp.persona.apellido}` : `ID: ${emp.id_empleado}`,
                                                disabled: ocupado,
                                                subtitle: ocupado ? ('No disponible - ' + razon) : null
                                            };
                                        })}
                                        value={formData.Id_Empleado}
                                        onChange={(val) => handleEmpleadoChange(val)}
                                        placeholder="— Seleccionar Empleado —"
                                        focusRingClass="focus:ring-purple-500"
                                        selectedItemClass="bg-purple-100 text-purple-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>

                                {formData.Id_Empleado && (
                                    <div className={`rounded-lg p-3 border space-y-3 ${vehiculoVinculado && vehiculoVinculado.length > 0 ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 p-1.5 rounded-full ${vehiculoVinculado && vehiculoVinculado.length > 0 ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'}`}>
                                                <FaCar size={13} />
                                            </div>
                                            {vehiculoVinculado && vehiculoVinculado.length > 0 ? (
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide mb-1">Seleccionar Vehículo Habilitado *</p>
                                                    <SearchableSelect
                                                        options={vehiculoVinculado.map(v => ({
                                                            value: v.id_vehiculo,
                                                            label: `${v.placa} - ${v.modelo?.marca?.nombre || ''} ${v.modelo?.nombre || ''}`,
                                                            subtitle: v.color?.nombre || 'Sin color'
                                                        }))}
                                                        value={formData.Id_Vehiculo}
                                                        onChange={(val) => setFormData(f => ({ ...f, Id_Vehiculo: val }))}
                                                        placeholder="— Seleccionar Vehículo —"
                                                        focusRingClass="focus:ring-purple-500"
                                                        selectedItemClass="bg-purple-200 text-purple-900"
                                                        className="bg-white"
                                                    />
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Sin vehículos habilitados</p>
                                                    <p className="text-xs text-red-400 font-medium">Este empleado no tiene vehículos activos en el sistema.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                                        Plaza {editingAsignacion ? '(Disponibles + Actual)' : 'Disponible'} *
                                    </label>
                                    <SearchableSelect
                                        options={plazasList.map(p => ({
                                            value: p.id_plaza,
                                            label: `${p.numero_plaza}${editingAsignacion && String(p.id_plaza) === String(editingAsignacion.id_plaza) ? ' (actual)' : ''}`
                                        }))}
                                        value={formData.Id_Plaza}
                                        onChange={(val) => setFormData({ ...formData, Id_Plaza: val })}
                                        placeholder="— Seleccionar Plaza —"
                                        focusRingClass="focus:ring-purple-500"
                                        selectedItemClass="bg-purple-100 text-purple-800"
                                        className="bg-gray-50/50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Inicio *</label>
                                        <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm focus:ring-purple-500 bg-gray-50 outline-none"
                                            value={formData.Fecha_Inicio}
                                            onChange={(e) => setFormData({ ...formData, Fecha_Inicio: e.target.value })}
                                            required />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase">Fecha Fin</label>
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
                                        <input type="datetime-local"
                                            className={`w-full border rounded-lg p-2 text-sm focus:ring-purple-500 bg-gray-50 outline-none ${isPermanent ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : ''}`}
                                            value={formData.Fecha_Fin}
                                            onChange={(e) => setFormData({ ...formData, Fecha_Fin: e.target.value })}
                                            min={formData.Fecha_Inicio || undefined}
                                            disabled={isPermanent} />
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
                                    <button type="submit" disabled={loading}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md disabled:opacity-50 flex justify-center items-center gap-2">
                                        <FaSuitcase /> {editingAsignacion ? 'GUARDAR CAMBIOS' : 'GUARDAR ASIGNACION'}
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
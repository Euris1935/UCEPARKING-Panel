import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaUserTie, FaTrash, FaPlus, FaArrowLeft, FaMapMarkerAlt, FaEnvelope, FaBuilding, FaPhone, FaEdit } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

export default function Empleados() {
    const { tienePermiso } = useRbac();
    const canCreate = tienePermiso('Módulo Personal', 'crear');
    const canEdit = tienePermiso('Módulo Personal', 'editar');
    const canDelete = tienePermiso('Módulo Personal', 'eliminar');

    const navigate = useNavigate();
    const [empleados, setEmpleados] = useState([]);

    // Estados 
    const [roles, setRoles] = useState([]);
    const [departamentos, setDepartamentos] = useState([]);
    const [organizaciones, setOrganizaciones] = useState([]);
    const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);

    // editar
    const [editingEmpleadoId, setEditingEmpleadoId] = useState(null);
    const [editingPersonaId, setEditingPersonaId] = useState(null);

    const initialForm = {
        id_persona: '',
        rol_id: '',
        departamento_id: '',
        organizacion_id: ''
    };
    const [formData, setFormData] = useState(initialForm);
    const isUpdating = !!editingEmpleadoId;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        let currentAdminOrgId = null;

        if (sessionData?.session?.user) {
            const { data: adminUsuario } = await supabase.from('usuarios').select('id_persona').eq('id', sessionData.session.user.id).single();
            if (adminUsuario?.id_persona) {
                const { data: adminEmp } = await supabase.from('empleados').select('organizacion_id').eq('id_persona', adminUsuario.id_persona).maybeSingle();
                if (adminEmp?.organizacion_id) {
                    currentAdminOrgId = adminEmp.organizacion_id;
                }
            }
        }

        const { data: rolesData } = await supabase.from('roles').select('*');
        const { data: deptData } = await supabase.from('departamentos').select('*');
        const { data: orgData } = await supabase.from('organizaciones').select('*');

        setRoles(rolesData || []);
        setDepartamentos(deptData || []);
        setOrganizaciones(orgData || []);

        const uceOrg = (orgData || []).find(o => o.Nombre_Organizacion?.toUpperCase().includes('UCE'));
        if (!editingEmpleadoId) {
            setFormData(prev => ({ 
                ...prev, 
                organizacion_id: currentAdminOrgId || prev.organizacion_id || uceOrg?.Id_Organizacion 
            }));
        }

        // Cargar empleados
        await loadEmpleados(rolesData, deptData, orgData);
    };

    const loadEmpleados = async (rolesList, deptList, orgList) => {
        try {

            const { data: empData, error: empError } = await supabase.from('empleados').select('*').order('Id_Empleado', { ascending: true });
            const { data: persData, error: persError } = await supabase.from('personas').select('*');
            const { data: usrsData, error: usrsError } = await supabase.from('usuarios').select('*');

            if (empError) throw empError;
            if (persError) throw persError;
            if (usrsError) throw usrsError;


            const listaCompleta = empData.map(emp => {
                const persona = persData.find(p => p.id_persona === emp.id_persona);


                const rol = rolesList?.find(r => r.Id_Rol === emp.rol_id);
                const depto = deptList?.find(d => d.Id_Departamento === emp.departamento_id);
                const org = orgList?.find(o => o.Id_Organizacion === emp.organizacion_id);

                return {

                    Id_Empleado: emp.Id_Empleado,
                    persona_id: emp.id_persona,

                    // Datos Persona
                    nombre: persona?.nombre || 'Sin Nombre',
                    apellido: persona?.apellido || '',
                    email: persona?.email || '',
                    telefono: persona?.telefono || '',
                    sexo: persona?.sexo || 'M',
                    fecha_nacimiento: persona?.fecha_nacimiento || '',
                    direccion: persona?.direccion || '',

                    // Datos Laborales (IDs)
                    rol_id: emp.rol_id,
                    departamento_id: emp.departamento_id,
                    organizacion_id: emp.organizacion_id,

                    // Datos Visuales (Nombres)
                    nombre_rol: rol?.Nombre_Rol || 'Sin Asignar',
                    nombre_depto: depto?.Nombre_Departamento || 'Sin Depto',
                    nombre_org: org?.Nombre_Organizacion || 'Sin Org'
                };
            });

            setEmpleados(listaCompleta);

            // Obtener usuarios disponibles (que no son empleados)
            const empPersonaIds = empData.map(e => e.id_persona);
            const disponibles = usrsData
                .filter(u => !empPersonaIds.includes(u.id_persona))
                .map(u => {
                    const p = persData.find(p => p.id_persona === u.id_persona);
                    return { 
                        ...u, 
                        nombreCompleto: (p?.nombre || '') + ' ' + (p?.apellido || ''), 
                        email: p?.email 
                    };
                });
            setUsuariosDisponibles(disponibles);

        } catch (error) {
            console.error("Error cargando empleados:", error);
        }
    };

    const handleEdit = (empleado) => {
        setEditingEmpleadoId(empleado.Id_Empleado);
        setEditingPersonaId(empleado.persona_id);

        setFormData({
            id_persona: empleado.persona_id,
            rol_id: empleado.rol_id,
            departamento_id: empleado.departamento_id,
            organizacion_id: empleado.organizacion_id
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingEmpleadoId(null);
        setEditingPersonaId(null);
        setFormData(initialForm);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.id_persona || !formData.rol_id || !formData.departamento_id || !formData.organizacion_id) {
            return Swal.fire('Atención', 'Usuario, Rol, Departamento y Organización son obligatorios.', 'warning');
        }

        try {
            Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

            // Convertir a enteros para garantizar el tipo correcto en la BD
            const rol_id = parseInt(formData.rol_id);
            const departamento_id = parseInt(formData.departamento_id);
            const organizacion_id = parseInt(formData.organizacion_id);

            if (isUpdating) {

                // Actualizar Empleado
                const { error: eError, count } = await supabase
                    .from('empleados')
                    .update({ rol_id, departamento_id, organizacion_id }, { count: 'exact' })
                    .eq('Id_Empleado', editingEmpleadoId);

                if (eError) throw eError;
                if (count === 0) throw new Error('No se actualizó ninguna fila en empleados.');

                Swal.fire('Actualizado', 'Datos laborales del empleado modificados.', 'success');

            } else {

                //  Crear Empleado vinculado al id de la persona
                const { error: eError } = await supabase
                    .from('empleados')
                    .insert([{
                        id_persona: formData.id_persona,
                        rol_id,
                        departamento_id,
                        organizacion_id
                    }]);

                if (eError) throw eError;

                Swal.fire('Registrado', 'Nuevo empleado añadido al sistema.', 'success');
            }

            closeModal();
            loadData();

        } catch (error) {
            console.error("Error:", error);
            Swal.fire('Error', error.message, 'error');
        }
    };

    const handleDelete = async (empleado) => {
        const result = await Swal.fire({
            title: '¿Eliminar empleado?',
            text: "Se eliminará el registro laboral del empleado. Los datos de usuario se mantendrán.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar como empleado'
        });

        if (result.isConfirmed) {
            try {
                //  Borrar Empleado
                const { error: eError } = await supabase.from('empleados').delete().eq('Id_Empleado', empleado.Id_Empleado);
                if (eError) throw eError;

                Swal.fire('Eliminado', 'Empleado eliminado correctamente. El usuario sigue registrado.', 'success');
                loadData();

            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const filteredEmpleados = empleados.filter(e =>
        (e.nombre + ' ' + e.apellido).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <header className="mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Gestión de Empleados</h2>
                    <p className="text-gray-500">Personal administrativo y operativo.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium transition">
                        <FaArrowLeft /> Volver a Usuarios
                    </button>
                    {canCreate && (
                        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow transition">
                            <FaPlus /> Nuevo Empleado
                        </button>
                    )}
                </div>
            </header>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-[700px] shadow-xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-purple-700 border-b pb-2">
                            <FaUserTie /> {isUpdating ? 'Editar Empleado' : 'Registrar Empleado'}
                        </h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">

                            <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Selección de Usuario</div>

                            <div className="col-span-2">
                                <label className="block text-xs mb-1">Usuario Existente</label>
                                {isUpdating ? (
                                    <input 
                                        className="w-full border p-2 rounded bg-gray-100 text-gray-600" 
                                        value={empleados.find(e => e.Id_Empleado === editingEmpleadoId)?.nombre + ' ' + empleados.find(e => e.Id_Empleado === editingEmpleadoId)?.apellido} 
                                        disabled 
                                    />
                                ) : (
                                    <select 
                                        className="w-full border p-2 rounded bg-gray-50"
                                        value={formData.id_persona}
                                        onChange={e => setFormData({ ...formData, id_persona: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Seleccionar Usuario Disponible --</option>
                                        {usuariosDisponibles.map(ud => (
                                            <option key={ud.id} value={ud.id_persona}>
                                                {ud.nombreCompleto} ({ud.email || 'Sin Email'})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Datos Laborales</div>

                            <div>
                                <label className="block text-xs mb-1 font-bold text-purple-700">Rol</label>
                                <select
                                    className="w-full border p-2 rounded bg-gray-50"
                                    value={formData.rol_id}
                                    onChange={e => setFormData({ ...formData, rol_id: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar --</option>

                                    {roles
                                        .filter(r => !['visitante', 'usuario regular'].includes(r.Nombre_Rol.toLowerCase()))
                                        .map(rol => (
                                            <option key={rol.Id_Rol} value={rol.Id_Rol}>{rol.Nombre_Rol}</option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs mb-1 font-bold text-purple-700">Departamento</label>
                                <select
                                    className="w-full border p-2 rounded bg-gray-50"
                                    value={formData.departamento_id}
                                    onChange={e => setFormData({ ...formData, departamento_id: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Depto --</option>
                                    {departamentos.map(dep => (
                                        <option key={dep.Id_Departamento} value={dep.Id_Departamento}>{dep.Nombre_Departamento}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-xs mb-1 font-bold text-purple-700">Organización</label>
                                <select
                                    className="w-full border p-2 rounded bg-gray-50"
                                    value={formData.organizacion_id}
                                    onChange={e => setFormData({ ...formData, organizacion_id: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Organización --</option>
                                    {organizaciones.map(org => (
                                        <option key={org.Id_Organizacion} value={org.Id_Organizacion}>{org.Nombre_Organizacion}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2 flex justify-end gap-2 mt-6 pt-4 border-t">
                                <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-100 rounded text-gray-600 hover:bg-gray-200">Cancelar</button>
                                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 shadow">{isUpdating ? 'Actualizar' : 'Guardar Empleado'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <div className="p-4 border-b bg-gray-50">
                    <div className="relative w-64">
                        <input type="text" placeholder="Buscar empleado..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-purple-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <FaSearch className="absolute left-3 top-3 text-gray-400" />
                    </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Empleado</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Contacto</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Detalles</th>
                            <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Asignación</th>
                            <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredEmpleados.length === 0 ? (
                            <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay empleados registrados.</td></tr>
                        ) : (
                            filteredEmpleados.map(e => (
                                <tr key={e.Id_Empleado} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-purple-100 p-2 rounded-full text-purple-600"><FaUserTie /></div>
                                            <div>
                                                <p className="font-bold text-gray-900">{e.nombre} {e.apellido}</p>

                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex flex-col gap-1">
                                            <span className="flex items-center gap-2"><FaEnvelope size={10} /> {e.email}</span>
                                            <span className="flex items-center gap-2"><FaPhone size={10} /> {e.telefono}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex flex-col gap-1 text-xs">
                                            <span>Sexo: {e.sexo === 'M' ? 'M' : 'F'}</span>
                                            {e.direccion && <span className="flex items-center gap-1"><FaMapMarkerAlt size={10} /> {e.direccion}</span>}
                                            {e.fecha_nacimiento && <span>Nac: {e.fecha_nacimiento}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500">
                                        <div className="flex flex-col gap-1">
                                            <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200 font-semibold w-fit">
                                                {e.nombre_rol}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <FaBuilding size={10} />
                                                {e.nombre_depto}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                {e.nombre_org}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        {canEdit && <button onClick={() => handleEdit(e)} className="text-blue-500 hover:text-blue-700 bg-blue-50 p-2 rounded-full transition" title="Editar"><FaEdit /></button>}
                                        {canDelete && <button onClick={() => handleDelete(e)} className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full transition" title="Eliminar"><FaTrash /></button>}
                                    </td>
                                </tr>
                            )))}
                    </tbody>
                </table>
            </div>
        </Layout>
    );
}
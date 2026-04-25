import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import Layout from '../componentes/Layout';
import RolesPermisosManager from '../componentes/RolesPermisosManager';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import {
  FaSearch, FaEdit, FaSync, FaUserTie, FaUsers,
  FaShieldAlt, FaKey, FaCheck, FaTimes, FaUserCircle, FaPlus, FaInfoCircle,
  FaAddressCard, FaPhone, FaMapMarkerAlt, FaIdCard, FaEnvelope, FaCalendarAlt
} from 'react-icons/fa';
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';
import { ROL } from '../lib/constants';

// ── Badge de rol con color dinámico ──────────────────────────────────────────
function RoleBadge({ roleId, roleName }) {
  let cls = 'bg-gray-100 text-gray-700';
  if (!roleId) return null;
  
  if (roleId === ROL.ADMIN)            cls = 'bg-red-100 text-red-700';
  else if (roleId === ROL.OPERADOR)     cls = 'bg-blue-100 text-blue-700';
  else if (roleId === ROL.TECNICO)      cls = 'bg-amber-100 text-amber-800';
  else if (roleId === ROL.SUPERVISOR)   cls = 'bg-purple-100 text-purple-700';
  else if (roleId === ROL.VISITANTE)    cls = 'bg-green-100 text-green-700';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize ${cls}`}>
      <FaShieldAlt size={9} />
      {roleName}
    </span>
  );
}

export default function Usuarios() {
  const { orgId } = useOrg();
  const { tienePermiso, esAdmin } = useRbac();
  const canCreate = tienePermiso('Módulo Usuarios', 'crear');
  const canEdit   = tienePermiso('Módulo Usuarios', 'editar');
  const canDelete = tienePermiso('Módulo Usuarios', 'eliminar');

  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState('usuarios');
  const [usuarios, setUsuarios]     = useState([]);
  const [rolesList, setRolesList]   = useState([]);
  const [catEstados, setCatEstados] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCarrera, setFilterCarrera] = useState('');
  const [filterFacultad, setFilterFacultad] = useState('');
  const [filterMatricula, setFilterMatricula] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDepto, setFilterDepto] = useState('');
  const [loading, setLoading]       = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  // Catálogos adicionales
  const [tiposPersona, setTiposPersona] = useState([]);
  const [facultades, setFacultades] = useState([]);
  const [carreras, setCarreras] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);

  const [searchMode, setSearchMode] = useState('all'); // all, student, employee, role, type

  // Estado para edición completa (formulario lateral)
  const [editingUser, setEditingUser] = useState(null);
  const initialForm = { 
    nombre: '', apellido: '', email: '', contrasena: '', 
    telefono: '', cedula: '', sexo: '', fecha_nacimiento: '', 
    direccion: '', rol_id: '',
    id_tipo_persona: '', 
    numero_carnet: '', id_facultad: '', id_carrera: '', año_academico: ''
  };
  const [formData, setFormData]     = useState(initialForm);

  // Estado para cambio rápido de rol y estado (inline)
  const [changingRolFor, setChangingRolFor] = useState(null); 
  const [newRolId, setNewRolId]             = useState('');
  const [changingStatusFor, setChangingStatusFor] = useState(null);
  const [newStatusChoice, setNewStatusChoice]     = useState('');

  const isUpdating = !!editingUser;

  useEffect(() => { 
    if (orgId) loadData(); 
  }, [orgId]);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [
        { data: rolesData }, 
        { data: estadosData },
        { data: tiposPData },
        { data: facultadesData },
        { data: carrerasData }
      ] = await Promise.all([
        supabase.from('rol').select('id_rol, nombre').order('nombre'),
        supabase.from('estado_usuario').select('id_estado, nombre').order('id_estado'),
        supabase.from('tipo_persona').select('*').order('id_tipo_persona'),
        supabase.from('facultad').select('*').order('nombre'),
        supabase.from('carrera').select('*').order('nombre')
      ]);
 
      setRolesList(rolesData || []);
      setCatEstados(estadosData || []);
      setTiposPersona(tiposPData || []);
      setFacultades(facultadesData || []);
      setCarreras(carrerasData || []);

      // 2. Obtener usuarios de la organización
      const [
        { data: orgUsers, error: orgErr },
        { data: estadosUsuarios },
        { data: estudiantesData },
        { data: empleadosData },
        { data: departamentosData },
        { data: personasData } 
      ] = await Promise.all([
        supabase.rpc('get_usuarios_org'),
        supabase.from('usuario').select('id, id_estado, estado_u:id_estado(nombre)').eq('organizacion_id', orgId),
        supabase.from('estudiante').select('*').eq('organizacion_id', orgId),
        supabase.from('empleado').select('*, departamento:id_departamento(nombre)').eq('organizacion_id', orgId),
        supabase.from('departamento').select('*').order('nombre'),
        supabase.from('persona').select('*')
      ]);

      if (orgErr) {
        console.error('Error get_usuarios_org:', orgErr);
        await loadUsuariosFallback(rolesData || []);
      } else {
        setDepartamentos(departamentosData || []);
        const estadoMap = Object.fromEntries(
          (estadosUsuarios || []).map(e => [e.id, { id_estado: e.id_estado, nombre_estado: e.estado_u?.nombre ?? 'Sin Estado' }])
        );

        const listaNormalizada = (orgUsers || []).map(u => {
          const est = estadoMap[u.id_usuario] ?? {};
          const estu = (estudiantesData || []).find(e => e.id_persona === u.id_persona);
          const empl = (empleadosData || []).find(e => e.id_persona === u.id_persona);
          
          // Obtener todos los datos reales de la persona
          const pData = (personasData || []).find(p => p.id_persona === u.id_persona);
          const idTipoActual = pData?.id_tipo_persona || u.id_tipo_persona;

          const tipoP = (tiposPData || []).find(t => t.id_tipo_persona === idTipoActual);

          return {
            ...u,
            ...pData, // Inyectamos todos los campos (cedula, telefono, etc.)
            id_usuario:    u.id_usuario || u.id,
            nombre_estado: est.nombre_estado || 'Activo',
            id_estado:     est.id_estado || 1,
            nombre_tipo_persona: tipoP?.nombre || 'General',
            // Data Estudiante
            id_facultad:   estu?.id_facultad || '',
            id_carrera:    estu?.id_carrera || '',
            nombre_carrera: (carrerasData || []).find(c => c.id_carrera === estu?.id_carrera)?.nombre || '',
            año_academico: estu?.año_academico || '',
            numero_carnet: estu?.numero_carnet || '',
            // Data Empleado
            cargo:         empl?.cargo || '',
            id_departamento: empl?.id_departamento || '',
            nombre_departamento: empl?.departamento?.nombre || ''
          };
        }).filter(u => u.id_rol !== ROL.VISITANTE)
          .sort((a,b) => {
            const na = `${a.nombre} ${a.apellido}`.toLowerCase();
            const nb = `${b.nombre} ${b.apellido}`.toLowerCase();
            return na.localeCompare(nb);
          });

        setUsuarios(listaNormalizada);
      }
    } catch (err) {
        console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsuariosFallback = async (rolesDisponibles) => {
    try {
      const [{ data: usrs }, { data: pers }] = await Promise.all([
        supabase.from('usuario').select('id, id_persona, rol_id, id_estado, created_at, estado:id_estado(nombre)').eq('organizacion_id', orgId),
        supabase.from('persona').select('id_persona, nombre, apellido, email, telefono, cedula, sexo, fecha_nacimiento, direccion')
      ]);
      
      if (!usrs) return;

      const lista = usrs.map(u => {
        const persona = (pers || []).find(p => p.id_persona === u.id_persona);
        const rol = rolesDisponibles.find(r => r.id_rol === u.rol_id);
        return {
          id_usuario: u.id,
          id_persona: u.id_persona,
          id_rol:     u.rol_id,
          id_estado:  u.id_estado,
          nombre_estado: u.estado?.nombre || 'Activo',
          nombre:     persona?.nombre   || 'Sin Nombre',
          apellido:   persona?.apellido || '',
          email:      persona?.email    || '',
          telefono:   persona?.telefono || '',
          cedula:     persona?.cedula   || '',
          nombre_rol: rol?.nombre       || 'Sin Rol',
          created_at: u.created_at
        };
      }).filter(u => u.id_rol !== ROL.VISITANTE);

      setUsuarios(lista);
    } catch (err) { console.error('Fallback error:', err); }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = name === 'rol_id' ? parseInt(value) : value;

    if (name === 'cedula') {
      const digits = value.replace(/\D/g, '');
      let fmt = digits;
      if (digits.length > 3) fmt = digits.slice(0, 3) + '-' + digits.slice(3);
      if (digits.length > 10) fmt = digits.slice(0, 3) + '-' + digits.slice(3, 10) + '-' + digits.slice(10, 11);
      val = fmt;
    }

    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setShowForm(true);
    setFormData({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email || '',
      telefono: user.telefono || '',
      cedula: user.cedula || '',
      sexo: user.sexo || '',
      fecha_nacimiento: user.fecha_nacimiento || '',
      direccion: user.direccion || '',
      rol_id: user.id_rol || '',
      id_tipo_persona: user.id_tipo_persona || '',
      numero_carnet: user.numero_carnet || '',
      id_facultad: user.id_facultad || '',
      id_carrera: user.id_carrera || '',
      año_academico: user.año_academico || '',
      contrasena: ''
    });
    setChangingRolFor(null);
  };

  const handleCancel = () => {
    setEditingUser(null);
    setShowForm(false);
    setFormData(initialForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Resolver orgId desde el contexto; si no está listo, buscarlo directo en BD
    let effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: usr } = await supabase
          .from('usuario')
          .select('organizacion_id')
          .eq('id', currentUser.id)
          .single();
        effectiveOrgId = usr?.organizacion_id ?? null;
      }
    }

    if (!effectiveOrgId) {
      return Swal.fire('Error', 'No se pudo determinar la organización. Recarga la página e intenta de nuevo.', 'error');
    }

    const { 
      nombre, apellido, email, telefono, cedula, sexo, fecha_nacimiento, 
      direccion, rol_id, contrasena, id_tipo_persona,
      numero_carnet, id_facultad, id_carrera, año_academico
    } = formData;

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      if (isUpdating) {
        // 1. Actualizar Persona
        const { error: pErr } = await supabase.from('persona')
          .update({ 
            nombre, 
            apellido, 
            telefono: telefono || null, 
            email, 
            cedula: cedula || null, 
            sexo, 
            fecha_nacimiento: fecha_nacimiento || null, 
            direccion,
            id_tipo_persona: parseInt(id_tipo_persona)
          })
          .eq('id_persona', editingUser.id_persona);
        if (pErr) throw pErr;

        // 2. Actualizar/Crear datos de Estudiante
        if (parseInt(id_tipo_persona) === 1) { // 1 = Estudiante
          const { error: estuErr } = await supabase.from('estudiante').upsert({
            id_persona: editingUser.id_persona,
            numero_carnet,
            id_facultad: id_facultad ? parseInt(id_facultad) : null,
            id_carrera: id_carrera ? parseInt(id_carrera) : null,
            año_academico: año_academico ? parseInt(año_academico) : null,
            organizacion_id: effectiveOrgId
          }, { onConflict: 'id_persona' });
          if (estuErr) throw estuErr;
        }

        // 3. Actualizar Usuario (Rol)
        if (parseInt(rol_id) !== editingUser.id_rol) {
          const { error: uErr } = await supabase.from('usuario')
            .update({ rol_id: parseInt(rol_id) })
            .eq('id', editingUser.id_usuario);
          if (uErr) throw uErr;
        }

        registrarLog({
          tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
          descripcion: `Usuario editado: ${nombre} ${apellido}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId
        });

        Swal.fire('Éxito', 'Usuario actualizado correctamente.', 'success');
        handleCancel();
      } else {
        // CREACIÓN (Usa RPC para asegurar atrocidad)
        const { data: resultado, error: rpcError } = await supabase.rpc('crear_usuario_admin', {
          p_email:    email,
          p_password: contrasena,
          p_nombre:   nombre,
          p_apellido: apellido,
          p_telefono: telefono   || null,
          p_sexo:     sexo       || 'M',
          p_fecha_nacimiento: fecha_nacimiento || null,
          p_direccion: direccion || null,
          p_rol_id:   parseInt(rol_id),
          p_org_id:   effectiveOrgId
        });

        if (rpcError) throw rpcError;
        if (resultado?.success === false) throw new Error(resultado.error || 'Error desconocido al crear el usuario.');
 
        const newUserId = resultado.user_id; // Asumiendo que el RPC devuelve el ID
        const newPersonaId = resultado.persona_id;

        // 4. Actualizar id_tipo_persona (si el RPC no lo hizo) y crear estudiante
        if (newPersonaId) {
            await supabase.from('persona').update({ id_tipo_persona: parseInt(id_tipo_persona) }).eq('id_persona', newPersonaId);
            
            if (parseInt(id_tipo_persona) === 1) {
                await supabase.from('estudiante').insert([{
                    id_persona: newPersonaId,
                    numero_carnet,
                    id_facultad: id_facultad ? parseInt(id_facultad) : null,
                    id_carrera: id_carrera ? parseInt(id_carrera) : null,
                    año_academico: año_academico ? parseInt(año_academico) : null,
                    organizacion_id: effectiveOrgId
                }]);
            }
        }

        registrarLog({
          tipo_nombre: EVENT_TYPES.USUARIO_CREADO,
          descripcion: `Nuevo usuario administrativo: ${nombre} ${apellido} (${email})`,
          id_persona: currentPersonaId,
          organizacion_id: orgId
        });

        Swal.fire('¡Creado!', 'Usuario registrado exitosamente.', 'success');
        handleCancel();
      }
      loadData();
    } catch (error) {
      console.error(error);
      Swal.fire('Error', error.message, 'error');
    }
  };

  const handleConfirmarCambioEstado = async (user) => {
    try {
      setLoading(true);
      const { data: updated, error } = await supabase
        .from('usuario')
        .update({ id_estado: parseInt(newStatusChoice) })
        .eq('id', user.id_usuario)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0)
        throw new Error('No se pudo actualizar el estado. Es posible que no tengas permiso para modificar este usuario.');

      Swal.fire({ title: 'Estado Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
      setChangingStatusFor(null);
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmarCambioRol = async (user) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('usuario')
        .update({ rol_id: parseInt(newRolId) })
        .eq('id', user.id_usuario);

      if (error) throw error;
      
      Swal.fire({ title: 'Rol Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
      setChangingRolFor(null);
      
      registrarLog({
        tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
        descripcion: `Rol actualizado para ${user.nombre} ${user.apellido}`,
        id_persona: currentPersonaId,
        organizacion_id: orgId
      });
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = usuarios
    .filter(u => {
      const matchesSearch = `${u.nombre} ${u.apellido} ${u.email || ''} ${u.nombre_rol || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (activeTab === 'info') {
        const matchesStatus = filterStatus === 'all' || 
          (filterStatus === 'activo' && u.nombre_estado?.toLowerCase() === 'activo') || 
          (filterStatus === 'inactivo' && u.nombre_estado?.toLowerCase() !== 'activo');
        
        if (!matchesStatus) return false;

        if (searchMode === 'student') {
          const mMat = !filterMatricula || (u.numero_carnet && u.numero_carnet.toLowerCase().includes(filterMatricula.toLowerCase()));
          const mFac = !filterFacultad || u.id_facultad === parseInt(filterFacultad);
          const mCar = !filterCarrera || u.id_carrera === parseInt(filterCarrera);
          return matchesSearch && mMat && mFac && mCar;
        }
        if (searchMode === 'employee') {
          const mDep = !filterDepto || u.id_departamento === parseInt(filterDepto);
          return matchesSearch && mDep;
        }
        if (searchMode === 'role') {
          // Reutilizamos el searchTerm o podemos añadir un select específico si prefieres
          return matchesSearch;
        }
        if (searchMode === 'type') {
          const mTyp = !formData.id_tipo_persona || u.id_tipo_persona === parseInt(formData.id_tipo_persona);
          return matchesSearch && mTyp;
        }
      }
      
      return matchesSearch;
    })
    .sort((a, b) => {
      const isAActive = a.nombre_estado?.toLowerCase() === 'activo';
      const isBActive = b.nombre_estado?.toLowerCase() === 'activo';
      if (isAActive && !isBActive) return -1;
      if (!isAActive && isBActive) return 1;
      return 0;
    });

  const tabCls = (tab) =>
    `px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${
      activeTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <Layout>
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-500">Administra cuentas, roles y permisos del sistema.</p>
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                {usuarios.filter(u => u.nombre_estado?.toLowerCase() === 'activo').length} activos
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'usuarios' && (
              <button
                onClick={() => { setShowForm(true); setEditingUser(null); setFormData(initialForm); }}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 px-5 rounded-lg font-bold shadow transition text-sm active:scale-95"
              >
                <FaPlus size={12} /> Nuevo Usuario
              </button>
            )}
            <button
              onClick={() => navigate('/empleados')}
              className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-2.5 px-5 rounded-lg font-semibold transition text-sm"
            >
              <FaUserTie /> Empleados
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mt-5">
          <button className={tabCls('usuarios')} onClick={() => setActiveTab('usuarios')}>
            <FaUsers className="inline mr-2 mb-0.5" size={13} />Cuentas de Usuario
          </button>
          <button className={tabCls('roles')} onClick={() => setActiveTab('roles')}>
            <FaKey className="inline mr-2 mb-0.5" size={13} />Roles y Permisos
          </button>
          <button className={tabCls('info')} onClick={() => setActiveTab('info')}>
            <FaInfoCircle className="inline mr-2 mb-0.5" size={13} />Directorio Info
          </button>
        </div>
      </header>

      {activeTab === 'usuarios' && (
        <div className={`grid gap-8 ${(showForm || isUpdating) ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
          <section className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text" placeholder="Buscar por nombre, email o rol..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-400" size={14} />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mr-3" />
                Cargando...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Usuario</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Rol</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha de Creación</th>
                      <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
                      <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filteredUsers.map(u => {
                      const isInactive = u.nombre_estado?.toLowerCase() !== 'activo';
                      return (
                        <tr key={u.id_usuario} className={`transition-all ${isInactive ? 'bg-gray-50/50 grayscale-[0.8] opacity-60' : 'hover:bg-gray-50/30'}`}>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 font-bold text-sm">
                              {(u.nombre?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{u.nombre} {u.apellido}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                           <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded border ${
                             u.id_tipo_persona === 1 ? 'bg-blue-50 text-blue-600 border-blue-200' :
                             u.id_tipo_persona === 2 ? 'bg-purple-50 text-purple-600 border-purple-200' :
                             u.id_tipo_persona === 3 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                             'bg-gray-50 text-gray-600 border-gray-200'
                           }`}>
                             {u.nombre_tipo_persona}
                           </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {changingRolFor === u.id_usuario ? (
                            <div className="flex items-center gap-1">
                              <select value={newRolId} onChange={e => setNewRolId(e.target.value)} className="border rounded px-2 py-1 text-xs">
                                {rolesList.filter(r => r.id_rol !== ROL.VISITANTE).map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>)}
                              </select>
                              <button onClick={() => handleConfirmarCambioRol(u)} className="p-1.5 bg-green-500 text-white rounded"><FaCheck size={10} /></button>
                              <button onClick={() => setChangingRolFor(null)} className="p-1.5 bg-gray-200 rounded"><FaTimes size={10} /></button>
                            </div>
                          ) : (
                            <RoleBadge roleId={u.id_rol} roleName={u.nombre_rol} />
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900 border-l border-transparent">
                          {u.created_at ? new Date(u.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : 'N/D'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {changingStatusFor === u.id_usuario ? (
                            <div className="flex items-center justify-center gap-1">
                              <select value={newStatusChoice} onChange={e => setNewStatusChoice(e.target.value)} className="border rounded px-2 py-1 text-xs">
                                {catEstados.map(s => <option key={s.id_estado} value={s.id_estado}>{s.nombre}</option>)}
                              </select>
                              <button onClick={() => handleConfirmarCambioEstado(u)} className="p-1.5 bg-green-500 text-white rounded"><FaCheck size={10} /></button>
                              <button onClick={() => setChangingStatusFor(null)} className="p-1.5 bg-gray-200 rounded"><FaTimes size={10} /></button>
                            </div>
                          ) : (
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${u.nombre_estado?.toLowerCase() === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {u.nombre_estado}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => { setChangingRolFor(u.id_usuario); setNewRolId(u.id_rol.toString()); }}
                              title="Cambiar Rol"
                              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-50 text-purple-700 font-bold rounded border border-purple-200 hover:bg-purple-100 transition"
                            >
                              <FaShieldAlt size={10} /> Rol
                            </button>
                            <button
                              onClick={() => { setChangingStatusFor(u.id_usuario); setNewStatusChoice(u.id_estado?.toString() || ''); }}
                              title="Cambiar Estado"
                              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-50 text-green-700 font-bold rounded border border-green-200 hover:bg-green-100 transition"
                            >
                              <FaSync size={10} /> Estado
                            </button>
                            <button
                              onClick={() => handleEdit(u)}
                              title="Editar Usuario"
                              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-50 text-blue-700 font-bold rounded border border-blue-200 hover:bg-blue-100 transition"
                            >
                              <FaEdit size={10} /> Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                        );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(showForm || isUpdating) && (
            <section className="lg:col-span-1 bg-white border border-gray-100 rounded-xl shadow-sm p-6 h-fit sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                <FaUserCircle className="text-green-600" /> {isUpdating ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <form className="space-y-3" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nombre *</label>
                    <input name="nombre" value={formData.nombre} onChange={handleChange} required className="w-full border p-2 rounded text-sm"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Apellido *</label>
                    <input name="apellido" value={formData.apellido} onChange={handleChange} required className="w-full border p-2 rounded text-sm"/>
                  </div>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Email *</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="off" className="w-full border p-2 rounded text-sm"/>
                </div>
                
                {!isUpdating && <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contraseña *</label>
                  <input type="password" name="contrasena" value={formData.contrasena} onChange={handleChange} required autoComplete="new-password" placeholder="••••••••" className="w-full border p-2 rounded text-sm"/>
                </div>}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cédula</label>
                    <input name="cedula" value={formData.cedula} onChange={handleChange} className="w-full border p-2 rounded text-sm font-mono"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Teléfono</label>
                    <input name="telefono" value={formData.telefono} onChange={handleChange} className="w-full border p-2 rounded text-sm"/>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sexo</label>
                  <select name="sexo" value={formData.sexo} onChange={handleChange} className="w-full border p-2 rounded text-sm bg-white">
                    <option value="">Seleccionar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Nacimiento</label>
                  <input type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento} onChange={handleChange} className="w-full border p-2 rounded text-sm"/>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dirección</label>
                  <textarea name="direccion" rows="3" value={formData.direccion} onChange={handleChange} className="w-full border p-2 rounded text-sm resize-none" placeholder="Escribe la dirección detallada..."></textarea>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo de Persona *</label>
                    <select name="id_tipo_persona" value={formData.id_tipo_persona} onChange={handleChange} required className="w-full border p-2 rounded text-sm bg-white">
                      <option value="">Seleccionar</option>
                      {tiposPersona.map(t => (
                        <option key={t.id_tipo_persona} value={t.id_tipo_persona}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Rol *</label>
                    <select name="rol_id" value={formData.rol_id} onChange={handleChange} required className="w-full border p-2 rounded text-sm bg-white">
                      <option value="">Selecciona un rol</option>
                      {rolesList.filter(r => r.id_rol !== ROL.VISITANTE).map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>)}
                    </select>
                  </div>
                </div>

                {/* Campos específicos para Estudiantes (ID 1) */}
                {parseInt(formData.id_tipo_persona) === 1 && (
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 space-y-3 animate-fadeIn">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Datos Académicos</p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Facultad *</label>
                        <select 
                          name="id_facultad" 
                          value={formData.id_facultad} 
                          onChange={e => setFormData(f => ({ ...f, id_facultad: e.target.value, id_carrera: '' }))} 
                          required={parseInt(formData.id_tipo_persona) === 1}
                          className="w-full border-blue-200 border p-2 rounded text-sm bg-white"
                        >
                          <option value="">— Seleccionar —</option>
                          {facultades.map(f => <option key={f.id_facultad} value={f.id_facultad}>{f.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Carrera *</label>
                        <select 
                          name="id_carrera" 
                          value={formData.id_carrera} 
                          onChange={handleChange} 
                          required={parseInt(formData.id_tipo_persona) === 1}
                          disabled={!formData.id_facultad}
                          className="w-full border-blue-200 border p-2 rounded text-sm bg-white disabled:bg-gray-50"
                        >
                          <option value="">— Seleccionar —</option>
                          {carreras
                            .filter(c => c.id_facultad === parseInt(formData.id_facultad))
                            .map(c => <option key={c.id_carrera} value={c.id_carrera}>{c.nombre}</option>)
                          }
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Matrícula *</label>
                        <input name="numero_carnet" value={formData.numero_carnet} onChange={handleChange} required={parseInt(formData.id_tipo_persona) === 1} placeholder="Ej: 2023-0001" className="w-full border-blue-200 border p-2 rounded text-sm"/>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Año Académico</label>
                        <input type="number" name="año_academico" value={formData.año_academico} onChange={handleChange} min="1" max="10" placeholder="1-10" className="w-full border-blue-200 border p-2 rounded text-sm"/>
                      </div>
                    </div>
                  </div>
                )}
                <div className="pt-3 flex justify-end gap-2 border-t mt-2">
                  <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm bg-gray-100 rounded font-medium hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" className="px-5 py-2 text-sm bg-green-600 text-white rounded font-bold shadow hover:bg-green-700 transition">{isUpdating ? 'Guardar Cambios' : 'Crear Usuario'}</button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <RolesPermisosManager />
        </div>
      )}

      {activeTab === 'info' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Cabecera Adaptativa e Inteligente */}
          <div className="p-6 border-b border-gray-100 bg-gray-50/30">
            <div className="flex flex-col md:flex-row items-end gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] font-black text-primary uppercase mb-1.5 ml-1">¿Qué deseas buscar hoy?</label>
                <div className="flex gap-2">
                  <select 
                    className="w-48 px-3 py-2 border-2 border-primary/20 rounded-lg text-sm font-bold focus:border-primary outline-none bg-white shadow-sm"
                    value={searchMode} 
                    onChange={e => { setSearchMode(e.target.value); setFilterMatricula(''); setFilterCarrera(''); setFilterFacultad(''); setFilterDepto(''); }}
                  >
                    <option value="all">Ver Todos</option>
                    <option value="student">Estudiantes</option>
                    <option value="employee">Empleados</option>
                    <option value="role">Por Rol</option>
                    <option value="type">Tipo de Persona</option>
                  </select>
                  <div className="relative flex-1">
                    <input
                      type="text" placeholder="Búsqueda rápida por nombre o email..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none h-[40px]"
                      value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    />
                    <FaSearch className="absolute left-3 top-3 text-gray-400" size={13} />
                  </div>
                </div>
              </div>

              <div className="w-full md:w-40">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 ml-1">Estado</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white h-[40px]"
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
              </div>
            </div>

            {/* Filtros Dinámicos según el modo */}
            {searchMode !== 'all' && (
              <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                {searchMode === 'student' && (
                  <>
                    <div className="w-full md:w-40">
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Matrícula</label>
                      <input
                        type="text" placeholder="Buscar..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white"
                        value={filterMatricula} onChange={e => setFilterMatricula(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Facultad</label>
                      <select 
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white"
                        value={filterFacultad} onChange={e => { setFilterFacultad(e.target.value); setFilterCarrera(''); }}
                      >
                        <option value="">Todas las facultades</option>
                        {facultades.map(f => <option key={f.id_facultad} value={f.id_facultad}>{f.nombre}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Carrera</label>
                      <select 
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white disabled:bg-gray-100"
                        value={filterCarrera} onChange={e => setFilterCarrera(e.target.value)}
                        disabled={!filterFacultad}
                      >
                        <option value="">Todas las carreras</option>
                        {carreras.filter(c => !filterFacultad || c.id_facultad === parseInt(filterFacultad)).map(c => (
                          <option key={c.id_carrera} value={c.id_carrera}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {searchMode === 'employee' && (
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Departamento</label>
                    <select 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white"
                      value={filterDepto} onChange={e => setFilterDepto(e.target.value)}
                    >
                      <option value="">Todos los departamentos</option>
                      {departamentos.map(d => <option key={d.id_departamento} value={d.id_departamento}>{d.nombre}</option>)}
                    </select>
                  </div>
                )}

                {searchMode === 'type' && (
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo de Persona</label>
                    <select 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none bg-white"
                      value={formData.id_tipo_persona} 
                      onChange={e => setFormData(f => ({ ...f, id_tipo_persona: e.target.value }))}
                    >
                      <option value="">Todos los tipos</option>
                      {tiposPersona.map(t => <option key={t.id_tipo_persona} value={t.id_tipo_persona}>{t.nombre}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex items-end">
                  <button 
                    onClick={() => { setSearchMode('all'); setSearchTerm(''); setFilterMatricula(''); setFilterCarrera(''); setFilterFacultad(''); setFilterStatus('all'); setFilterDepto(''); }}
                    className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition underline decoration-dotted"
                  >
                    Restablecer vista
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Identificación / Datos Personales</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Información {searchMode === 'employee' ? 'Laboral' : 'Académica'} / Rol</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Contacto y Ubicación</th>
                  <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center text-gray-400">
                      <FaSearch size={40} className="mx-auto mb-3 opacity-10" />
                      <p className="font-medium text-lg italic">No se encontraron resultados que coincidan con los criterios.</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isActive = u.nombre_estado?.toLowerCase() === 'activo';
                    return (
                      <tr key={u.id_usuario} className={`hover:bg-green-50/20 transition-colors ${!isActive ? 'opacity-70 grayscale-[0.3]' : ''}`}>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center border border-gray-100 font-bold text-lg shadow-sm">
                              {u.nombre?.[0]?.toUpperCase()}{u.apellido?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800 leading-none mb-1">{u.nombre} {u.apellido}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">CED: {u.cedula || 'N/D'}</span>
                                {u.sexo && <span className="text-[10px] font-bold text-gray-400">{u.sexo === 'M' ? 'M' : 'F'}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            {searchMode === 'employee' || (u.id_tipo_persona !== 1 && u.cargo) ? (
                              <>
                                <p className="text-xs font-bold text-purple-600 leading-tight">Cargo: <span className="text-gray-700">{u.cargo || 'N/D'}</span></p>
                                <p className="text-[10px] text-gray-400 uppercase font-black truncate max-w-[200px]" title={u.nombre_departamento}>{u.nombre_departamento || 'Sin Depto'}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-bold text-gray-700 leading-tight">Matrícula: <span className="text-primary">{u.numero_carnet || 'N/D'}</span></p>
                                <p className="text-[10px] text-gray-500 uppercase font-black truncate max-w-[200px]" title={u.nombre_carrera}>{u.nombre_carrera || 'Sin Carrera'}</p>
                              </>
                            )}
                            <div className="pt-1">
                              <RoleBadge roleId={u.id_rol} roleName={u.nombre_rol} />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <FaEnvelope className="text-gray-300" size={10} />
                              <span className="truncate max-w-[180px]">{u.email || 'N/D'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                              <FaPhone className="text-gray-300" size={10} />
                              <span>{u.telefono || 'N/D'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 leading-tight italic">
                              <FaMapMarkerAlt className="text-gray-300" size={9} />
                              <span className="truncate max-w-[200px]" title={u.direccion}>{u.direccion || 'N/D'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {u.nombre_estado}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <span>Resultados: {filteredUsers.length}</span>
            <span>Directorio Maestro UCEPARKING</span>
          </div>
        </div>
      )}
    </Layout>
  );
}
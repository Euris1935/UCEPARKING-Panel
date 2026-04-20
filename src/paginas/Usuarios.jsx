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
  FaShieldAlt, FaKey, FaCheck, FaTimes, FaUserCircle
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
  const [loading, setLoading]       = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  // Estado para edición completa (formulario lateral)
  const [editingUser, setEditingUser] = useState(null); 
  const initialForm = { 
    nombre: '', apellido: '', email: '', contrasena: '', 
    telefono: '', cedula: '', sexo: '', fecha_nacimiento: '', 
    direccion: '', rol_id: '' 
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
      // 1. Obtener catálogos
      const [{ data: rolesData }, { data: estadosData }] = await Promise.all([
        supabase.from('rol').select('id_rol, nombre').order('nombre'),
        supabase.from('estado_usuario').select('id_estado, nombre').order('id_estado')
      ]);

      setRolesList(rolesData || []);
      setCatEstados(estadosData || []);

      // 2. Obtener usuarios de la organización
      const { data: orgUsers, error: orgErr } = await supabase.rpc('get_usuarios_org');

      if (orgErr) {
        console.error('Error get_usuarios_org:', orgErr);
        await loadUsuariosFallback(rolesData || []);
      } else {
        const listaNormalizada = (orgUsers || []).map(u => ({
          ...u,
          id_usuario: u.id_usuario || u.id, 
          id_persona: u.id_persona || u.persona_id,
          id_rol:     u.id_rol || u.rol_id,
          nombre_rol: u.nombre_rol || u.rol_nombre || 'Sin Rol',
          nombre_estado: u.nombre_estado || u.estado_nombre || 'Activo'
        })).filter(u => u.id_rol !== ROL.VISITANTE); // Filtrar visitantes de la gestión de usuarios

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
        supabase.from('usuario').select('id, id_persona, id_rol, id_estado, created_at, estado:id_estado(nombre)').eq('organizacion_id', orgId),
        supabase.from('persona').select('id_persona, nombre, apellido, email, telefono, cedula, sexo, fecha_nacimiento, direccion')
      ]);
      
      if (!usrs) return;

      const lista = usrs.map(u => {
        const persona = (pers || []).find(p => p.id_persona === u.id_persona);
        const rol = rolesDisponibles.find(r => r.id_rol === u.id_rol);
        return {
          id_usuario: u.id,
          id_persona: u.id_persona,
          id_rol:     u.id_rol,
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
      contrasena: ''
    });
    setChangingRolFor(null);
  };

  const handleCancel = () => {
    setEditingUser(null);
    setFormData(initialForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgId) return;

    const { nombre, apellido, email, telefono, cedula, sexo, fecha_nacimiento, direccion, rol_id, contrasena } = formData;

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      if (isUpdating) {
        // 1. Actualizar Persona
        const { error: pErr } = await supabase.from('persona')
          .update({ nombre, apellido, telefono, email, cedula, sexo, fecha_nacimiento: fecha_nacimiento || null, direccion })
          .eq('id_persona', editingUser.id_persona);
        if (pErr) throw pErr;

        // 2. Actualizar Usuario (Rol)
        if (parseInt(rol_id) !== editingUser.id_rol) {
          const { error: uErr } = await supabase.from('usuario')
            .update({ id_rol: parseInt(rol_id) })
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
          p_org_id:   orgId
        });

        if (rpcError) throw rpcError;

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
      const { error } = await supabase
        .from('usuario')
        .update({ id_estado: parseInt(newStatusChoice) })
        .eq('id', user.id_usuario);

      if (error) throw error;
      
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
        .update({ id_rol: parseInt(newRolId) })
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
    .filter(u =>
      `${u.nombre} ${u.apellido} ${u.email || ''} ${u.nombre_rol || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
    )
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
            <p className="text-sm text-gray-500 mt-1">Administra cuentas, roles y permisos del sistema.</p>
          </div>
          <button
            onClick={() => navigate('/empleados')}
            className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-2.5 px-5 rounded-lg font-semibold transition text-sm"
          >
            <FaUserTie /> Empleados
          </button>
        </div>

        <div className="flex border-b border-gray-200 mt-5">
          <button className={tabCls('usuarios')} onClick={() => setActiveTab('usuarios')}>
            <FaUsers className="inline mr-2 mb-0.5" size={13} />Cuentas de Usuario
          </button>
          <button className={tabCls('roles')} onClick={() => setActiveTab('roles')}>
            <FaKey className="inline mr-2 mb-0.5" size={13} />Roles y Permisos
          </button>
        </div>
      </header>

      {activeTab === 'usuarios' && (
        <div className={`grid gap-8 ${(canCreate || isUpdating) ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
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
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Rol</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha de Creación</th>
                      <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
                      <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filteredUsers.map(u => (
                      <tr key={u.id_usuario}>
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
                        <td className="px-5 py-3.5 text-right flex justify-end gap-1.5">
                          {canEdit && (
                            <button onClick={() => { setChangingRolFor(u.id_usuario); setNewRolId(u.id_rol.toString()); }} title="Cambiar Rol" className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-50 text-purple-700 font-bold rounded border border-purple-200 hover:bg-purple-100 transition">
                              <FaShieldAlt size={10} /> Rol
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => { setChangingStatusFor(u.id_usuario); setNewStatusChoice(u.id_estado?.toString() || ''); }} title="Cambiar Estado" className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-50 text-green-700 font-bold rounded border border-green-200 hover:bg-green-100 transition">
                              <FaSync size={10} /> Estado
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => handleEdit(u)} title="Editar Usuario" className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-50 text-blue-700 font-bold rounded border border-blue-200 hover:bg-blue-100 transition">
                              <FaEdit size={10} /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(canCreate || isUpdating) && (
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
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full border p-2 rounded text-sm"/>
                </div>
                
                {!isUpdating && <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contraseña *</label>
                  <input type="password" name="contrasena" value={formData.contrasena} onChange={handleChange} required className="w-full border p-2 rounded text-sm"/>
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

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Rol *</label>
                  <select name="rol_id" value={formData.rol_id} onChange={handleChange} required className="w-full border p-2 rounded text-sm bg-white">
                    <option value="">Selecciona un rol</option>
                    {rolesList.filter(r => r.id_rol !== ROL.VISITANTE).map(r => <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>)}
                  </select>
                </div>
                <div className="pt-3 flex justify-end gap-2 border-t mt-2">
                  {isUpdating && <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm bg-gray-100 rounded font-medium">Cancelar</button>}
                  <button type="submit" className="px-5 py-2 text-sm bg-green-600 text-white rounded font-bold shadow">{isUpdating ? 'Guardar' : 'Crear'}</button>
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
    </Layout>
  );
}
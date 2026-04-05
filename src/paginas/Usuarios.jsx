import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import Layout from '../componentes/Layout';
import RolesPermisosManager from '../componentes/RolesPermisosManager';
import { useRbac } from '../contexts/RbacContext';
import {
  FaSearch, FaEdit, FaTrash, FaUserTie, FaUsers,
  FaShieldAlt, FaKey, FaCheck, FaTimes, FaUserCircle
} from 'react-icons/fa';

// ── Badge de rol con color dinámico ──────────────────────────────────────────
function RoleBadge({ roleName }) {
  let cls = 'bg-gray-100 text-gray-700';
  if (!roleName) return null;
  const lower = roleName.toLowerCase();
  if (lower.includes('admin'))       cls = 'bg-red-100 text-red-700';
  else if (lower.includes('oper'))   cls = 'bg-blue-100 text-blue-700';
  else if (lower.includes('técnico') || lower.includes('tecnico')) cls = 'bg-amber-100 text-amber-800';
  else if (lower.includes('superv')) cls = 'bg-purple-100 text-purple-700';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize ${cls}`}>
      <FaShieldAlt size={9} />
      {roleName}
    </span>
  );
}

export default function Usuarios() {
  const { tienePermiso, esAdmin } = useRbac();
  const canCreate = tienePermiso('Módulo Usuarios', 'crear');
  const canEdit   = tienePermiso('Módulo Usuarios', 'editar');
  const canDelete = tienePermiso('Módulo Usuarios', 'eliminar');

  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState('usuarios');
  const [usuarios, setUsuarios]     = useState([]);
  const [rolesList, setRolesList]   = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading]       = useState(false);

  // Estado para edición completa (formulario lateral)
  const [editingUser, setEditingUser] = useState(null); // objeto completo o null
  const initialForm = { nombre: '', apellido: '', email: '', contrasena: '', telefono: '', sexo: 'M', fecha_nacimiento: '', direccion: '', rol_id: '' };
  const [formData, setFormData]     = useState(initialForm);

  // Estado para cambio rápido de rol (inline)
  const [changingRolFor, setChangingRolFor] = useState(null); // id_usuario
  const [newRolId, setNewRolId]             = useState('');

  const isUpdating = !!editingUser;

  useEffect(() => { loadData(); }, []);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [
        { data: rolesData },
        { data: orgUsers, error: orgErr }
      ] = await Promise.all([
        supabase.from('roles').select('*'),
        supabase.rpc('get_usuarios_org')
      ]);

      if (orgErr) {
        console.error('Error get_usuarios_org:', orgErr);
        // Fallback: carga directa si el RPC falla (p.ej. función aún no publicada)
        await loadUsuariosFallback(rolesData || []);
      } else {
        // El RPC devuelve: id_usuario, nombre, apellido, email, nombre_rol, id_rol, tipo_usuario
        const filtrados = (orgUsers || []).filter(u => {
          const rol = u.nombre_rol?.toLowerCase();
          return rol !== 'visitante';
        });
        setUsuarios(filtrados);
      }

      setRolesList(rolesData || []);
    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsuariosFallback = async (rolesDisponibles) => {
    try {
      const { data: usrs } = await supabase.from('usuarios').select('*');
      const { data: pers } = await supabase.from('personas').select('*');
      if (!usrs || !pers) return;

      const lista = usrs.map(u => {
        const persona = pers.find(p => p.id_persona === u.id_persona);
        const rol = rolesDisponibles.find(r => r.Id_Rol === u.rol_id);
        return {
          id_usuario: u.id,
          id_persona: u.id_persona,
          id_rol: u.rol_id,
          nombre: persona?.nombre || 'Sin Nombre',
          apellido: persona?.apellido || '',
          email: persona?.email || '',
          telefono: persona?.telefono || '',
          sexo: persona?.sexo || 'M',
          fecha_nacimiento: persona?.fecha_nacimiento || '',
          direccion: persona?.direccion || '',
          nombre_rol: rol?.Nombre_Rol || 'Sin Rol'
        };
      }).filter(u => u.nombre_rol.toLowerCase() !== 'visitante');

      setUsuarios(lista);
    } catch (err) { console.error('Fallback error:', err); }
  };

  // ── Formulario ────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const val = e.target.name === 'rol_id' ? parseInt(e.target.value) : e.target.value;
    setFormData(prev => ({ ...prev, [e.target.name]: val }));
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email || '',
      telefono: user.telefono || '',
      sexo: user.sexo || 'M',
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
    const { nombre, apellido, email, telefono, sexo, fecha_nacimiento, direccion, rol_id, contrasena } = formData;

    if (!rol_id || !nombre || !apellido) {
      return Swal.fire('Faltan datos', 'Nombre, Apellido y Rol son obligatorios', 'warning');
    }

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      if (isUpdating) {
        // Actualizar persona
        if (editingUser.id_persona) {
          await supabase.from('personas')
            .update({ nombre, apellido, telefono, email, sexo, fecha_nacimiento, direccion })
            .eq('id_persona', editingUser.id_persona);
        }

        // Cambiar rol usando el nuevo RPC seguro
        if (parseInt(rol_id) !== editingUser.id_rol) {
          const { error: rolErr } = await supabase.rpc('cambiar_rol_usuario', {
            p_usuario_id: editingUser.id_usuario,
            p_nuevo_rol: parseInt(rol_id)
          });
          if (rolErr) throw new Error('Error cambiando rol: ' + rolErr.message);
        }

        Swal.fire('Éxito', 'Usuario actualizado correctamente.', 'success');
        handleCancel();
      } else {
        // CREAR nuevo usuario
        if (!email || !contrasena) return Swal.fire('Error', 'Email y contraseña son requeridos para crear un usuario.', 'error');

        // 1. Crear persona
        const { data: personaData, error: pError } = await supabase
          .from('personas')
          .insert([{ nombre, apellido, email, telefono, sexo, fecha_nacimiento: fecha_nacimiento || null, direccion }])
          .select()
          .single();

        if (pError) throw new Error('Error creando perfil: ' + pError.message);

        // 2. Crear auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password: contrasena });

        if (authError) {
          await supabase.from('personas').delete().eq('id_persona', personaData.id_persona);
          throw authError;
        }

        if (authData.user) {
          const { error: uError } = await supabase.from('usuarios').insert([{
            id: authData.user.id,
            id_persona: personaData.id_persona,
            rol_id
          }]);
          if (uError) throw new Error('Error vinculando usuario: ' + uError.message);
        }

        Swal.fire('¡Creado!', 'El usuario fue registrado exitosamente.', 'success');
        handleCancel();
      }

      loadData();
    } catch (error) {
      console.error(error);
      Swal.fire('Error', error.message, 'error');
    }
  };

  // ── Cambio rápido de rol (inline) ─────────────────────────────────────────
  const handleIniciarCambioRol = (user) => {
    setChangingRolFor(user.id_usuario);
    setNewRolId(user.id_rol || '');
    setEditingUser(null); // cerrar formulario lateral si estaba abierto
  };

  const handleConfirmarCambioRol = async (user) => {
    if (!newRolId || parseInt(newRolId) === user.id_rol) {
      setChangingRolFor(null);
      return;
    }

    try {
      Swal.fire({ title: 'Cambiando rol...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      const { error } = await supabase.rpc('cambiar_rol_usuario', {
        p_usuario_id: user.id_usuario,
        p_nuevo_rol: parseInt(newRolId)
      });

      if (error) throw error;

      Swal.fire('¡Listo!', 'El rol fue actualizado correctamente.', 'success');
      setChangingRolFor(null);
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const handleDelete = async (user) => {
    const result = await Swal.fire({
      title: '¿Eliminar acceso?',
      text: 'Se eliminará el acceso del usuario. Sus datos personales se mantendrán en el historial.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar acceso',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      const { error } = await supabase.from('usuarios').delete().eq('id', user.id_usuario);
      if (error) Swal.fire('Error', error.message, 'error');
      else {
        Swal.fire('Eliminado', 'Acceso eliminado correctamente.', 'success');
        loadData();
      }
    }
  };

  const filteredUsers = usuarios.filter(u =>
    `${u.nombre} ${u.apellido} ${u.email || ''} ${u.nombre_rol || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabCls = (tab) =>
    `px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-green-600 text-green-700'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <Layout>
      {/* ── Cabecera ────────────────────────────────────────────────────── */}
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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-5">
          <button className={tabCls('usuarios')} onClick={() => setActiveTab('usuarios')}>
            <FaUsers className="inline mr-2 mb-0.5" size={13} />Cuentas de Usuario
          </button>
          <button className={tabCls('roles')} onClick={() => setActiveTab('roles')}>
            <FaKey className="inline mr-2 mb-0.5" size={13} />Roles y Permisos
          </button>
        </div>
      </header>

      {/* ── Pestaña: Usuarios ────────────────────────────────────────────── */}
      {activeTab === 'usuarios' && (
        <div className={`grid gap-8 ${(canCreate || isUpdating) ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>

          {/* Tabla */}
          <section className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Buscar por nombre, email o rol..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-400" size={14} />
              </div>
              <span className="text-xs text-gray-400 font-medium shrink-0">{filteredUsers.length} usuarios</span>
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
                      <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="text-center py-12 text-gray-400 italic">
                          No se encontraron usuarios.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id_usuario} className="hover:bg-gray-50 transition-colors">
                          {/* Columna: Usuario */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0 font-bold text-sm">
                                {(u.nombre?.[0] || '?').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{u.nombre} {u.apellido}</p>
                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Columna: Rol */}
                          <td className="px-5 py-3.5">
                            {changingRolFor === u.id_usuario ? (
                              <div className="flex items-center gap-2">
                                <select
                                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-green-300 outline-none"
                                  value={newRolId}
                                  onChange={e => setNewRolId(e.target.value)}
                                  autoFocus
                                >
                                  <option value="">-- Seleccionar --</option>
                                  {rolesList
                                    .filter(r => r.Nombre_Rol.toLowerCase() !== 'visitante')
                                    .map(r => (
                                      <option key={r.Id_Rol} value={r.Id_Rol}>{r.Nombre_Rol}</option>
                                    ))
                                  }
                                </select>
                                <button
                                  onClick={() => handleConfirmarCambioRol(u)}
                                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                                  title="Confirmar"
                                >
                                  <FaCheck size={10} />
                                </button>
                                <button
                                  onClick={() => setChangingRolFor(null)}
                                  className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition"
                                  title="Cancelar"
                                >
                                  <FaTimes size={10} />
                                </button>
                              </div>
                            ) : (
                              <RoleBadge roleName={u.nombre_rol} />
                            )}
                          </td>

                          {/* Columna: Acciones */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Cambio rápido de rol */}
                              {canEdit && esAdmin && changingRolFor !== u.id_usuario && (
                                <button
                                  onClick={() => handleIniciarCambioRol(u)}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-semibold transition"
                                  title="Cambiar Rol"
                                >
                                  <FaShieldAlt size={10} /> Rol
                                </button>
                              )}
                              {/* Edición completa */}
                              {canEdit && (
                                <button
                                  onClick={() => handleEdit(u)}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold transition"
                                  title="Editar"
                                >
                                  <FaEdit size={10} /> Editar
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(u)}
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 border border-red-100 transition"
                                  title="Eliminar acceso"
                                >
                                  <FaTrash size={11} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Formulario lateral */}
          {(canCreate || isUpdating) && (
            <section className="lg:col-span-1 bg-white border border-gray-100 rounded-xl shadow-sm p-6 h-fit sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                <FaUserCircle className="text-green-600" />
                {isUpdating ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <form className="space-y-3" onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Nombre *</label>
                    <input placeholder="Nombre" name="nombre" value={formData.nombre} onChange={handleChange} required
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Apellido *</label>
                    <input placeholder="Apellido" name="apellido" value={formData.apellido} onChange={handleChange} required
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                  </div>
                </div>

                {!isUpdating && <>
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Email *</label>
                    <input placeholder="correo@ejemplo.com" type="email" name="email" value={formData.email} onChange={handleChange} required
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Contraseña *</label>
                    <input placeholder="Mín. 6 caracteres" type="password" name="contrasena" value={formData.contrasena} onChange={handleChange} required
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                  </div>
                </>}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Teléfono</label>
                    <input placeholder="0987654321" name="telefono" value={formData.telefono} onChange={handleChange}
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 ml-0.5 font-medium">Sexo</label>
                    <select name="sexo" value={formData.sexo} onChange={handleChange}
                      className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5">
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 ml-0.5 font-medium">Fecha de Nacimiento</label>
                  <input type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento} onChange={handleChange}
                    className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5" />
                </div>

                <div>
                  <label className="text-xs text-gray-500 ml-0.5 font-medium">Dirección</label>
                  <textarea placeholder="Dirección..." name="direccion" value={formData.direccion} onChange={handleChange}
                    className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5 h-16 resize-none" />
                </div>

                <div>
                  <label className="text-xs text-gray-500 ml-0.5 font-medium">Rol *</label>
                  <select name="rol_id" value={formData.rol_id} onChange={handleChange} required
                    className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-green-300 outline-none mt-0.5">
                    <option value="">Selecciona un rol</option>
                    {rolesList
                      .filter(r => r.Nombre_Rol.toLowerCase() !== 'visitante')
                      .map(r => <option key={r.Id_Rol} value={r.Id_Rol}>{r.Nombre_Rol}</option>)
                    }
                  </select>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-gray-100 mt-2">
                  {isUpdating && (
                    <button type="button" onClick={handleCancel}
                      className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition">
                      Cancelar
                    </button>
                  )}
                  <button type="submit"
                    className="px-5 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow transition">
                    {isUpdating ? 'Guardar Cambios' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}

      {/* ── Pestaña: Roles y Permisos ────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <RolesPermisosManager />
        </div>
      )}
    </Layout>
  );
}
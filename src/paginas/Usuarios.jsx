

/*

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- AGREGADO: Para navegar
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaPlus, FaUserTie } from 'react-icons/fa'; // <--- AGREGADO: FaUserTie

export default function Usuarios() {
  const navigate = useNavigate(); // <--- AGREGADO: Inicializar navegación
  const [usuarios, setUsuarios] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null); 
  const [roles, setRoles] = useState([]);
  
  const initialFormState = { 
    Nombre: '', 
    Apellido: '', 
    Email: '', 
    Contrasena_Input: '', 
    Telefono: '', 
    Id_Rol: '' 
  };
  const [formData, setFormData] = useState(initialFormState);
  const isUpdating = !!editingUser;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: rolesData } = await supabase.from('ROL').select('Id_Rol, Nombre_Rol');
    setRoles(rolesData || []);
    await loadUsuarios();
  };

  const loadUsuarios = async () => {
    
    const { data, error } = await supabase
      .from('USUARIO')
      .select(`
        Id_Usuario, 
        Nombre, 
        Apellido, 
        Telefono, 
        Id_Rol, 
        ROL (Nombre_Rol)
      `);
    
    if (error) {
        console.error("Error cargando usuarios:", error.message);
        return;
    }

    const usuariosFormateados = (data || []).map(u => ({
        ...u,
        Nombre_Rol: u.ROL ? u.ROL.Nombre_Rol : 'Sin Rol'
    }));

    setUsuarios(usuariosFormateados);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'Id_Rol' ? parseInt(value) : value,
    }));
  };

  const handleEdit = (user) => {
    setEditingUser(user.Id_Usuario);
    setFormData({
      ...initialFormState,
      Nombre: user.Nombre,
      Apellido: user.Apellido,
      Telefono: user.Telefono || '',
      Id_Rol: user.Id_Rol,
      Email: '', 
      Contrasena_Input: ''
    });
  };

  const handleNew = () => {
    setEditingUser(null);
    setFormData({ 
      ...initialFormState, 
      // Selecciona por defecto un rol, pero aseguramos que no sea empleado si es el primero
      Id_Rol: roles.length > 0 ? roles[0].Id_Rol : '' 
    });
  };

  const handleCancel = () => {
    setEditingUser(null);
    setFormData(initialFormState);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const { Nombre, Apellido, Email, Telefono, Id_Rol, Contrasena_Input } = formData;
    
    if (!Id_Rol || !Nombre) {
        alert("Nombre y Rol son obligatorios.");
        return;
    }

    try {
        if (isUpdating) {
            
            const { error } = await supabase
                .from('USUARIO')
                .update({ Nombre, Apellido, Telefono, Id_Rol })
                .eq('Id_Usuario', editingUser);

            if (error) throw error;
            alert("Usuario actualizado correctamente.");

        } else {
            
            if (!Email || !Contrasena_Input) {
                alert("Email y Contraseña son obligatorios.");
                return;
            }
            
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: Email,
                password: Contrasena_Input,
            });

            if (authError) throw authError;
            
            if (authData.user) {
                
                const { error: dbError } = await supabase
                    .from('USUARIO')
                    .upsert({ 
                        Id_Usuario: authData.user.id, 
                        Nombre,
                        Apellido,
                        Telefono,
                        Id_Rol
                    });

                if (dbError) throw dbError;
                alert("Usuario creado/sincronizado exitosamente.");
            }
        }

        handleCancel();
        loadUsuarios(); 

    } catch (error) {
        console.error("Error:", error);
        alert(`Ocurrió un error: ${error.message}`);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm('¿Eliminar perfil público? (El acceso Auth podría permanecer)')) {
      const { error } = await supabase.from('USUARIO').delete().eq('Id_Usuario', userId);
      if (error) alert('Error al eliminar: ' + error.message);
      else {
          alert('Usuario eliminado.');
          loadUsuarios();
      }
    }
  };
  
  const filteredUsers = usuarios.filter(user =>
    user.Nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.Apellido.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const RoleBadge = ({ roleName }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize "
    switch (roleName?.toLowerCase()) {
      case 'administrador': classes += 'bg-blue-100 text-blue-800'; break;
      case 'gerente': classes += 'bg-green-100 text-green-800'; break;
      default: classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{roleName}</span>;
  };

  const getFormTitle = () => isUpdating ? "Actualizar Usuario" : "Crear Nuevo Usuario";
  const getButtonLabel = () => isUpdating ? "Guardar Cambios" : "Crear Usuario";

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h2>
          <p className="text-gray-500">Ver, agregar, editar y monitorear usuarios</p>
        </div>
        
        <div className="flex gap-3">
             
            <button 
                onClick={() => navigate('/empleados')}
                className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-3 px-6 rounded-lg font-semibold transition duration-150"
            >
                <FaUserTie /> Gestionar Empleados
            </button>

            <button 
                className="flex items-center gap-2 bg-primary hover:bg-uce-dark text-white py-3 px-6 rounded-lg font-semibold shadow-md transition duration-150"
                onClick={handleNew}
            >
                <FaPlus />
                Agregar Nuevo Usuario
            </button>
        </div>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <section className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Todos los Usuarios</h3>
          <div className="relative mb-6">
            <input type="text" placeholder="Buscar por nombre..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usuarios.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No se encontraron usuarios o están ocultos por seguridad.</td></tr>
                ) : (
                    filteredUsers.map(u => (
                    <tr key={u.Id_Usuario} className="hover:bg-gray-50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.Nombre} {u.Apellido}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.Telefono || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><RoleBadge roleName={u.Nombre_Rol} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                        <button className="text-gray-600 hover:text-blue-600 transition duration-150" title="Editar" onClick={() => handleEdit(u)}><FaEdit /></button>
                        <button className="text-gray-600 hover:text-red-600 transition duration-150" title="Eliminar" onClick={() => handleDelete(u.Id_Usuario)}><FaTrash /></button>
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        
        <section className="lg:col-span-1 bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">{getFormTitle()}</h3>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input type="text" name="Nombre" value={formData.Nombre} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
              <input type="text" name="Apellido" value={formData.Apellido} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            
            
            {!isUpdating && (
                <>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico (Login)</label>
                <input type="email" name="Email" value={formData.Email} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input type="password" name="Contrasena_Input" value={formData.Contrasena_Input} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
                </div>
                </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="text" name="Telefono" value={formData.Telefono} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select name="Id_Rol" value={formData.Id_Rol || ''} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary">
                <option value="" disabled>Seleccione un Rol</option>
                {roles
                    .filter(rol => rol.Nombre_Rol.toLowerCase() !== 'empleado') // <-- AQUÍ QUITAMOS EL ROL EMPLEADO
                    .map(rol => (<option key={rol.Id_Rol} value={rol.Id_Rol}>{rol.Nombre_Rol}</option>))
                }
              </select>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              {(isUpdating || formData.Nombre) && (
                  <button type="button" onClick={handleCancel} className="py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100 transition duration-150">Cancelar</button>
              )}
              <button type="submit" className="py-2 px-4 rounded-lg bg-primary hover:bg-uce-dark text-white font-semibold transition duration-150">{getButtonLabel()}</button>
            </div>
          </form>
        </section>
      </div>
    </Layout>
  );
}

*/

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaUserTie } from 'react-icons/fa'; // Se quitó FaPlus ya no se usa

export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null); 
  const [roles, setRoles] = useState([]);
  
  const initialFormState = { 
    Nombre: '', 
    Apellido: '', 
    Email: '', 
    Contrasena_Input: '', 
    Telefono: '', 
    Id_Rol: '' 
  };
  const [formData, setFormData] = useState(initialFormState);
  const isUpdating = !!editingUser;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: rolesData } = await supabase.from('ROL').select('Id_Rol, Nombre_Rol');
    setRoles(rolesData || []);
    await loadUsuarios();
  };

  const loadUsuarios = async () => {
    const { data, error } = await supabase
      .from('USUARIO')
      .select(`
        Id_Usuario, 
        Nombre, 
        Apellido, 
        Telefono, 
        Id_Rol, 
        ROL (Nombre_Rol)
      `);
    
    if (error) {
        console.error("Error cargando usuarios:", error.message);
        return;
    }

    const usuariosFormateados = (data || []).map(u => ({
        ...u,
        Nombre_Rol: u.ROL ? u.ROL.Nombre_Rol : 'Sin Rol'
    }));

    setUsuarios(usuariosFormateados);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'Id_Rol' ? parseInt(value) : value,
    }));
  };

  const handleEdit = (user) => {
    setEditingUser(user.Id_Usuario);
    setFormData({
      ...initialFormState,
      Nombre: user.Nombre,
      Apellido: user.Apellido,
      Telefono: user.Telefono || '',
      Id_Rol: user.Id_Rol,
      Email: '', 
      Contrasena_Input: ''
    });
  };

  // Esta función se mantiene por si quieres usarla internamente, 
  // pero ya no está atada al botón del header.
  const handleNew = () => {
    setEditingUser(null);
    setFormData({ 
      ...initialFormState, 
      Id_Rol: roles.length > 0 ? roles[0].Id_Rol : '' 
    });
  };

  const handleCancel = () => {
    setEditingUser(null);
    setFormData(initialFormState);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const { Nombre, Apellido, Email, Telefono, Id_Rol, Contrasena_Input } = formData;
    
    if (!Id_Rol || !Nombre) {
        alert("Nombre y Rol son obligatorios.");
        return;
    }

    try {
        if (isUpdating) {
            // ACTUALIZAR USUARIO
            const { error } = await supabase
                .from('USUARIO')
                .update({ Nombre, Apellido, Telefono, Id_Rol })
                .eq('Id_Usuario', editingUser);

            if (error) throw error;
            alert("Usuario actualizado correctamente.");

        } else {
            // CREAR USUARIO
            if (!Email || !Contrasena_Input) {
                alert("Email y Contraseña son obligatorios.");
                return;
            }
            
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: Email,
                password: Contrasena_Input,
            });

            if (authError) throw authError;
            
            if (authData.user) {
                const { error: dbError } = await supabase
                    .from('USUARIO')
                    .upsert({ 
                        Id_Usuario: authData.user.id, 
                        Nombre,
                        Apellido,
                        Telefono,
                        Id_Rol
                    });

                if (dbError) throw dbError;
                alert("Usuario creado/sincronizado exitosamente.");
            }
        }

        handleCancel();
        loadUsuarios(); 

    } catch (error) {
        console.error("Error:", error);
        alert(`Ocurrió un error: ${error.message}`);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm('¿Eliminar perfil público? (El acceso Auth podría permanecer)')) {
      const { error } = await supabase.from('USUARIO').delete().eq('Id_Usuario', userId);
      if (error) alert('Error al eliminar: ' + error.message);
      else {
          alert('Usuario eliminado.');
          loadUsuarios();
      }
    }
  };
  
  const filteredUsers = usuarios.filter(user =>
    user.Nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.Apellido.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const RoleBadge = ({ roleName }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize "
    switch (roleName?.toLowerCase()) {
      case 'administrador': classes += 'bg-blue-100 text-blue-800'; break;
      case 'gerente': classes += 'bg-green-100 text-green-800'; break;
      default: classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{roleName}</span>;
  };

  const getFormTitle = () => isUpdating ? "Actualizar Usuario" : "Crear Nuevo Usuario";
  const getButtonLabel = () => isUpdating ? "Guardar Cambios" : "Crear Usuario";

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h2>
          <p className="text-gray-500">Ver, agregar, editar y monitorear usuarios</p>
        </div>
        
        <div className="flex gap-3">
             {/* BOTÓN ÚNICO: IR A EMPLEADOS */}
            <button 
                onClick={() => navigate('/empleados')}
                className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-3 px-6 rounded-lg font-semibold transition duration-150"
            >
                <FaUserTie /> Gestionar Empleados
            </button>
            
            {/* EL BOTÓN DE AGREGAR USUARIO FUE ELIMINADO DE AQUÍ */}
        </div>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LISTA IZQUIERDA */}
        <section className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Todos los Usuarios</h3>
          <div className="relative mb-6">
            <input type="text" placeholder="Buscar por nombre..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usuarios.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No se encontraron usuarios o están ocultos por seguridad.</td></tr>
                ) : (
                    filteredUsers.map(u => (
                    <tr key={u.Id_Usuario} className="hover:bg-gray-50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.Nombre} {u.Apellido}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.Telefono || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><RoleBadge roleName={u.Nombre_Rol} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                        <button className="text-gray-600 hover:text-blue-600 transition duration-150" title="Editar" onClick={() => handleEdit(u)}><FaEdit /></button>
                        <button className="text-gray-600 hover:text-red-600 transition duration-150" title="Eliminar" onClick={() => handleDelete(u.Id_Usuario)}><FaTrash /></button>
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* FORMULARIO DERECHA */}
        <section className="lg:col-span-1 bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">{getFormTitle()}</h3>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input type="text" name="Nombre" value={formData.Nombre} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
              <input type="text" name="Apellido" value={formData.Apellido} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            
            {!isUpdating && (
                <>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico (Login)</label>
                <input type="email" name="Email" value={formData.Email} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input type="password" name="Contrasena_Input" value={formData.Contrasena_Input} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
                </div>
                </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="text" name="Telefono" value={formData.Telefono} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary" />
            </div>
            
            {/* SELECTOR DE ROL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select name="Id_Rol" value={formData.Id_Rol || ''} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary">
                <option value="" disabled>Seleccione un Rol</option>
                {roles
                    .filter(rol => rol.Nombre_Rol.toLowerCase() !== 'empleado') 
                    .map(rol => (<option key={rol.Id_Rol} value={rol.Id_Rol}>{rol.Nombre_Rol}</option>))
                }
              </select>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              {(isUpdating || formData.Nombre) && (
                  <button type="button" onClick={handleCancel} className="py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100 transition duration-150">Cancelar</button>
              )}
              <button type="submit" className="py-2 px-4 rounded-lg bg-primary hover:bg-uce-dark text-white font-semibold transition duration-150">{getButtonLabel()}</button>
            </div>
          </form>
        </section>
      </div>
    </Layout>
  );
}
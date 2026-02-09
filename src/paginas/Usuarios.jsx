

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2'; 
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaUserTie } from 'react-icons/fa';

export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingUserId, setEditingUserId] = useState(null); 
  const [editingPersonaId, setEditingPersonaId] = useState(null); 
  const [rolesList, setRolesList] = useState([]);

  
  const initialFormState = {
    nombre: '',       
    apellido: '',     
    email: '',        
    contrasena: '',   
    telefono: '',
    sexo: 'M',             
    fecha_nacimiento: '',  
    direccion: '',         
    rol_id: ''        
  };
  const [formData, setFormData] = useState(initialFormState);
  const isUpdating = !!editingUserId;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
        const { data: rolesData } = await supabase.from('roles').select('*');
        setRolesList(rolesData || []);
        await loadUsuarios(rolesData || []);
    } catch (error) { console.error(error); }
  };

  const loadUsuarios = async (rolesDisponibles) => {
    try {
      const rolesUso = rolesDisponibles || rolesList;
      
      const { data: usrs } = await supabase.from('usuarios').select('*');
      const { data: pers } = await supabase.from('personas').select('*');
      
      if (!usrs || !pers) return;

      const listaCompleta = usrs.map(u => {
          const persona = pers.find(p => p.id === u.persona_id);
          const rol = rolesUso.find(r => r.Id_Rol === u.rol_id);
          
          return {
              id_usuario: u.id,
              id_persona: u.persona_id,
              rol_id: u.rol_id,
              nombre: persona?.nombre || 'Sin Nombre',
              apellido: persona?.apellido || '',
              email: persona?.email || '',
              telefono: persona?.telefono || '',
              sexo: persona?.sexo || 'M',
              fecha_nacimiento: persona?.fecha_nacimiento || '',
              direccion: persona?.direccion || '',
              nombre_rol: rol?.Nombre_Rol || 'Sin Rol'
          };
      });

     
      const usuariosFiltrados = listaCompleta.filter(u => 
        ['usuario regular', 'visitante'].includes(u.nombre_rol.toLowerCase())
      );
  
      setUsuarios(usuariosFiltrados);

    } catch (err) { console.error("Error loading:", err); }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.name === 'rol_id' ? parseInt(e.target.value) : e.target.value });
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id_usuario);
    setEditingPersonaId(user.id_persona);
    
    setFormData({
      nombre: user.nombre, 
      apellido: user.apellido, 
      email: user.email, 
      telefono: user.telefono,
      sexo: user.sexo,
      fecha_nacimiento: user.fecha_nacimiento,
      direccion: user.direccion,
      rol_id: user.rol_id, 
      contrasena: '' 
    });
  };

  const handleCancel = () => {
    setEditingUserId(null); setEditingPersonaId(null); setFormData(initialFormState);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { nombre, apellido, email, telefono, sexo, fecha_nacimiento, direccion, rol_id, contrasena } = formData;
    
    if (!rol_id || !nombre || !apellido) {
        Swal.fire('Faltan datos', 'Nombre, Apellido y Rol son obligatorios', 'warning');
        return;
    }

    try {
        Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

        if (isUpdating) {
          
            await supabase.from('personas')
                .update({ nombre, apellido, telefono, email, sexo, fecha_nacimiento, direccion })
                .eq('id', editingPersonaId);
            
            await supabase.from('usuarios').update({ rol_id }).eq('id', editingUserId);
            Swal.fire('Éxito', 'Usuario actualizado', 'success');
        } else {
           
            if (!email || !contrasena) return Swal.fire('Error', 'Faltan credenciales', 'error');
            
            //Crear Persona
            const { data: personaData, error: pError } = await supabase
                .from('personas')
                .insert([{ 
                    nombre, 
                    apellido, 
                    email, 
                    telefono,
                    sexo,
                    fecha_nacimiento: fecha_nacimiento || null,
                    direccion
                }])
                .select()
                .single();

            if (pError) throw new Error("Error creando Persona: " + pError.message);

            // Crear Auth User
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email, password: contrasena
            });

            if (authError) {
                await supabase.from('personas').delete().eq('id', personaData.id);
                throw authError;
            }

            if (authData.user) {
                
                const { error: uError } = await supabase
                    .from('usuarios')
                    .insert([{ 
                        id: authData.user.id, 
                        persona_id: personaData.id, 
                        rol_id 
                    }]);

                if (uError) throw new Error("Error vinculando usuario: " + uError.message);
                
                Swal.fire('Creado', 'Usuario registrado exitosamente', 'success');
            }
        }
        handleCancel();
        loadUsuarios(rolesList);
    } catch (error) {
        console.error("Error:", error);
        Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (user) => {
    const result = await Swal.fire({
        title: '¿Eliminar acceso?',
        text: "Se eliminará el acceso del usuario, pero sus datos personales se mantendrán para el historial.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar acceso'
    });

    if (result.isConfirmed) {
      const { error } = await supabase.from('usuarios').delete().eq('id', user.id_usuario);
      
      if (error) Swal.fire('Error', error.message, 'error');
      else {
          Swal.fire('Eliminado', 'Acceso eliminado.', 'success');
          loadUsuarios(rolesList);
      }
    }
  };
  
  const filteredUsers = usuarios.filter(u => (u.nombre + ' ' + u.apellido).toLowerCase().includes(searchTerm.toLowerCase()));
  
  const RoleBadge = ({ roleName }) => {
    let color = 'bg-gray-100 text-gray-800';
    if (roleName?.toLowerCase().includes('visitante')) color = 'bg-yellow-100 text-yellow-800';
    if (roleName?.toLowerCase().includes('regular')) color = 'bg-blue-100 text-blue-800';
    return <span className={`px-3 py-1 text-xs font-semibold rounded-full capitalize ${color}`}>{roleName}</span>;
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h2>
        <button onClick={() => navigate('/empleados')} className="flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-3 px-6 rounded-lg font-semibold transition">
            <FaUserTie /> Gestionar Empleados
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
          <div className="relative mb-6">
            <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 border rounded-lg" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead><tr className="bg-gray-50"><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Teléfono</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Rol</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Acciones</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-8 text-gray-500">No se encontraron usuarios externos.</td></tr>
                ) : (
                    filteredUsers.map(u => (
                    <tr key={u.id_usuario} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.nombre} {u.apellido}<div className="text-xs text-gray-400 font-normal">{u.email}</div></td>
                        <td className="px-6 py-4 text-sm text-gray-500">{u.telefono}</td>
                        <td className="px-6 py-4 text-sm"><RoleBadge roleName={u.nombre_rol} /></td>
                        <td className="px-6 py-4 text-sm flex gap-3">
                        <button onClick={() => handleEdit(u)} className="text-blue-600"><FaEdit /></button>
                        <button onClick={() => handleDelete(u)} className="text-red-600"><FaTrash /></button>
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-1 bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner h-fit sticky top-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6">{isUpdating ? "Editar Usuario" : "Nuevo Usuario"}</h3>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nombre" name="nombre" value={formData.nombre} onChange={handleChange} required className="w-full border p-2 rounded" />
                <input placeholder="Apellido" name="apellido" value={formData.apellido} onChange={handleChange} required className="w-full border p-2 rounded" />
            </div>

            {!isUpdating && <>
                <input placeholder="Email" type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full border p-2 rounded" />
                <input placeholder="Contraseña" type="password" name="contrasena" value={formData.contrasena} onChange={handleChange} required className="w-full border p-2 rounded" />
            </>}
            
            <div className="grid grid-cols-2 gap-2">
                <input placeholder="Teléfono" name="telefono" value={formData.telefono} onChange={handleChange} className="w-full border p-2 rounded" />
                <select name="sexo" value={formData.sexo} onChange={handleChange} className="w-full border p-2 rounded">
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                </select>
            </div>

            <div>
                <label className="text-xs text-gray-500 ml-1">Fecha de Nacimiento</label>
                <input type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento} onChange={handleChange} className="w-full border p-2 rounded" />
            </div>

            <textarea placeholder="Dirección" name="direccion" value={formData.direccion} onChange={handleChange} className="w-full border p-2 rounded h-20 resize-none" />

            <select name="rol_id" value={formData.rol_id} onChange={handleChange} required className="w-full border p-2 rounded">
                <option value="">Seleccione Rol</option>
                
                {rolesList
                    .filter(r => ['usuario regular', 'visitante'].includes(r.Nombre_Rol.toLowerCase()))
                    .map(r => <option key={r.Id_Rol} value={r.Id_Rol}>{r.Nombre_Rol}</option>)
                }
            </select>
            
            <div className="pt-4 flex justify-end gap-2">
              {isUpdating && <button type="button" onClick={handleCancel} className="px-4 py-2 text-gray-600">Cancelar</button>}
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded shadow">{isUpdating ? "Guardar" : "Crear"}</button>
            </div>
          </form>
        </section>
      </div>
    </Layout>
  );
}


import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import { FaParking, FaEnvelope, FaLock, FaUser, FaPhone, FaBuilding, FaUserTie, FaSitemap, FaMapMarkerAlt, FaCalendarAlt, FaVenusMars } from 'react-icons/fa';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  
  
  const [roles, setRoles] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [organizaciones, setOrganizaciones] = useState([]);

  // formulario
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nombre: '',
    apellido: '',
    telefono: '',
    sexo: 'M',             
    fecha_nacimiento: '',  
    direccion: '',         
    rol_id: '',
    departamento_id: '',
    organizacion_id: ''
  });

  useEffect(() => {
    if (isRegistering) {
        loadCatalogs();
    }
  }, [isRegistering]);

  const loadCatalogs = async () => {
    try {
        const { data: rData } = await supabase.from('roles').select('*');
        const { data: dData } = await supabase.from('departamentos').select('*');
        const { data: oData } = await supabase.from('organizaciones').select('*');

        const rolesPermitidos = (rData || []).filter(r => 
            ['administrador', 'empleado'].includes(r.Nombre_Rol.toLowerCase())
        );

        setRoles(rolesPermitidos);
        setDepartamentos(dData || []);
        setOrganizaciones(oData || []);
    } catch (error) {
        console.error("Error cargando catálogos", error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.name === 'rol_id' ? parseInt(e.target.value) : e.target.value });
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { email, password, nombre, apellido, telefono, sexo, fecha_nacimiento, direccion, rol_id, departamento_id, organizacion_id } = formData;

    try {
      if (isRegistering) {
        //registro
        if (!nombre || !apellido || !telefono || !rol_id || !departamento_id || !organizacion_id || !fecha_nacimiento) {
            throw new Error("Por favor completa todos los campos obligatorios (*).");
        }

        // Crear en Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) throw authError;

        if (authData.user) {
            
            const { data: personaData, error: pError } = await supabase
                .from('personas')
                .insert([{ 
                    nombre, 
                    apellido, 
                    telefono, 
                    email, 
                    sexo, 
                    fecha_nacimiento, 
                    direccion 
                }])
                .select()
                .single();

            if (pError) throw new Error("Error guardando datos personales: " + pError.message);

            // Crear Usuario
            const { error: uError } = await supabase
                .from('usuarios')
                .insert([{
                    id: authData.user.id,
                    persona_id: personaData.id,
                    rol_id: parseInt(rol_id)
                }]);

            if (uError) throw new Error("Error creando acceso: " + uError.message);

           
            const { error: eError } = await supabase
                .from('empleados')
                .insert([{
                    persona_id: personaData.id,
                    rol_id: parseInt(rol_id),
                    departamento_id: parseInt(departamento_id),
                    organizacion_id: parseInt(organizacion_id)
                }]);

            if (eError) throw new Error("Error creando ficha de empleado: " + eError.message);

            Swal.fire({
                title: '¡Registro Exitoso!',
                text: 'Cuenta creada correctamente.',
                icon: 'success',
                confirmButtonColor: '#16a34a' 
            }).then(() => {
                setIsRegistering(false);
                setFormData({ ...formData, password: '' });
            });
        }

      } else {
        
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        
        if (data.user) {
            const { data: usuarioValido } = await supabase
                .from('usuarios')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle();

            if (!usuarioValido) {
                await supabase.auth.signOut(); 
                throw new Error("Acceso denegado: Este usuario no tiene un perfil activo.");
            }
        }
      }
    } catch (error) {
      Swal.fire({
          title: 'Error',
          text: error.message || error.error_description,
          icon: 'error',
          confirmButtonColor: '#d33'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full border border-gray-100 transition-all duration-300 ${isRegistering ? 'max-w-2xl' : 'max-w-md'}`}>
        
        <div className="text-center p-8 pb-4">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaParking className="text-4xl text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800">UCE PARKING</h2>
          <p className="text-gray-500 mt-2">
            {isRegistering ? 'Registro de Personal' : 'Acceso al Sistema'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="p-8 pt-0 space-y-4">
          
          {isRegistering && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div className="md:col-span-2 text-xs font-bold text-gray-400 uppercase border-b pb-1 mb-2">Información Personal</div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <div className="relative">
                        <FaUser className="absolute left-3 top-3 text-gray-400 text-xs" />
                        <input type="text" name="nombre" required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500 focus:border-green-500" placeholder="Nombre" value={formData.nombre} onChange={handleChange} />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
                    <input type="text" name="apellido" required={isRegistering} className="w-full px-3 py-2 border rounded-lg focus:ring-green-500 focus:border-green-500" placeholder="Apellido" value={formData.apellido} onChange={handleChange} />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                    <div className="relative">
                        <FaPhone className="absolute left-3 top-3 text-gray-400 text-xs" />
                        <input type="tel" name="telefono" required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500 focus:border-green-500" placeholder="809-..." value={formData.telefono} onChange={handleChange} />
                    </div>
                </div>

                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sexo</label>
                    <div className="relative">
                        <FaVenusMars className="absolute left-3 top-3 text-gray-400 text-xs" />
                        <select name="sexo" value={formData.sexo} onChange={handleChange} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500">
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                </div>

               
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Nacimiento *</label>
                    <div className="relative">
                        <FaCalendarAlt className="absolute left-3 top-3 text-gray-400 text-xs" />
                        <input type="date" name="fecha_nacimiento" required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500" value={formData.fecha_nacimiento} onChange={handleChange} />
                    </div>
                </div>

                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <div className="relative">
                        <FaMapMarkerAlt className="absolute left-3 top-3 text-gray-400 text-xs" />
                        <input type="text" name="direccion" className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500" placeholder="Calle, Sector..." value={formData.direccion} onChange={handleChange} />
                    </div>
                </div>

                <div className="md:col-span-2 text-xs font-bold text-gray-400 uppercase border-b pb-1 mt-4 mb-2">Información Laboral</div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                    <div className="relative">
                        <FaUserTie className="absolute left-3 top-3 text-gray-400" />
                        <select name="rol_id" value={formData.rol_id} onChange={handleChange} required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500">
                            <option value="">Seleccione Rol</option>
                            {roles.map(r => <option key={r.Id_Rol} value={r.Id_Rol}>{r.Nombre_Rol}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <div className="relative">
                        <FaSitemap className="absolute left-3 top-3 text-gray-400" />
                        <select name="departamento_id" value={formData.departamento_id} onChange={handleChange} required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500">
                            <option value="">Seleccione Depto</option>
                            {departamentos.map(d => <option key={d.Id_Departamento} value={d.Id_Departamento}>{d.Nombre_Departamento}</option>)}
                        </select>
                    </div>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Organización *</label>
                    <div className="relative">
                        <FaBuilding className="absolute left-3 top-3 text-gray-400" />
                        <select name="organizacion_id" value={formData.organizacion_id} onChange={handleChange} required={isRegistering} className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-green-500">
                            <option value="">Seleccione Organización</option>
                            {organizaciones.map(o => <option key={o.Id_Organizacion} value={o.Id_Organizacion}>{o.Nombre_Organizacion}</option>)}
                        </select>
                    </div>
                </div>
            </div>
          )}

          <div className={isRegistering ? "mt-4 border-t pt-4" : ""}>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico *</label>
                <div className="relative">
                <FaEnvelope className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="email"
                    name="email"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="usuario@uce.edu.do"
                    value={formData.email}
                    onChange={handleChange}
                />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                <div className="relative">
                <FaLock className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="password"
                    name="password"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                />
                </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-200 flex justify-center items-center mt-6"
          >
            {loading ? 'Procesando...' : isRegistering ? 'Registrar Personal' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="p-6 text-center border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-sm text-gray-600">
            {isRegistering ? '¿Ya tienes cuenta?' : '¿Eres nuevo empleado?'}
            <button
              onClick={() => {
                  setIsRegistering(!isRegistering);
                  setFormData({ ...formData, email: '', password: '' }); 
              }}
              className="ml-2 font-semibold text-green-600 hover:text-green-800 hover:underline"
            >
              {isRegistering ? 'Inicia Sesión aquí' : 'Regístrate aquí'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
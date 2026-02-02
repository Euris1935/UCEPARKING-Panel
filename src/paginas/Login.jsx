

import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { FaParking, FaEnvelope, FaLock, FaUser, FaPhone } from 'react-icons/fa';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Estados para los campos
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRegistering) {
        // ==========================================
        // 1. REGISTRO DE ADMINISTRADOR
        // ==========================================
        
        if (!nombre || !apellido || !telefono) {
            alert("Por favor completa Nombre, Apellido y Teléfono.");
            setLoading(false);
            return;
        }

        // A. Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) throw authError;

        if (authData.user) {
            // B. Guardar perfil en tabla pública USUARIO
            const { error: dbError } = await supabase
                .from('USUARIO')
                .upsert({
                    Id_Usuario: authData.user.id,
                    Nombre: nombre,
                    Apellido: apellido,
                    Telefono: telefono,
                    Id_Rol: 3, // <--- CAMBIO: 3 es ADMINISTRADOR según tu indicación
                    // Fecha_Creacion se llena automático con Default Now()
                });

            if (dbError) {
                console.error("Error guardando perfil:", dbError);
                alert("Usuario creado, pero hubo error al guardar datos del perfil.");
            } else {
                alert('¡Administrador registrado con éxito!');
                setIsRegistering(false); // Volver al login
            }
        }

      } else {
        // ==========================================
        // 2. INICIO DE SESIÓN
        // ==========================================
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // App.js redirige automáticamente al Dashboard
      }
    } catch (error) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-uce-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-gray-100">
        
        <div className="text-center mb-8">
          <div className="bg-uce/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaParking className="text-4xl text-uce" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800">UCE PARKING</h2>
          <p className="text-gray-500 mt-2">
            {isRegistering ? 'Registro de Nuevo Administrador' : 'Acceso Administrativo'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* CAMPOS EXTRA SOLO PARA REGISTRO */}
          {isRegistering && (
            <>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FaUser className="text-gray-400 text-xs" />
                            </div>
                            <input
                                type="text"
                                required={isRegistering}
                                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-uce focus:border-uce"
                                placeholder="Nombre"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                        <input
                            type="text"
                            required={isRegistering}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-uce focus:border-uce"
                            placeholder="Apellido"
                            value={apellido}
                            onChange={(e) => setApellido(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FaPhone className="text-gray-400 text-xs" />
                        </div>
                        <input
                            type="tel"
                            required={isRegistering}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-uce focus:border-uce"
                            placeholder="809-000-0000"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                        />
                    </div>
                </div>
            </>
          )}

          {/* CAMPOS COMUNES */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Institucional</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaEnvelope className="text-gray-400" />
              </div>
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-uce focus:border-uce"
                placeholder="admin@uce.edu.do"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaLock className="text-gray-400" />
              </div>
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-uce focus:border-uce"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-uce hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-200 flex justify-center items-center mt-6"
          >
            {loading ? 'Procesando...' : isRegistering ? 'Registrar Administrador' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-6 text-center pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            {isRegistering ? '¿Ya tienes cuenta?' : '¿Eres nuevo administrador?'}
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="ml-2 font-semibold text-uce hover:text-green-800 hover:underline"
            >
              {isRegistering ? 'Inicia Sesión aquí' : 'Regístrate aquí'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
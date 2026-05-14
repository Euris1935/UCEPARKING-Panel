import { useState } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import { FaParking, FaEnvelope, FaLock } from 'react-icons/fa';
import { ESTADO_USUARIO, ROL } from '../lib/constants';

export default function Login() {
  const [loading, setLoading] = useState(false);
  
  // formulario simplificado
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { email, password } = formData;

    try {
      // ── 1. Verificación Previa (Evita el parpadeo del Dashboard) ──
      const { data: statusData } = await supabase.rpc('verificar_estado_por_email', { p_email_input: email });
      
      const userStatus = statusData?.[0];
      // Si el estado es NULL, tratamos como ACTIVO (1) provisionalmente para evitar bloqueos
      const effectiveStatus = userStatus?.v_id_estado ?? ESTADO_USUARIO.ACTIVO;

      if (userStatus && effectiveStatus !== ESTADO_USUARIO.ACTIVO) {
        throw new Error('STATUS_INACTIVE');
      }

      // ── 2. Intento de Inicio de Sesión ──
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // ── 3. Validación de Rol (Plan RAW) ──
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase.from('usuario').select('rol_id').eq('id', user.id).maybeSingle();
        if (userData?.rol_id === ROL.MOVIL) {
          await supabase.auth.signOut();
          throw new Error('ROLE_MOBILE');
        }
      }
      
      // Éxito: El cambio de estado de la sesión provocará que App.js redireccione.
      // No mostramos mensaje de éxito para que la entrada sea fluida.
      Swal.close(); 
    } catch (error) {
      console.error('Login Error:', error);
      
      if (error.message === 'STATUS_INACTIVE') {
        Swal.fire({
          title: 'Acceso Denegado',
          text: 'Este usuario no es un usuario activo del sistema.',
          icon: 'warning',
          confirmButtonColor: '#22c55e'
        });
      } else if (error.message === 'ROLE_MOBILE') {
        Swal.fire({
          title: 'Acceso Denegado',
          text: 'Esta cuenta es de uso exclusivo para la aplicación móvil y no tiene permitido el acceso al panel web.',
          icon: 'error',
          confirmButtonColor: '#d33'
        });
      } else {
        Swal.fire({
          title: 'Error de Acceso',
          text: 'Las credenciales son incorrectas. Por favor, revise su correo y contraseña nuevamente.',
          icon: 'error',
          confirmButtonColor: '#d33'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full border border-gray-100 max-w-md transition-all duration-300">
        
        <div className="text-center p-8 pb-4">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FaParking className="text-4xl text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 tracking-tight">UCE PARKING</h2>
          <p className="text-gray-500 mt-2 font-medium">Logística y Control de Accesos</p>
        </div>

        <form onSubmit={handleAuth} className="p-8 pt-0 space-y-4">
          
          <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-1 uppercase tracking-wider">Correo Electrónico</label>
              <div className="relative">
              <FaEnvelope className="absolute left-3 top-3.5 text-gray-400" />
              <input
                  type="email"
                  name="email"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                  placeholder="usuario@uce.edu.do"
                  value={formData.email}
                  onChange={handleChange}
              />
              </div>
          </div>

          <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 uppercase tracking-wider">Contraseña</label>
              <div className="relative">
              <FaLock className="absolute left-3 top-3.5 text-gray-400" />
              <input
                  type="password"
                  name="password"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
              />
              </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 px-4 rounded-xl shadow-lg transition duration-200 flex justify-center items-center mt-8 uppercase tracking-widest text-sm"
          >
            {loading ? 'Validando...' : 'Entrar al Sistema'}
          </button>
        </form>

        <div className="p-6 text-center border-t border-gray-50 bg-gray-50/50 rounded-b-2xl">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            © 2026 Universidad Central del Este
          </p>
        </div>
      </div>
    </div>
  );
}
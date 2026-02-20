import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaClock, FaSave, FaShieldAlt, FaLock } from 'react-icons/fa';

export default function Configuracion() {
 
  const [settings, setSettings] = useState({
    notificacionesSonoras: true,
    alertaCapacidad: 90, 
    tiempoMaximoReserva: 4, 
    refrescoMapa: 5 
  });

 
  const [passData, setPassData] = useState({ newPassword: '', confirmPassword: '' });
  const [loadingPass, setLoadingPass] = useState(false);

  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
    }
  }, []);


  const handleSaveSettings = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    Swal.fire({
        title: 'Guardado',
        text: 'La configuración del sistema ha sido actualizada.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
    });
  };

  
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passData.newPassword !== passData.confirmPassword) {
        return Swal.fire('Error', 'Las contraseñas no coinciden.', 'error');
    }
    if (passData.newPassword.length < 6) {
        return Swal.fire('Error', 'La contraseña debe tener al menos 6 caracteres.', 'error');
    }

    setLoadingPass(true);
    try {
        const { error } = await supabase.auth.updateUser({ password: passData.newPassword });
        if (error) throw error;

        Swal.fire('Éxito', 'Tu contraseña ha sido actualizada correctamente.', 'success');
        setPassData({ newPassword: '', confirmPassword: '' });

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setLoadingPass(false);
    }
  };

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Configuración</h2>
        <p className="text-gray-500">Personaliza los parámetros del sistema.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <FaClock className="text-green-500 text-xl" />
                <h3 className="text-xl font-bold text-gray-800">Reglas del Parqueo</h3>
            </div>

            <div className="space-y-4">
                <div>
                    <span className="block font-medium text-gray-700 mb-2">Sonidos del Sistema</span>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="w-5 h-5 text-green-600 rounded focus:ring-green-500" 
                            checked={settings.notificacionesSonoras} 
                            onChange={e => setSettings({...settings, notificacionesSonoras: e.target.checked})} 
                        />
                        <span className="text-sm text-gray-600">Activar alertas sonoras</span>
                    </label>
                </div>

                <div className="pt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo Máximo de Reserva (Horas)</label>
                    <input 
                        type="number" 
                        value={settings.tiempoMaximoReserva}
                        onChange={e => setSettings({...settings, tiempoMaximoReserva: e.target.value})}
                        className="w-full border p-2 rounded bg-gray-50 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alerta de Capacidad (%)</label>
                    <div className="flex items-center gap-4">
                        <input 
                            type="range" min="50" max="100" 
                            value={settings.alertaCapacidad}
                            onChange={e => setSettings({...settings, alertaCapacidad: e.target.value})}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="font-bold text-green-600 w-12">{settings.alertaCapacidad}%</span>
                    </div>
                </div>

                <button onClick={handleSaveSettings} className="w-full mt-4 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition">
                    <FaSave /> Guardar Parámetros
                </button>
            </div>
        </section>

        
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <FaShieldAlt className="text-red-500 text-xl" />
                <h3 className="text-xl font-bold text-gray-800">Seguridad de la Cuenta</h3>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                    <div className="relative">
                        <FaLock className="absolute left-3 top-3 text-gray-400" />
                        <input 
                            type="password" required placeholder="••••••••"
                            className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-red-500"
                            value={passData.newPassword}
                            onChange={e => setPassData({...passData, newPassword: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                    <div className="relative">
                        <FaLock className="absolute left-3 top-3 text-gray-400" />
                        <input 
                            type="password" required placeholder="••••••••"
                            className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-red-500"
                            value={passData.confirmPassword}
                            onChange={e => setPassData({...passData, confirmPassword: e.target.value})}
                        />
                    </div>
                </div>
                <div className="pt-2">
                    <button 
                        type="submit" disabled={loadingPass}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition disabled:opacity-50"
                    >
                        {loadingPass ? 'Actualizando...' : 'Cambiar Contraseña'}
                    </button>
                </div>
            </form>
        </section>

      </div>
    </Layout>
  );
}
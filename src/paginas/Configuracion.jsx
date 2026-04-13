import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { 
    FaClock, FaSave, FaShieldAlt, FaLock, FaBell, FaUser,
    FaEnvelope, FaIdBadge, FaKey, FaCheckCircle, FaCog,
    FaEye, FaEyeSlash, FaVolumeUp
} from 'react-icons/fa';
import { playBeep } from '../utils/audio';

export default function Configuracion() {
    const [activeTab, setActiveTab] = useState('sistema');

    // --- Tab: Sistema ---
    const [settings, setSettings] = useState({
        notificacionesSonoras: true,
        alertaCapacidad: 90,
        tiempoMaximoReserva: 4,
    });
    const [currentPersonaId, setCurrentPersonaId] = useState(null);
    const [orgId, setOrgId] = useState(null);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
                if (uData?.id_persona) {
                    setCurrentPersonaId(uData.id_persona);
                    const { data: empData } = await supabase.from('empleado').select('organizacion_id').eq('id_persona', uData.id_persona).maybeSingle();
                    if (empData?.organizacion_id) setOrgId(empData.organizacion_id);
                }
            }
        };
        init();
        const saved = localStorage.getItem('appSettings');
        if (saved) setSettings(JSON.parse(saved));
    }, []);

    const handleSaveSettings = () => {
        localStorage.setItem('appSettings', JSON.stringify(settings));
        registrarLog('Configuración Cambiada', `Actualización de parámetros del sistema: Notificaciones=${settings.notificacionesSonoras}, Alerta Capacidad=${settings.alertaCapacidad}%, Max Reserva=${settings.tiempoMaximoReserva}h`);
        Swal.fire({ title: 'Guardado', text: 'Configuración actualizada.', icon: 'success', timer: 1500, showConfirmButton: false });
    };

    const registrarLog = async (tipo_nombre, descripcion) => {
        if (!currentPersonaId) return;
        try {
          const { data: te } = await supabase.from('tipo').select('id').eq('nombre', tipo_nombre).eq('contexto', 'evento').maybeSingle();
          const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Configuración').maybeSingle();
          await supabase.from('evento').insert([{ 
            fecha_hora: new Date().toISOString(), 
            descripcion: descripcion, 
            id_persona: currentPersonaId, 
            id_tipo: te?.id || null, 
            id_origen_evento: oe?.id_origen || null,
            organizacion_id: orgId
          }]);
        } catch (e) { console.warn('Log error:', e.message); }
      };

    // --- Tab: Cuenta ---
    const [profile, setProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [passData, setPassData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [loadingPass, setLoadingPass] = useState(false);

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (activeTab === 'cuenta') loadProfile();
    }, [activeTab]);

    const loadProfile = async () => {
        setLoadingProfile(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Obtener datos base del usuario (id_persona y rol_id)
            const { data: uData, error: uErr } = await supabase
                .from('usuario')
                .select('id_persona, rol_id')
                .eq('id', user.id)
                .maybeSingle();

            if (uErr) throw uErr;

            let nombre = '';
            let apellido = '';
            let nombreRol = 'Usuario';

            // 2. Obtener nombre de la persona
            if (uData?.id_persona) {
                const { data: pData } = await supabase
                    .from('persona')
                    .select('nombre, apellido')
                    .eq('id_persona', uData.id_persona)
                    .maybeSingle();
                if (pData) {
                    nombre = pData.nombre || '';
                    apellido = pData.apellido || '';
                }
            }

            // 3. Obtener nombre del rol
            if (uData?.rol_id) {
                const { data: rData } = await supabase
                    .from('rol')
                    .select('nombre')
                    .eq('id_rol', uData.rol_id)
                    .maybeSingle();
                if (rData) nombreRol = rData.nombre;
            }

            // 4. Fallback si no hay nombre en 'personas' (usar metadata de Supabase Auth)
            if (!nombre && user.user_metadata?.full_name) {
                const parts = user.user_metadata.full_name.split(' ');
                nombre = parts[0] || '';
                apellido = parts.slice(1).join(' ') || '';
            } else if (!nombre && user.user_metadata?.display_name) {
                nombre = user.user_metadata.display_name;
            }

            setProfile({
                email: user.email,
                nombre: nombre || 'Usuario',
                apellido: apellido || '',
                rol: nombreRol
            });
        } catch (e) {
            console.error('Error cargando perfil:', e);
        } finally {
            setLoadingProfile(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passData.newPassword !== passData.confirmPassword)
            return Swal.fire('Error', 'Las contraseñas nuevas no coinciden.', 'error');
        if (passData.newPassword.length < 6)
            return Swal.fire('Error', 'La nueva contraseña debe tener al menos 6 caracteres.', 'error');

        setLoadingPass(true);
        try {
            // Verificar contraseña actual
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: profile.email,
                password: passData.currentPassword,
            });
            if (signInError) throw new Error('La contraseña actual es incorrecta.');

            // Actualizar contraseña
            const { error: updateError } = await supabase.auth.updateUser({ password: passData.newPassword });
            if (updateError) throw updateError;

            Swal.fire('Proceso completado', 'Tu contraseña ha sido actualizada correctamente.', 'success');
            registrarLog('Cambio de Estado', `Actualización de contraseña de seguridad para usuario ${profile?.email}`);
            setPassData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setLoadingPass(false);
        }
    };

    const ROL_COLORS = {
        'admin': 'bg-red-100 text-red-700',
        'administrador': 'bg-red-100 text-red-700',
        'operador': 'bg-blue-100 text-blue-700',
        'supervisor': 'bg-purple-100 text-purple-700',
        'tecnico': 'bg-yellow-100 text-yellow-700',
    };
    const rolColor = ROL_COLORS[(profile?.rol || '').toLowerCase()] || 'bg-gray-100 text-gray-700';
    const initials = `${profile?.nombre?.[0] || ''}${profile?.apellido?.[0] || ''}`.toUpperCase() || '?';

    const tabs = [
        { id: 'sistema', label: 'Parámetros del Sistema', icon: FaCog },
        { id: 'cuenta', label: 'Configuración de Cuenta', icon: FaUser },
    ];

    return (
        <Layout>
            <header className="mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Configuración</h2>
                <p className="text-gray-500 mt-1">Personaliza los parámetros del sistema y gestiona tu cuenta.</p>
            </header>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-px ${
                                activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600 bg-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <Icon size={14} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab: Sistema */}
            {activeTab === 'sistema' && (
                <div className="max-w-2xl">
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                        <div className="flex items-center gap-3 border-b pb-4">
                            <FaClock className="text-green-500 text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">Reglas del Parqueo</h3>
                        </div>

                        {/* Sonidos */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <FaBell className={settings.notificacionesSonoras ? 'text-blue-500' : 'text-gray-400'} size={18} />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-gray-800">Alertas Sonoras</p>
                                        <button 
                                            onClick={() => playBeep(true)}
                                            className="text-[10px] bg-white text-blue-600 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50 transition flex items-center gap-1 font-bold"
                                            title="Probar sonido"
                                        >
                                            <FaVolumeUp size={10} /> PROBAR
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500">Suena un beep cuando una plaza se ocupa</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={settings.notificacionesSonoras}
                                    onChange={e => {
                                        const val = e.target.checked;
                                        setSettings({ ...settings, notificacionesSonoras: val });
                                        if (val) playBeep(true);
                                    }}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {/* Tiempo máximo reserva */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tiempo Máximo de Reserva
                                <span className="ml-2 text-blue-600 font-bold">{settings.tiempoMaximoReserva} horas</span>
                            </label>
                            <p className="text-xs text-gray-400 mb-2">Duración máxima permitida al crear una reserva.</p>
                            <input
                                type="number" min="1" max="24"
                                value={settings.tiempoMaximoReserva}
                                onChange={e => setSettings({ ...settings, tiempoMaximoReserva: parseInt(e.target.value) || 1 })}
                                className="w-full border p-2 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>

                        {/* Alerta de capacidad */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Alerta de Capacidad
                                <span className="ml-2 text-green-600 font-bold">{settings.alertaCapacidad}%</span>
                            </label>
                            <p className="text-xs text-gray-400 mb-2">Se enviará una notificación cuando el parqueo alcance este nivel de ocupación.</p>
                            <input
                                type="range" min="50" max="100"
                                value={settings.alertaCapacidad}
                                onChange={e => setSettings({ ...settings, alertaCapacidad: parseInt(e.target.value) })}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>50%</span><span>75%</span><span>100%</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSaveSettings}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold transition shadow"
                        >
                            <FaSave /> Guardar Configuración
                        </button>
                    </section>
                </div>
            )}

            {/* Tab: Cuenta */}
            {activeTab === 'cuenta' && (
                <div className="max-w-2xl space-y-6">
                    {/* Perfil */}
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 border-b pb-4 mb-5">
                            <FaUser className="text-blue-500 text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">Perfil de Usuario</h3>
                        </div>

                        {loadingProfile ? (
                            <div className="flex items-center justify-center py-8 text-gray-400">Cargando perfil...</div>
                        ) : profile ? (
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-md flex-shrink-0">
                                    {initials}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <FaUser className="text-gray-400" size={13} />
                                        <span className="text-gray-800 font-semibold">{profile.nombre} {profile.apellido}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <FaEnvelope className="text-gray-400" size={13} />
                                        <span className="text-gray-600 text-sm">{profile.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <FaIdBadge className="text-gray-400" size={13} />
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rolColor}`}>{profile.rol}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-sm">No se pudo cargar el perfil.</p>
                        )}
                    </section>

                    {/* Cambiar Contraseña */}
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 border-b pb-4 mb-5">
                            <FaShieldAlt className="text-red-500 text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">Cambiar Contraseña</h3>
                        </div>
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Actual</label>
                                <div className="relative">
                                    <FaKey className="absolute left-3 top-3.5 text-gray-400" size={13} />
                                    <input
                                        type={showCurrent ? "text" : "password"} required placeholder="••••••••"
                                        className="w-full pl-9 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none [&::-ms-reveal]:hidden"
                                        value={passData.currentPassword}
                                        onChange={e => setPassData({ ...passData, currentPassword: e.target.value })}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition"
                                    >
                                        {showCurrent ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                                <div className="relative">
                                    <FaLock className="absolute left-3 top-3.5 text-gray-400" size={13} />
                                    <input
                                        type={showNew ? "text" : "password"} required placeholder="Mínimo 6 caracteres"
                                        className="w-full pl-9 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none [&::-ms-reveal]:hidden"
                                        value={passData.newPassword}
                                        onChange={e => setPassData({ ...passData, newPassword: e.target.value })}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowNew(!showNew)}
                                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition"
                                    >
                                        {showNew ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nueva Contraseña</label>
                                <div className="relative">
                                    <FaCheckCircle className={`absolute left-3 top-3.5 ${passData.newPassword && passData.confirmPassword && passData.newPassword === passData.confirmPassword ? 'text-green-500' : 'text-gray-400'}`} size={13} />
                                    <input
                                        type={showConfirm ? "text" : "password"} required placeholder="Repite la nueva contraseña"
                                        className="w-full pl-9 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none [&::-ms-reveal]:hidden"
                                        value={passData.confirmPassword}
                                        onChange={e => setPassData({ ...passData, confirmPassword: e.target.value })}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition"
                                    >
                                        {showConfirm ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <button
                                type="submit" disabled={loadingPass}
                                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 px-4 rounded-lg font-semibold transition shadow"
                            >
                                {loadingPass ? 'Actualizando...' : 'Cambiar Contraseña'}
                            </button>
                        </form>
                    </section>
                </div>
            )}
        </Layout>
    );
}
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { 
    FaClock, FaSave, FaShieldAlt, FaLock, FaBell, FaUser,
    FaEnvelope, FaIdBadge, FaKey, FaCheckCircle, FaCog,
    FaEye, FaEyeSlash
} from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { useUI } from '../contexts/UIContext';
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';

export default function Configuracion() {
    const { orgId } = useOrg();
    const { isSidebarFixed, toggleSidebarFixed } = useUI();
    const [activeTab, setActiveTab] = useState('sistema');
    
    // --- Estado General ---
    const [currentPersonaId, setCurrentPersonaId] = useState(null);
    const [esAdmin, setEsAdmin] = useState(false);

    // --- Tab: Sistema ---
    const [settings, setSettings] = useState({
        alertaCapacidad: 90,
        tiempoMaximoReserva: 4,
        umbralEstanciaLarga: 16,
    });

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: uData } = await supabase.from('usuario').select('id_persona, rol_id, rol:rol_id(nombre)').eq('id', user.id).single();
                if (uData?.id_persona) {
                    setCurrentPersonaId(uData.id_persona);
                    const rolName = uData.rol?.nombre?.toLowerCase() || '';
                    setEsAdmin(rolName === 'admin' || rolName === 'administrador');
                }
            }
        };
        init();
        const saved = localStorage.getItem('appSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setSettings(prev => ({
                    ...prev,
                    alertaCapacidad: parsed.alertaCapacidad ?? 90,
                    tiempoMaximoReserva: parsed.tiempoMaximoReserva ?? 4,
                    umbralEstanciaLarga: parsed.umbralEstanciaLarga ?? 16,
                }));
            } catch (e) {
                console.error("Error parsing settings:", e);
            }
        }
    }, []);

    const handleSaveSettings = () => {
        const saved = localStorage.getItem('appSettings');
        const oldSettings = saved ? JSON.parse(saved) : {};
        
        localStorage.setItem('appSettings', JSON.stringify(settings));

        const descCambios = generarDescripcionCambio(oldSettings, settings, 'Actualización de parámetros del sistema');
        
        registrarLog({
            tipo_nombre: EVENT_TYPES.CONFIGURACION_CAMBIADA,
            descripcion: descCambios,
            id_persona: currentPersonaId,
            organizacion_id: orgId,
            origen: 'Panel Web - Configuración'
        });

        Swal.fire({ title: 'Guardado', text: 'Configuración actualizada.', icon: 'success', timer: 1500, showConfirmButton: false });
    };

    // La función registrarLog local ha sido eliminada para usar la global.

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
            
            registrarLog({
                tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
                descripcion: `El usuario ${profile?.nombre} ${profile?.apellido} actualizó su contraseña de acceso.`,
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Configuración'
            });
            setPassData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setLoadingPass(false);
        }
    };
    
    // --- Tab: Horario Laboral ---
    const [horarios, setHorarios] = useState([]);
    const [loadingHorarios, setLoadingHorarios] = useState(false);

    const DIAS = [
        { id: 1, nombre: 'Lunes' },
        { id: 2, nombre: 'Martes' },
        { id: 3, nombre: 'Miércoles' },
        { id: 4, nombre: 'Jueves' },
        { id: 5, nombre: 'Viernes' },
        { id: 6, nombre: 'Sábado' },
        { id: 0, nombre: 'Domingo' }
    ];

    useEffect(() => {
        if (activeTab === 'horario' && orgId) loadHorarios();
    }, [activeTab, orgId]);

    const loadHorarios = async () => {
        setLoadingHorarios(true);
        try {
            const { data, error } = await supabase
                .from('horario_laboral')
                .select('*')
                .eq('organizacion_id', orgId);
            
            if (error) throw error;

            // Mapear y rellenar días faltantes
            const base = DIAS.map(d => {
                const existente = data?.find(h => h.dia_semana === d.id);
                return existente || { 
                    dia_semana: d.id, 
                    hora_apertura: '08:00', 
                    hora_cierre: '18:00', 
                    activo: true,
                    organizacion_id: orgId
                };
            });
            setHorarios(base);
        } catch (e) {
            console.error('Error cargando horarios:', e.message);
        } finally {
            setLoadingHorarios(false);
        }
    };

    const handleHorarioChange = (dia_semana, field, value) => {
        setHorarios(prev => prev.map(h => h.dia_semana === dia_semana ? { ...h, [field]: value } : h));
    };

    const handleSaveHorarios = async () => {
        if (!esAdmin) return Swal.fire('Acceso denegado', 'Solo los administradores pueden modificar el horario.', 'error');
        
        setLoadingHorarios(true);
        try {
            // Limpiar datos para upsert (quitar id si es nuevo para que no choque o usar onConflict)
            const payload = horarios.map(h => ({
                organizacion_id: orgId,
                dia_semana: h.dia_semana,
                hora_apertura: h.hora_apertura,
                hora_cierre: h.hora_cierre,
                activo: h.activo
            }));

            const { error } = await supabase
                .from('horario_laboral')
                .upsert(payload, { onConflict: 'organizacion_id, dia_semana' });
            
            if (error) throw error;

            Swal.fire('¡Éxito!', 'Horarios actualizados correctamente.', 'success');
            
            registrarLog({
                tipo_nombre: EVENT_TYPES.CONFIGURACION_CAMBIADA,
                descripcion: `Modificación de los horarios laborales de la organización por el administrador.`,
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Configuración'
            });
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        } finally {
            setLoadingHorarios(false);
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
        { id: 'horario', label: 'Horario Laboral', icon: FaClock },
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



                        {/* Tiempo máximo reserva */}
                        <div className="grid grid-cols-1 gap-4">
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

                        {/* Alerta de estancia larga */}
                        <div className="pt-4 border-t border-gray-100">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Alerta de Estancia Larga
                                <span className="ml-2 text-blue-600 font-bold">{settings.umbralEstanciaLarga} horas</span>
                            </label>
                            <p className="text-xs text-gray-400 mb-2">Se notificará cuando un vehículo supere este tiempo en el parqueo.</p>
                            <input
                                type="range" min="1" max="48"
                                value={settings.umbralEstanciaLarga}
                                onChange={e => setSettings({ ...settings, umbralEstanciaLarga: parseInt(e.target.value) })}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>1h</span><span>24h</span><span>48h</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSaveSettings}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold transition shadow"
                        >
                            <FaSave /> Guardar Configuración
                        </button>
                    </section>

                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6 mt-6">
                        <div className="flex items-center gap-3 border-b pb-4">
                            <FaEye className="text-purple-500 text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">Comportamiento de la Interfaz</h3>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <h4 className="font-bold text-gray-800">Barra Lateral Fija</h4>
                                <p className="text-xs text-gray-500 max-w-sm mt-1">
                                    Si está activa, la barra lateral siempre estará visible. Si la desactivas, la barra se ocultará para darte pantalla completa y solo aparecerá al acercar el ratón al borde izquierdo.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={isSidebarFixed}
                                    onChange={(e) => toggleSidebarFixed(e.target.checked)}
                                />
                                <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                    </section>
                </div>
            )}

            {/* Tab: Horario Laboral */}
            {activeTab === 'horario' && (
                <div className="max-w-4xl">
                    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between border-b pb-4 mb-6">
                            <div className="flex items-center gap-3">
                                <FaClock className="text-orange-500 text-xl" />
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800">Horario de Operación</h3>
                                    <p className="text-xs text-gray-500">Define los días y horas en los que el sistema permitirá realizar operaciones.</p>
                                </div>
                            </div>
                            {esAdmin && (
                                <button
                                    onClick={handleSaveHorarios}
                                    disabled={loadingHorarios}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm disabled:opacity-50"
                                >
                                    <FaSave /> {loadingHorarios ? 'Guardando...' : 'Guardar Horarios'}
                                </button>
                            )}
                        </div>

                        {!esAdmin && (
                            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-center gap-3">
                                <FaLock className="text-amber-500" />
                                <span>Solo los administradores pueden modificar los horarios de la organización.</span>
                            </div>
                        )}

                        {loadingHorarios && horarios.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <FaClock className="animate-pulse text-4xl mb-2" />
                                <p>Cargando horarios...</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {horarios.map((horario) => {
                                    const diaNombre = DIAS.find(d => d.id === horario.dia_semana)?.nombre;
                                    return (
                                        <div key={horario.dia_semana} className={`flex flex-col md:flex-row items-center justify-between p-4 rounded-xl border transition-all ${horario.activo ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                            <div className="flex items-center gap-4 w-full md:w-48 mb-3 md:mb-0">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${horario.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                                    {diaNombre?.substring(0, 2)}
                                                </div>
                                                <span className="font-bold text-gray-700">{diaNombre}</span>
                                            </div>

                                            <div className="flex items-center gap-4 flex-grow justify-center mb-3 md:mb-0">
                                                <div className="flex flex-col">
                                                    <label className="text-[10px] text-gray-400 uppercase font-bold ml-1">Apertura</label>
                                                    <input 
                                                        type="time" 
                                                        disabled={!horario.activo || !esAdmin}
                                                        value={horario.hora_apertura}
                                                        onChange={(e) => handleHorarioChange(horario.dia_semana, 'hora_apertura', e.target.value)}
                                                        className="border rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-400 outline-none disabled:bg-gray-100"
                                                    />
                                                </div>
                                                <span className="text-gray-300 mt-4">—</span>
                                                <div className="flex flex-col">
                                                    <label className="text-[10px] text-gray-400 uppercase font-bold ml-1">Cierre</label>
                                                    <input 
                                                        type="time" 
                                                        disabled={!horario.activo || !esAdmin}
                                                        value={horario.hora_cierre}
                                                        onChange={(e) => handleHorarioChange(horario.dia_semana, 'hora_cierre', e.target.value)}
                                                        className="border rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-400 outline-none disabled:bg-gray-100"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                                <span className={`text-[10px] font-bold uppercase transition-colors ${horario.activo ? 'text-green-600' : 'text-gray-400'}`}>
                                                    {horario.activo ? 'En Servicio' : 'Cerrado'}
                                                </span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        disabled={!esAdmin}
                                                        checked={horario.activo}
                                                        onChange={(e) => handleHorarioChange(horario.dia_semana, 'activo', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
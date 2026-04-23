import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useOrg } from '../contexts/OrgContext';
import { useRbac } from '../contexts/RbacContext';
import { FaClock, FaLock, FaSync } from 'react-icons/fa';

/**
 * ScheduleGuard intercepte el renderizado si el sistema está fuera de horario laboral.
 * Solo permite el acceso total a los Administradores en cualquier momento.
 */
export default function ScheduleGuard({ children }) {
    const { orgId } = useOrg();
    const { esAdmin, loadingRbac } = useRbac();
    const [isBlocked, setIsBlocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [horarioInfo, setHorarioInfo] = useState(null);

    useEffect(() => {
        if (orgId && !loadingRbac) {
            checkSchedule();
        }
    }, [orgId, loadingRbac]);

    const checkSchedule = async () => {
        // Los administradores siempre tienen acceso
        if (esAdmin) {
            setIsBlocked(false);
            setLoading(false);
            return;
        }

        try {
            // Consultar la configuración de horarios para la organización
            const { data, error } = await supabase
                .from('horario_laboral')
                .select('*')
                .eq('organizacion_id', orgId);

            if (error) throw error;

            const now = new Date();
            const dayOfWeek = now.getDay(); // 0: Dom, 1: Lun, ..., 6: Sab
            
            // Convertir hora actual a minutos desde medianoche para comparación fácil
            const currentTimeMin = now.getHours() * 60 + now.getMinutes();

            const config = data?.find(h => h.dia_semana === dayOfWeek);

            if (!config || !config.activo) {
                setIsBlocked(true);
                setHorarioInfo({ day: dayOfWeek, closed: true });
            } else {
                // Parsear horas "HH:mm"
                const [startH, startM] = config.hora_apertura.split(':').map(Number);
                const [endH, endM] = config.hora_cierre.split(':').map(Number);
                
                const startTimeMin = startH * 60 + startM;
                const endTimeMin = endH * 60 + endM;

                if (currentTimeMin < startTimeMin || currentTimeMin > endTimeMin) {
                    setIsBlocked(true);
                    setHorarioInfo({ 
                        day: dayOfWeek, 
                        start: config.hora_apertura, 
                        end: config.hora_cierre 
                    });
                } else {
                    setIsBlocked(false);
                }
            }
        } catch (err) {
            console.error('[ScheduleGuard] Fallo al validar horario:', err.message);
            // En caso de error de red o base de datos, permitimos el acceso para no bloquear el sistema por fallos externos
            setIsBlocked(false);
        } finally {
            setLoading(false);
        }
    };

    if (loading || loadingRbac) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <FaSync className="animate-spin text-blue-600 text-3xl" />
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Validando horario de acceso...</p>
                </div>
            </div>
        );
    }

    if (isBlocked && !esAdmin) {
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const diaNombre = diasSemana[horarioInfo?.day] || '';

        return (
            <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-6 overflow-hidden select-none">
                {/* Decoración de fondo */}
                <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-orange-600/10 rounded-full blur-[100px]"></div>
                
                <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-[2.5rem] shadow-2xl max-w-xl w-full text-center relative z-10">
                    <div className="bg-red-500/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 transform rotate-12 shadow-inner border border-red-500/20">
                        <FaLock className="text-4xl text-red-500 -rotate-12" />
                    </div>

                    <h1 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tighter uppercase">
                        Acceso Restringido
                    </h1>
                    <p className="text-slate-400 text-base md:text-lg mb-8 font-medium leading-relaxed">
                        El sistema <span className="text-white font-bold">UCE PARKING</span> se encuentra fuera de su horario operativo habitual para hoy.
                    </p>

                    <div className="bg-slate-950/50 rounded-3xl p-8 border border-white/5 mb-8 shadow-inner">
                        <div className="flex items-center justify-center gap-2 mb-4 text-red-400">
                            <FaClock size={14} />
                            <span className="font-black uppercase tracking-[0.2em] text-[10px]">Horario Vigente • {diaNombre}</span>
                        </div>
                        
                        {horarioInfo?.closed ? (
                            <div className="text-3xl font-black text-white tracking-tight">NO LABORABLE</div>
                        ) : (
                            <div className="flex items-center justify-center gap-6">
                                <div className="text-center">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Apertura</div>
                                    <div className="text-4xl font-black text-white tracking-tighter">{horarioInfo?.start}</div>
                                </div>
                                <div className="h-12 w-px bg-slate-800 self-end mb-1"></div>
                                <div className="text-center">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Cierre</div>
                                    <div className="text-4xl font-black text-white tracking-tighter">{horarioInfo?.end}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <button 
                            onClick={() => supabase.auth.signOut()}
                            className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.15em] border border-white/5 hover:bg-slate-700 transition-all active:scale-95 shadow-xl"
                        >
                            Volver al Inicio de Sesión
                        </button>
                        
                        <div className="pt-4 border-t border-slate-800/50">
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-loose">
                                Solo personal administrativo puede ingresar <br/> para gestiones de emergencia.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-8 left-0 right-0 text-center opacity-20 pointer-events-none">
                    <p className="text-white text-[10px] font-black tracking-[0.5em] uppercase">UCE PARKING CONTROL SYSTEM</p>
                </div>
            </div>
        );
    }

    return children;
}

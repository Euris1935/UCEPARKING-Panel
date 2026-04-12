
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaFilter, FaSync, FaExclamationTriangle, FaCheckCircle, FaBolt, FaHistory, FaCar, FaCarSide, FaBan, FaTicketAlt, FaTools, FaWifi, FaWrench, FaTrash, FaUserPlus, FaList, FaLock, FaCog, FaMapMarkerAlt, FaUserTie } from 'react-icons/fa';

const TIPO_COLORES = {
    'Entrada': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: FaCar },
    'Salida': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: FaCarSide },
    'Alerta': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaExclamationTriangle },
    'Reserva Creada': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: FaCheckCircle },
    'Reserva Cancelada': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: FaBan },
    'Ticket Emitido': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: FaTicketAlt },
    'Ticket Cerrado': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: FaCheckCircle },
    'Ticket Vencido': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: FaExclamationTriangle },
    'Mantenimiento Iniciado': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: FaTools },
    'Mantenimiento Completado': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: FaCheckCircle },
    'Mantenimiento En Progreso': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: FaWrench },
    'Mantenimiento Cancelado': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: FaBan },
    'Mantenimiento En Espera': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: FaExclamationTriangle },
    'Acceso Denegado': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaBan },
    'Dispositivo Offline': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaWifi },
    'Dispositivo Online': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: FaWifi },
    'Entrada LPR Autorizada': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: FaCar },
    'Entrada LPR Denegada': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaBan },
    'Salida LPR': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: FaCarSide },
    'Placa No Reconocida': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: FaExclamationTriangle },
    // Nuevos tipos añadidos:
    'Vehículo Registrado': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: FaCar },
    'Vehículo Eliminado': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaTrash },
    'Usuario Creado': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: FaUserPlus },
    'Usuario Eliminado': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: FaTrash },
    'Asignación Modificada': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: FaList },
    'Permiso Actualizado': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', icon: FaLock },
    'Configuración Cambiada': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: FaCog },
    'Zona Modificada': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: FaMapMarkerAlt },
    'Empleado Registrado': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', icon: FaUserTie },
    'Cambio de Estado': { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200', icon: FaSync },
};
const TIPO_DEFAULT = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: FaHistory };

export default function Logs() {
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('TODOS');

    useEffect(() => {
        loadEventos();
        // Suscripción en tiempo real
        const channel = supabase
            .channel('realtime_eventos')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evento' }, () => loadEventos())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const loadEventos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('evento')
                .select(`
                    *,
                    persona ( nombre, apellido ),
                    tipo ( nombre ),
                    origen_evento ( nombre ),
                    dispositivo (
                        ubicacion,
                        tipo ( nombre )
                    )
                `)
                .order('fecha_hora', { ascending: false })
                .limit(200);

            if (error) throw error;
            setEventos(data || []);
        } catch (error) {
            console.error('Error cargando logs:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const tiposUnicos = ['TODOS', ...Object.keys(TIPO_COLORES)];

    const filtered = eventos.filter(e => {
        const matchTipo = filtroTipo === 'TODOS' || e.tipo?.nombre === filtroTipo;
        const matchSearch = searchTerm === '' ||
            e.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.tipo?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            `${e.persona?.nombre} ${e.persona?.apellido}`.toLowerCase().includes(searchTerm.toLowerCase());
        return matchTipo && matchSearch;
    });

    const formatFecha = (str) => {
        if (!str) return '-';
        return new Date(str).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'medium' });
    };

    return (
        <Layout>
            <header className="mb-8 flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Logs de Eventos</h2>
                    <p className="text-gray-500 mt-1">Historial de cambios de estado, errores y eventos del sistema.</p>
                </div>
                <button
                    onClick={loadEventos}
                    className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium shadow-sm transition"
                >
                    <FaSync className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
            </header>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                    <FaSearch className="absolute left-3 top-3 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar en descripción o usuario..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-blue-500 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <FaFilter className="text-gray-400" />
                    <select
                        className="border rounded-lg px-3 py-2 text-sm focus:ring-blue-500 outline-none bg-gray-50"
                        value={filtroTipo}
                        onChange={e => setFiltroTipo(e.target.value)}
                    >
                        {tiposUnicos.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <span className="text-xs text-gray-400 font-medium ml-auto">{filtered.length} registros</span>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 text-left">Fecha / Hora</th>
                                <th className="px-6 py-3 text-left">Tipo de Evento</th>
                                <th className="px-6 py-3 text-left">Descripción</th>
                                <th className="px-6 py-3 text-left">Plaza</th>
                                <th className="px-6 py-3 text-left">Dispositivo</th>
                                <th className="px-6 py-3 text-left">Origen / Usuario</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-10 text-gray-400">Cargando registros...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="6" className="text-center py-10 text-gray-400">No hay logs registrados aún.</td></tr>
                            ) : (
                                filtered.map(ev => {
                                    const config = TIPO_COLORES[ev.tipo?.nombre] || TIPO_DEFAULT;
                                    const Icon = config.icon;
                                    return (
                                        <tr key={ev.id_log} className="hover:bg-gray-50 transition-all">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                                                {formatFecha(ev.fecha_hora)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${config.bg} ${config.text} ${config.border}`}>
                                                    <Icon size={10} />
                                                    {ev.tipo?.nombre || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 max-w-xs">
                                                <p className="text-gray-700 line-clamp-2" title={ev.descripcion}>
                                                    {ev.descripcion}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {ev.id_plaza ? (
                                                    <span className="font-bold text-blue-600">#{ev.id_plaza}</span>
                                                ) : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">
                                                {ev.dispositivo ? (
                                                    <span>
                                                        <span className="font-semibold">{ev.dispositivo.tipo?.nombre}</span>
                                                        <span className="block text-gray-400">{ev.dispositivo.ubicacion}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-600">
                                                <span className="block font-medium">{ev.persona ? `${ev.persona.nombre} ${ev.persona.apellido}` : 'Sistema'}</span>
                                                {ev.origen_evento?.nombre && <span className="text-gray-400 italic">{ev.origen_evento.nombre}</span>}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
}

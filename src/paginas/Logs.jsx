
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaFilter, FaSync, FaExclamationTriangle, FaCheckCircle, FaBolt, FaMicrochip, FaHistory } from 'react-icons/fa';

const TIPO_COLORES = {
    'CAMBIO_ESTADO': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: FaBolt },
    'ERROR_SENSOR': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: FaExclamationTriangle },
    'DESCONEXION': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: FaMicrochip },
    'MANTENIMIENTO': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: FaCheckCircle },
    'SISTEMA': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: FaHistory },
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
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, () => loadEventos())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const loadEventos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('eventos')
                .select(`
          *,
          personas ( nombre, apellido ),
          dispositivos (
            ubicacion,
            tipos_dispositivos ( nombre_tipo )
          )
        `)
                .order('Fecha_Hora', { ascending: false })
                .limit(200);

            if (error) throw error;
            setEventos(data || []);
        } catch (error) {
            console.error('Error cargando logs:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const tiposUnicos = ['TODOS', ...new Set(eventos.map(e => e.Tipo_Evento).filter(Boolean))];

    const filtered = eventos.filter(e => {
        const matchTipo = filtroTipo === 'TODOS' || e.Tipo_Evento === filtroTipo;
        const matchSearch = searchTerm === '' ||
            e.Descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.Tipo_Evento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            `${e.personas?.nombre} ${e.personas?.apellido}`.toLowerCase().includes(searchTerm.toLowerCase());
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
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
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
                                    const config = TIPO_COLORES[ev.Tipo_Evento] || TIPO_DEFAULT;
                                    const Icon = config.icon;
                                    return (
                                        <tr key={ev.Id_Log} className="hover:bg-gray-50 transition-all">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                                                {formatFecha(ev.Fecha_Hora)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${config.bg} ${config.text} ${config.border}`}>
                                                    <Icon size={10} />
                                                    {ev.Tipo_Evento || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 max-w-xs">
                                                <p className="text-gray-700 line-clamp-2" title={ev.Descripcion}>
                                                    {ev.Descripcion}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {ev.Id_Plaza ? (
                                                    <span className="font-bold text-blue-600">#{ev.Id_Plaza}</span>
                                                ) : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">
                                                {ev.dispositivos ? (
                                                    <span>
                                                        <span className="font-semibold">{ev.dispositivos.tipos_dispositivos?.nombre_tipo}</span>
                                                        <span className="block text-gray-400">{ev.dispositivos.ubicacion}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-600">
                                                <span className="block font-medium">{ev.personas ? `${ev.personas.nombre} ${ev.personas.apellido}` : 'Sistema'}</span>
                                                {ev.origen_evento && <span className="text-gray-400 italic">{ev.origen_evento}</span>}
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

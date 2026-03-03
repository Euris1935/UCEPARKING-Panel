
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaBell, FaCheckDouble, FaTrash, FaPlus, FaEnvelopeOpen } from 'react-icons/fa';

const TIPO_COLORS = {
    'Alerta': 'bg-red-100 text-red-800 border-red-200',
    'Mantenimiento': 'bg-orange-100 text-orange-800 border-orange-200',
    'Sistema': 'bg-blue-100 text-blue-800 border-blue-200',
    'Reserva': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Información': 'bg-green-100 text-green-800 border-green-200',
};

export default function Notificaciones() {
    const [notifs, setNotifs] = useState([]);
    const [tiposNotif, setTiposNotif] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [personasList, setPersonasList] = useState([]);
    const [form, setForm] = useState({ Tipo: 'Sistema', Contenido: '', persona_id: '', id_tipo: '' });

    useEffect(() => {
        loadAll();
        const channel = supabase
            .channel('realtime_notifs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, () => loadAll())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const { data: nData } = await supabase
                .from('notificaciones')
                .select(`*, personas(nombre, apellido), tipo_notificacion(nombre_tipo)`)
                .order('created_at', { ascending: false });
            setNotifs(nData || []);

            const { data: tData } = await supabase.from('tipo_notificacion').select('*').order('nombre_tipo');
            setTiposNotif(tData || []);

            const { data: pData } = await supabase.from('personas').select('id, nombre, apellido').order('nombre');
            setPersonasList(pData || []);
        } catch (e) {
            console.error('Error notificaciones:', e.message);
        } finally {
            setLoading(false);
        }
    };

    const marcarLeida = async (id) => {
        await supabase.from('notificaciones').update({ Leida: true }).eq('ID_Notificacion', id);
        loadAll();
    };

    const marcarTodasLeidas = async () => {
        await supabase.from('notificaciones').update({ Leida: true }).eq('Leida', false);
        loadAll();
    };

    const eliminar = async (id) => {
        const r = await Swal.fire({ title: '¿Eliminar notificación?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' });
        if (r.isConfirmed) {
            await supabase.from('notificaciones').delete().eq('ID_Notificacion', id);
            loadAll();
        }
    };

    const handleCreate = async () => {
        if (!form.Contenido.trim()) return Swal.fire('Atención', 'El contenido es obligatorio.', 'warning');
        try {
            const payload = {
                Tipo: form.Tipo,
                Contenido: form.Contenido,
                Leida: false,
                persona_id: form.persona_id || null,
                id_tipo: form.id_tipo ? parseInt(form.id_tipo) : null
            };
            const { error } = await supabase.from('notificaciones').insert([payload]);
            if (error) throw error;
            Swal.fire('Enviada', 'Notificación creada correctamente.', 'success');
            setShowModal(false);
            setForm({ Tipo: 'Sistema', Contenido: '', persona_id: '', id_tipo: '' });
            loadAll();
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        }
    };

    const noLeidas = notifs.filter(n => !n.Leida).length;

    const getBadge = (tipo) => TIPO_COLORS[tipo] || 'bg-gray-100 text-gray-700 border-gray-200';

    return (
        <Layout>
            <header className="mb-8 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-bold text-gray-900">Notificaciones</h2>
                        {noLeidas > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                                {noLeidas} nuevas
                            </span>
                        )}
                    </div>
                    <p className="text-gray-500 mt-1">Centro de alertas y mensajes del sistema.</p>
                </div>
                <div className="flex gap-3">
                    {noLeidas > 0 && (
                        <button onClick={marcarTodasLeidas} className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium text-sm transition">
                            <FaCheckDouble /> Marcar todas leídas
                        </button>
                    )}
                    <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow transition">
                        <FaPlus /> Nueva Notificación
                    </button>
                </div>
            </header>

            {/* Modal nueva notificación */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border-t-4 border-blue-600">
                        <h3 className="text-xl font-bold mb-5 text-gray-800 flex items-center gap-2"><FaBell className="text-blue-600" /> Nueva Notificación</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo</label>
                                <select className="w-full border p-2 rounded-lg text-sm" value={form.Tipo} onChange={e => setForm({ ...form, Tipo: e.target.value })}>
                                    {Object.keys(TIPO_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría (opcional)</label>
                                <select className="w-full border p-2 rounded-lg text-sm bg-gray-50" value={form.id_tipo} onChange={e => setForm({ ...form, id_tipo: e.target.value })}>
                                    <option value="">-- General --</option>
                                    {tiposNotif.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.nombre_tipo}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Destinatario (opcional)</label>
                                <select className="w-full border p-2 rounded-lg text-sm bg-gray-50" value={form.persona_id} onChange={e => setForm({ ...form, persona_id: e.target.value })}>
                                    <option value="">-- Todos / General --</option>
                                    {personasList.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contenido *</label>
                                <textarea
                                    rows={3}
                                    className="w-full border p-2 rounded-lg text-sm resize-none focus:ring-blue-500"
                                    placeholder="Escriba el mensaje de la notificación..."
                                    value={form.Contenido}
                                    onChange={e => setForm({ ...form, Contenido: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2 border-t">
                                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500 font-medium">Cancelar</button>
                                <button onClick={handleCreate} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition">Enviar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de notificaciones */}
            <div className="space-y-3">
                {loading ? (
                    <p className="text-center py-10 text-gray-400">Cargando notificaciones...</p>
                ) : notifs.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <FaEnvelopeOpen className="mx-auto mb-3 text-4xl opacity-30" />
                        <p>No hay notificaciones.</p>
                    </div>
                ) : (
                    notifs.map(n => (
                        <div
                            key={n.ID_Notificacion}
                            className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${n.Leida ? 'bg-white border-gray-100 opacity-60' : 'bg-white border-blue-100 shadow-md'}`}
                        >
                            {/* Indicador de no leída */}
                            <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${n.Leida ? 'bg-gray-200' : 'bg-blue-500 animate-pulse'}`} />

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadge(n.Tipo)}`}>
                                        {n.Tipo}
                                    </span>
                                    {n.tipo_notificacion && (
                                        <span className="text-[10px] text-gray-400 italic">{n.tipo_notificacion.nombre_tipo}</span>
                                    )}
                                    <span className="text-xs text-gray-400 ml-auto">
                                        {new Date(n.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-700 font-medium">{n.Contenido}</p>
                                {n.personas && (
                                    <p className="text-xs text-gray-400 mt-1">→ {n.personas.nombre} {n.personas.apellido}</p>
                                )}
                            </div>

                            <div className="flex gap-2 items-center shrink-0">
                                {!n.Leida && (
                                    <button onClick={() => marcarLeida(n.ID_Notificacion)} title="Marcar como leída" className="text-blue-500 hover:text-blue-700 p-1.5 rounded-full hover:bg-blue-50 transition">
                                        <FaCheckDouble size={14} />
                                    </button>
                                )}
                                <button onClick={() => eliminar(n.ID_Notificacion)} title="Eliminar" className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition">
                                    <FaTrash size={13} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Layout>
    );
}


import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaBell, FaCheckDouble, FaTrash, FaPlus, FaEnvelopeOpen } from 'react-icons/fa';

/* Colores de badge según nombre del tipo */
const getBadgeColor = (tipo) => {
  const map = {
    'Alerta':        'bg-red-100 text-red-800 border-red-200',
    'Mantenimiento': 'bg-orange-100 text-orange-800 border-orange-200',
    'Sistema':       'bg-blue-100 text-blue-800 border-blue-200',
    'Reserva':       'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Información':   'bg-green-100 text-green-800 border-green-200',
  };
  return map[tipo] || 'bg-gray-100 text-gray-700 border-gray-200';
};

export default function Notificaciones() {
  const [notifs, setNotifs]         = useState([]);
  const [tiposNotif, setTiposNotif] = useState([]);
  const [personasList, setPersonasList] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  /* Estado del formulario — Tipo se llena automáticamente desde id_tipo */
  const [form, setForm] = useState({
    Tipo: '',
    Contenido: '',
    persona_id: '',
    id_tipo: '',
  });

  /* ── Init ── */
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('usuarios').select('persona_id').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.persona_id);
      }
    };
    init();
    loadAll();

    const channel = supabase
      .channel('rt_notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, loadAll)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /* ── Cargar datos ── */
  const loadAll = async () => {
    setLoading(true);
    try {
      /* Notificaciones: join personas (destinatario) y tipo_notificacion */
      const { data: nData, error: nErr } = await supabase
        .from('notificaciones')
        .select(`
          ID_Notificacion,
          Tipo,
          Contenido,
          Leida,
          created_at,
          persona_id,
          id_tipo,
          personas ( nombre, apellido ),
          tipo_notificacion ( id_tipo, nombre_tipo )
        `)
        .order('created_at', { ascending: false });

      if (nErr) console.error('Error cargando notificaciones:', nErr.message);
      setNotifs(nData || []);

      /* Tipos de notificación desde la BD */
      const { data: tData } = await supabase
        .from('tipo_notificacion')
        .select('id_tipo, nombre_tipo')
        .order('nombre_tipo');
      setTiposNotif(tData || []);

      /* Personas disponibles como destinatarios */
      const { data: pData } = await supabase
        .from('personas')
        .select('id, nombre, apellido')
        .order('nombre');
      setPersonasList(pData || []);

    } catch (e) {
      console.error('Error notificaciones:', e.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Cuando cambia id_tipo, sincroniza el campo Tipo (texto) ── */
  const handleTipoChange = (idTipo) => {
    const tipo = tiposNotif.find(t => String(t.id_tipo) === String(idTipo));
    setForm(f => ({
      ...f,
      id_tipo: idTipo,
      Tipo: tipo?.nombre_tipo || '',
    }));
  };

  /* ── Crear notificación ── */
  const handleCreate = async () => {
    if (!form.Contenido.trim()) return Swal.fire('Atención', 'El contenido es obligatorio.', 'warning');
    if (!form.id_tipo)          return Swal.fire('Atención', 'Selecciona un tipo de notificación.', 'warning');

    try {
      const payload = {
        Tipo:       form.Tipo,
        Contenido:  form.Contenido.trim(),
        Leida:      false,
        persona_id: form.persona_id || null,
        id_tipo:    parseInt(form.id_tipo),
      };

      const { error } = await supabase.from('notificaciones').insert([payload]);
      if (error) throw error;

      Swal.fire('Enviada', 'Notificación creada correctamente.', 'success');
      setShowModal(false);
      setForm({ Tipo: '', Contenido: '', persona_id: '', id_tipo: '' });
      loadAll();
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    }
  };

  /* ── Marcar una como leída ── */
  const marcarLeida = async (id) => {
    const { error } = await supabase
      .from('notificaciones')
      .update({ Leida: true })
      .eq('ID_Notificacion', id);
    if (error) console.error('marcarLeida error:', error.message);
    loadAll();
  };

  /* ── Marcar todas las no leídas como leídas ── */
  const marcarTodasLeidas = async () => {
    const ids = notifs.filter(n => !n.Leida).map(n => n.ID_Notificacion);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('notificaciones')
      .update({ Leida: true })
      .in('ID_Notificacion', ids);
    if (error) console.error('marcarTodasLeidas error:', error.message);
    loadAll();
  };

  /* ── Eliminar notificación ── */
  const eliminar = async (id) => {
    const r = await Swal.fire({
      title: '¿Eliminar notificación?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Eliminar',
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase
      .from('notificaciones')
      .delete()
      .eq('ID_Notificacion', id);
    if (error) Swal.fire('Error', error.message, 'error');
    else loadAll();
  };

  const noLeidas = notifs.filter(n => !n.Leida).length;

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <Layout>
      {/* Header */}
      <header className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-gray-900">Notificaciones</h2>
            {noLeidas > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                {noLeidas} nueva{noLeidas > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Centro de alertas y mensajes del sistema.</p>
        </div>
        <div className="flex gap-3">
          {noLeidas > 0 && (
            <button
              onClick={marcarTodasLeidas}
              className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium text-sm transition"
            >
              <FaCheckDouble /> Marcar todas leídas
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
          >
            <FaPlus /> Nueva Notificación
          </button>
        </div>
      </header>

      {/* ── Modal nueva notificación ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border-t-4 border-blue-600">
            <h3 className="text-xl font-bold mb-5 text-gray-800 flex items-center gap-2">
              <FaBell className="text-blue-600" /> Nueva Notificación
            </h3>
            <div className="space-y-4">

              {/* Tipo desde la BD — también llena el campo Tipo texto */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Tipo de Notificación *
                </label>
                <select
                  className="w-full border p-2 rounded-lg text-sm focus:ring-blue-500"
                  value={form.id_tipo}
                  onChange={e => handleTipoChange(e.target.value)}
                  required
                >
                  <option value="">— Seleccionar tipo —</option>
                  {tiposNotif.length === 0 && (
                    <option disabled>No hay tipos registrados en la BD</option>
                  )}
                  {tiposNotif.map(t => (
                    <option key={t.id_tipo} value={t.id_tipo}>{t.nombre_tipo}</option>
                  ))}
                </select>
              </div>

              {/* Destinatario */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Destinatario (opcional)
                </label>
                <select
                  className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:ring-blue-500"
                  value={form.persona_id}
                  onChange={e => setForm(f => ({ ...f, persona_id: e.target.value }))}
                >
                  <option value="">— General / Todos —</option>
                  {personasList.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
                  ))}
                </select>
              </div>

              {/* Contenido */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Contenido *
                </label>
                <textarea
                  rows={3}
                  className="w-full border p-2 rounded-lg text-sm resize-none focus:ring-blue-500"
                  placeholder="Escriba el mensaje de la notificación..."
                  value={form.Contenido}
                  onChange={e => setForm(f => ({ ...f, Contenido: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  onClick={() => { setShowModal(false); setForm({ Tipo: '', Contenido: '', persona_id: '', id_tipo: '' }); }}
                  className="px-4 py-2 text-gray-500 font-medium hover:bg-gray-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de notificaciones ── */}
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
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                n.Leida ? 'bg-white border-gray-100 opacity-60' : 'bg-white border-blue-100 shadow-md'
              }`}
            >
              {/* Indicador no leída */}
              <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${n.Leida ? 'bg-gray-200' : 'bg-blue-500 animate-pulse'}`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* Badge de tipo */}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeColor(n.Tipo || n.tipo_notificacion?.nombre_tipo)}`}>
                    {n.tipo_notificacion?.nombre_tipo || n.Tipo || 'Sin tipo'}
                  </span>

                  {/* Destinatario */}
                  {n.personas && (
                    <span className="text-[10px] text-gray-400 italic">
                      → {n.personas.nombre} {n.personas.apellido}
                    </span>
                  )}

                  {/* Fecha */}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(n.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 font-medium">{n.Contenido}</p>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 items-center shrink-0">
                {!n.Leida && (
                  <button
                    onClick={() => marcarLeida(n.ID_Notificacion)}
                    title="Marcar como leída"
                    className="text-blue-500 hover:text-blue-700 p-1.5 rounded-full hover:bg-blue-50 transition"
                  >
                    <FaCheckDouble size={14} />
                  </button>
                )}
                <button
                  onClick={() => eliminar(n.ID_Notificacion)}
                  title="Eliminar"
                  className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition"
                >
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

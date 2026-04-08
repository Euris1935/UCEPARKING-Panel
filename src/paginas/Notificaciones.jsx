import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaBell, FaCheckDouble, FaTrash, FaPlus, FaEnvelopeOpen, FaSearch, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

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
  const { orgId } = useOrg();
  const [notifs, setNotifs]         = useState([]);
  const [tiposNotif, setTiposNotif] = useState([]);
  const [personasList, setPersonasList] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  /* Estado del formulario — Tipo se llena automáticamente desde id_tipo */
  const [form, setForm] = useState({
    Tipo: '',
    Contenido: '',
    id_persona: '',
    id_tipo: '',
  });

  /* ── Init ── */
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('usuarios').select('id_persona').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.id_persona);
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
    setIsRefreshing(true);
    try {
      /* Notificaciones: join personas (destinatario) y tipo_notificacion */
      const { data: nData, error: nErr } = await supabase
        .from('notificaciones')
        .select(`
          ID_Notificacion,
          Contenido,
          Leida,
          created_at,
          id_persona,
          id_tipo,
          personas ( nombre, apellido ),
          tipo_notificacion ( id_tipo, nombre_tipo )
        `)
        .order('created_at', { ascending: false });

      if (nErr) {
        console.error('Error cargando notificaciones:', nErr.message);
        Swal.fire('Error Interno BD', 'No se pudieron cargar las notificaciones: ' + nErr.message + ' (' + nErr.code + ')', 'error');
      }
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
        .select('id_persona, nombre, apellido')
        .order('nombre');
      setPersonasList(pData || []);

    } catch (e) {
      console.error('Error notificaciones:', e.message);
      Swal.fire('Error Catastrófico', 'La carga se interrumpió y falló: ' + e.message, 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const registrarLog = async (tipo, descripcion) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Alertas').maybeSingle();
      await supabase.from('eventos').insert([{ 
        Fecha_Hora: new Date().toISOString(), 
        Descripcion: descripcion, 
        id_persona: currentPersonaId, 
        id_tipo_evento: te?.id_tipo || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
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
        Contenido:  form.Contenido.trim(),
        Leida:      false,
        id_persona: form.id_persona || null,
        id_tipo:    parseInt(form.id_tipo),
        organizacion_id: orgId
      };

      const { error } = await supabase.from('notificaciones').insert([payload]);
      if (error) throw error;

      Swal.fire('Enviada', 'Notificación creada correctamente.', 'success');
      const p = personasList.find(p => p.id_persona === form.id_persona);
      const t = tiposNotif.find(t => t.id_tipo === parseInt(form.id_tipo));
      registrarLog('Alerta', `Envío de notificación (${t?.nombre_tipo}): ${form.Contenido.substring(0, 30)}... ${p ? 'a ' + p.nombre : 'a todos'}`);
      
      setShowModal(false);
      setForm({ Tipo: '', Contenido: '', id_persona: '', id_tipo: '' });
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
    if (error) {
        console.error('marcarLeida error:', error.message);
        Swal.fire('Error', 'No se pudo marcar como leída: ' + error.message, 'error');
    }
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
    if (error) {
        console.error('marcarTodasLeidas error:', error.message);
        Swal.fire('Error', 'No se pudieron actualizar: ' + error.message, 'error');
    }
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
      
    if (error) {
        Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error');
    } else {
        const n = notifs.find(n => n.ID_Notificacion === id);
        registrarLog('Alerta', `Notificación eliminada: ${n?.Contenido?.substring(0, 30)}...`);
        loadAll();
    }
  };

  const noLeidas = notifs.filter(n => !n.Leida).length;

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  const filteredNotifs = notifs.filter(n => {
    const text = searchTerm.toLowerCase();
    const dest = n.personas ? `${n.personas.nombre} ${n.personas.apellido}`.toLowerCase() : '';
    return n.Contenido?.toLowerCase().includes(text) || n.tipo_notificacion?.nombre_tipo?.toLowerCase().includes(text) || dest.includes(text);
  });

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <Layout>
      {/* Header */}
      <header className="mb-8 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Notificaciones</h2>
            {noLeidas > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                {noLeidas} nueva{noLeidas > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-gray-500 font-medium mt-1">Centro de alertas y mensajes del sistema.</p>
        </div>
        <div className="flex gap-3">
          {noLeidas > 0 && (
            <button
              onClick={marcarTodasLeidas}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-wide shadow-sm transition"
            >
              <FaCheckDouble size={14}/> Marcar todas leídas
            </button>
          )}
          {!showModal && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition duration-150"
          >
            <FaPlus /> Nueva Notificación
          </button>
          )}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Lista de notificaciones ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            {/* Buscador superior */}
            <div className="flex justify-between items-center mb-6">
                <div className="relative w-72">
                    <input
                        type="text"
                        placeholder="Buscar notificaciones..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <FaSearch className="absolute left-3 top-3 text-gray-400" />
                </div>
                <button
                    onClick={loadAll}
                    disabled={isRefreshing}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                    title="Refrescar lista"
                >
                    <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
              {loading && notifs.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm italic">Cargando notificaciones...</p>
              ) : filteredNotifs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <FaEnvelopeOpen className="mx-auto mb-3 text-4xl opacity-30" />
                  <p className="text-sm italic">No hay notificaciones.</p>
                </div>
              ) : (
                filteredNotifs.map(n => (
                  <div
                    key={n.ID_Notificacion}
                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 group ${
                      n.Leida ? 'bg-gray-50 border-gray-100 opacity-75' : 'bg-white border-blue-100 shadow'
                    }`}
                  >
                    {/* Indicador no leída */}
                    <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${n.Leida ? 'bg-gray-200' : 'bg-blue-500'}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {/* Badge de tipo */}
                        <span className={`px-2 py-0.5 rounded border uppercase tracking-tighter text-[10px] font-bold ${getBadgeColor(n.Tipo || n.tipo_notificacion?.nombre_tipo)}`}>
                          {n.tipo_notificacion?.nombre_tipo || n.Tipo || 'Sin tipo'}
                        </span>

                        {/* Destinatario */}
                        {n.personas && (
                          <span className="text-[10px] text-gray-400 italic">
                            → {n.personas.nombre} {n.personas.apellido}
                          </span>
                        )}

                        {/* Fecha */}
                        <span className="text-[10px] font-bold text-gray-400 ml-auto uppercase tracking-wide">
                          {new Date(n.created_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className={`text-sm ${n.Leida ? 'text-gray-500 font-medium' : 'text-gray-800 font-bold'}`}>{n.Contenido}</p>
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-2 items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.Leida && (
                        <button
                          onClick={() => marcarLeida(n.ID_Notificacion)}
                          title="Marcar como leída"
                          className="text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition border border-transparent hover:border-blue-200"
                        >
                          <FaCheckDouble size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => eliminar(n.ID_Notificacion)}
                        title="Eliminar"
                        className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition border border-transparent hover:border-red-200"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Panel lateral (Formulario) ── */}
        {showModal && (
        <aside className="w-full lg:w-[400px] flex-shrink-0">
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <FaBell className="text-blue-600" /> Nueva Notificación
                    </h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                        <FaTimesCircle size={18} />
                    </button>
                </div>

                <div className="space-y-4">

                    {/* Tipo desde la BD */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                            Tipo de Notificación *
                        </label>
                        <SearchableSelect
                            options={tiposNotif.map(t => ({ value: t.id_tipo, label: t.nombre_tipo }))}
                            value={form.id_tipo}
                            onChange={(val) => handleTipoChange(val)}
                            placeholder="— Tipo —"
                            focusRingClass="focus:ring-blue-500"
                            selectedItemClass="bg-blue-100 text-blue-800"
                            className="bg-gray-50/50"
                        />
                    </div>

                    {/* Destinatario */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                            Destinatario (opcional)
                        </label>
                        <SearchableSelect
                            options={[
                                { value: "", label: "— General / Todos —" },
                                ...personasList.map(p => ({ value: p.id_persona, label: `${p.nombre} ${p.apellido}` }))
                            ]}
                            value={form.id_persona}
                            onChange={(val) => setForm(f => ({ ...f, id_persona: val }))}
                            placeholder="— General / Todos —"
                            focusRingClass="focus:ring-blue-500"
                            selectedItemClass="bg-blue-100 text-blue-800"
                            className="bg-gray-50/50"
                        />
                    </div>

                    {/* Contenido */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                            Contenido *
                        </label>
                        <textarea
                            rows={3}
                            className="w-full border p-2 rounded-lg text-sm resize-none focus:ring-blue-500 bg-gray-50 outline-none"
                            placeholder="Escriba el mensaje de la notificación..."
                            value={form.Contenido}
                            onChange={e => setForm(f => ({ ...f, Contenido: e.target.value }))}
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleCreate}
                            className="w-full py-3 bg-blue-600 text-white flex justify-center items-center gap-2 rounded-lg hover:bg-blue-700 transition shadow-md font-black uppercase text-[10px] tracking-wide"
                        >
                            ENVIAR NOTIFICACIÓN
                        </button>
                    </div>
                </div>
            </section>
        </aside>
        )}

      </div>
    </Layout>
  );
}

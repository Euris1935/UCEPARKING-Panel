import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaBell, FaCheckDouble, FaTrash, FaPlus, FaEnvelopeOpen, FaSearch, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';

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
    if (orgId) {
      loadAll();
      const channel = supabase
        .channel('rt_notifs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacion' }, loadAll)
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [orgId]);

  /* ── Cargar datos ── */
  const loadAll = async () => {
    setIsRefreshing(true);
    try {
      const [
        { data: nData, error: nErr },
        { data: tData },
        { data: uData, error: uErr }
      ] = await Promise.all([
        supabase.from('notificacion').select(`
          id_notificacion, contenido, leida, created_at, id_persona, id_tipo,
          persona ( nombre, apellido ),
          tipo_notificacion ( id_tipo, nombre )
        `).eq('organizacion_id', orgId).order('created_at', { ascending: false }),
        supabase.from('tipo_notificacion').select('id_tipo, nombre').order('nombre'),
        supabase.rpc('get_usuarios_org')
      ]);

      if (nErr) throw nErr;
      
      setNotifs((nData || []).map(n => ({
        ...n,
        tipo: { id: n.tipo_notificacion?.id_tipo, nombre: n.tipo_notificacion?.nombre }
      })));

      setTiposNotif(tData?.map(t => ({ id: t.id_tipo, nombre: t.nombre })) || []);

      if (uErr) {
        const { data: fData } = await supabase.from('usuario').select('id_persona, persona(nombre, apellido)').eq('organizacion_id', orgId);
        setPersonasList((fData || []).map(u => ({
           id_persona: u.id_persona,
           nombre: u.persona?.nombre || 'N/D',
           apellido: u.persona?.apellido || ''
        })));
      } else {
        setPersonasList((uData || []).map(u => ({
          id_persona: u.id_persona || u.persona_id,
          nombre: u.nombre,
          apellido: u.apellido
        })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }

    } catch (e) {
      console.error('Error notificaciones:', e.message);
      Swal.fire('Error Catastrófico', 'La carga se interrumpió y falló: ' + e.message, 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRegistrarLog = async (tipo_nombre, descripcion) => {
    if (!currentPersonaId) return;
    await registrarLog({
      tipo_nombre,
      descripcion,
      id_persona: currentPersonaId,
      organizacion_id: orgId,
      origen: 'Panel Web - Notificaciones'
    });
  };

  /* ── Cuando cambia id_tipo, sincroniza el campo Tipo (texto) ── */
  const handleTipoChange = (idTipo) => {
    const tipo = tiposNotif.find(t => String(t.id) === String(idTipo));
    setForm(f => ({
      ...f,
      id_tipo: idTipo,
      Tipo: tipo?.nombre || '',
    }));
  };

  /* ── Crear notificación ── */
  const handleCreate = async () => {
    if (!form.Contenido.trim()) return Swal.fire('Atención', 'El contenido es obligatorio.', 'warning');
    if (!form.id_tipo)          return Swal.fire('Atención', 'Selecciona un tipo de notificación.', 'warning');

    try {
      const payload = {
        contenido:       form.Contenido.trim(),
        leida:           false,
        id_persona:      form.id_persona || null,
        id_tipo:         parseInt(form.id_tipo),
        organizacion_id: orgId
      };

      const { error } = await supabase.from('notificacion').insert([payload]);
      if (error) throw error;

      Swal.fire('Enviada', 'Notificación creada correctamente.', 'success');
      const p = personasList.find(p => p.id_persona === form.id_persona);
      const t = tiposNotif.find(t => t.id === parseInt(form.id_tipo));
      await handleRegistrarLog(EVENT_TYPES.ALERTA, `Envío de notificación (${t?.nombre}): ${form.Contenido.substring(0, 30)}... ${p ? 'a ' + p.nombre : 'a todos'}`);
      
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
      .from('notificacion')
      .update({ leida: true })
      .eq('id_notificacion', id);
    if (error) {
        console.error('marcarLeida error:', error.message);
        Swal.fire('Error', 'No se pudo marcar como leída: ' + error.message, 'error');
    }
    loadAll();
  };

  /* ── Marcar todas las no leídas como leídas ── */
  const marcarTodasLeidas = async () => {
    const ids = notifs.filter(n => !n.leida).map(n => n.id_notificacion);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('notificacion')
      .update({ leida: true })
      .in('id_notificacion', ids);
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
      .from('notificacion')
      .delete()
      .eq('id_notificacion', id);
      
    if (error) {
        Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error');
    } else {
        const n = notifs.find(n => n.id_notificacion === id);
        await handleRegistrarLog(EVENT_TYPES.ALERTA, `Notificación eliminada: ${n?.contenido?.substring(0, 30)}...`);
        loadAll();
    }
  };

  const noLeidas = notifs.filter(n => !n.leida).length;

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  const filteredNotifs = notifs.filter(n => {
    const text = searchTerm.toLowerCase();
    const dest = n.persona ? `${n.persona.nombre} ${n.persona.apellido}`.toLowerCase() : '';
    return n.mensaje?.toLowerCase().includes(text) || n.tipo?.nombre?.toLowerCase().includes(text) || dest.includes(text);
  });

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Centro de Notificaciones</h2>
          <p className="text-gray-500 font-medium">Gestión de alertas y comunicados para usuarios.</p>
        </div>
        <div className="flex gap-2">
          {noLeidas > 0 && (
            <button
              onClick={marcarTodasLeidas}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-lg font-bold transition"
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
                  <div key={n.id_notificacion} className={`p-4 transition hover:bg-gray-50/50 ${!n.leida ? 'bg-blue-50/30 border-l-4 border-blue-500' : ''}`}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-grow">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeColor(n.tipo?.nombre)}`}>
                            {n.tipo?.nombre}
                          </span>
                          {!n.leida && (
                            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                          )}
                        </div>
                        <p className={`text-sm leading-relaxed ${!n.leida ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                          {n.contenido}
                        </p>
                        <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
                          <span className="font-mono">{new Date(n.created_at).toLocaleString('es-DO')}</span>
                          <span className="flex items-center gap-1 font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            Destinatario: {n.persona ? `${n.persona.nombre} ${n.persona.apellido}` : 'Todos'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!n.leida && (
                          <button
                            onClick={() => marcarLeida(n.id_notificacion)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                            title="Marcar leída"
                          >
                            <FaCheckDouble size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => eliminar(n.id_notificacion)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
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
                            options={tiposNotif.map(t => ({ value: t.id, label: t.nombre }))}
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

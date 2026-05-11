import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaTv, FaPlus, FaEdit, FaTrash, FaSync, FaSearch,
  FaTimesCircle, FaSave, FaMapMarkerAlt
} from 'react-icons/fa';
import { pantallaApi } from '../lib/api';
import { useOrg } from '../contexts/OrgContext';

const EMPTY_FORM = { capacidad_total: '', id_plaza: '', id_zona: '' };

export default function Pantallas() {
  const { orgId } = useOrg();

  const [pantallas, setPantallas]   = useState([]);
  const [plazas, setPlazas]         = useState([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Panel lateral
  const [showPanel, setShowPanel]   = useState(false);
  const [editing, setEditing]       = useState(null); // null = nuevo, object = editar
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  const loadPantallas = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await pantallaApi.list();
      if (!res.ok) throw new Error(res.error || 'Error al cargar pantallas');
      setPantallas(res.data || []);
    } catch (err) {
      console.error('[Pantallas] load:', err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const loadPlazas = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('plaza')
        .select('id_plaza, numero_plaza, id_zona, zona:id_zona(nombre)')
        .eq('organizacion_id', orgId)
        .order('numero_plaza');
      if (error) throw error;
      setPlazas(data || []);
    } catch (err) {
      console.error('[Pantallas] plazas:', err.message);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      loadPantallas();
      loadPlazas();
    }
  }, [orgId, loadPantallas, loadPlazas]);

  // ── Formulario ────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowPanel(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      capacidad_total: p.capacidad_total ?? '',
      id_plaza:        p.id_plaza        ?? '',
      id_zona:         p.id_zona         ?? '',
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handlePlazaChange = (e) => {
    const plazaId = Number(e.target.value);
    const plazaObj = plazas.find(p => p.id_plaza === plazaId);
    setForm(f => ({
      ...f,
      id_plaza: plazaId || '',
      id_zona:  plazaObj?.id_zona || '',
    }));
  };

  const handleSave = async () => {
    if (!form.capacidad_total || Number(form.capacidad_total) <= 0) {
      return Swal.fire('Atención', 'La capacidad total debe ser mayor a 0.', 'warning');
    }
    if (!form.id_plaza) {
      return Swal.fire('Atención', 'Debes seleccionar una plaza.', 'warning');
    }

    setSaving(true);
    try {
      const body = {
        capacidad_total: Number(form.capacidad_total),
        id_plaza:        Number(form.id_plaza),
        id_zona:         form.id_zona ? Number(form.id_zona) : undefined,
      };

      let res;
      if (editing) {
        res = await pantallaApi.update(editing.id_pantalla, body);
      } else {
        res = await pantallaApi.create(body);
      }

      if (!res.ok) throw new Error(res.error || 'Error al guardar');

      Swal.fire('Guardado', editing ? 'Pantalla actualizada.' : 'Pantalla creada.', 'success');
      closePanel();
      loadPantallas();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    const confirm = await Swal.fire({
      title: `¿Eliminar pantalla #${p.id_pantalla}?`,
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await pantallaApi.remove(p.id_pantalla);
      if (!res.ok) throw new Error(res.error);
      Swal.fire('Eliminada', 'Pantalla eliminada correctamente.', 'success');
      loadPantallas();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // ── Filtro ────────────────────────────────────────────────────────────────
  const filtered = pantallas.filter(p => {
    const q = searchTerm.toLowerCase();
    return (
      String(p.id_pantalla).includes(q) ||
      String(p.capacidad_total).includes(q) ||
      (p.plaza?.numero_plaza || '').toLowerCase().includes(q) ||
      (p.zona?.nombre || '').toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <FaTv className="text-blue-600" /> Pantallas Informativas
          </h2>
          <p className="text-gray-500 font-medium mt-1">
            Configuración de pantallas por plaza de parqueo.
          </p>
        </div>
        {!showPanel && (
          <button
            onClick={openNew}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition"
          >
            <FaPlus /> Nueva Pantalla
          </button>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Tabla ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">

            {/* Barra de búsqueda + refresh */}
            <div className="flex justify-between items-center mb-6">
              <div className="relative w-72">
                <input
                  type="text"
                  placeholder="Buscar por ID, plaza, zona..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
              </div>
              <button
                onClick={loadPantallas}
                disabled={isRefreshing}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                title="Refrescar"
              >
                <FaSync className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">ID</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Capacidad</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Plaza</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Zona</th>
                    <th className="px-6 py-3 text-center font-black text-gray-500 uppercase tracking-widest text-[10px]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-gray-500 italic text-sm">
                        {pantallas.length === 0
                          ? 'No hay pantallas registradas. Crea la primera.'
                          : 'No hay resultados para tu búsqueda.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(p => (
                      <tr key={p.id_pantalla} className="hover:bg-blue-50/20 transition group">
                        <td className="px-6 py-4">
                          <span className="bg-blue-100 text-blue-700 font-bold text-xs px-2 py-1 rounded-lg">
                            #{p.id_pantalla}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-gray-800">{p.capacidad_total}</span>
                          <span className="text-gray-400 text-xs ml-1">unidades</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FaMapMarkerAlt className="text-blue-400 shrink-0" />
                            <span className="font-semibold text-gray-700 text-sm">
                              {p.plaza?.numero_plaza || `Plaza #${p.id_plaza}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {p.zona?.nombre || (p.id_zona ? `Zona #${p.id_zona}` : '—')}
                        </td>
                        <td className="px-6 py-4 flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={() => openEdit(p)}
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-2 rounded transition"
                            title="Editar"
                          >
                            <FaEdit size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition"
                            title="Eliminar"
                          >
                            <FaTrash size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer con contador */}
            <div className="mt-4 text-xs text-gray-400 font-medium">
              {filtered.length} pantalla(s) mostrada(s){searchTerm && ` de ${pantallas.length} totales`}
            </div>
          </div>
        </div>

        {/* ── Panel lateral Formulario ── */}
        {showPanel && (
          <aside className="w-full lg:w-[380px] flex-shrink-0">
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                  <FaTv className="text-blue-600" />
                  {editing ? `Editar Pantalla #${editing.id_pantalla}` : 'Nueva Pantalla'}
                </h3>
                <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                  <FaTimesCircle size={18} />
                </button>
              </div>

              <div className="space-y-4">

                {/* Plaza (requerida) */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                    Plaza *
                  </label>
                  <select
                    className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={form.id_plaza}
                    onChange={handlePlazaChange}
                  >
                    <option value="">— Seleccionar Plaza —</option>
                    {plazas.map(pl => (
                      <option key={pl.id_plaza} value={pl.id_plaza}>
                        {pl.numero_plaza}
                        {pl.zona?.nombre ? ` — ${pl.zona.nombre}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Zona (auto-completada, readonly informativo) */}
                {form.id_zona && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
                    <FaMapMarkerAlt className="text-blue-400 shrink-0" />
                    <span className="text-xs text-blue-700 font-semibold">
                      Zona: {plazas.find(p => p.id_plaza === Number(form.id_plaza))?.zona?.nombre || `#${form.id_zona}`}
                    </span>
                  </div>
                )}

                {/* Capacidad Total */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                    Capacidad Total *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: 50"
                    value={form.capacidad_total}
                    onChange={e => setForm(f => ({ ...f, capacidad_total: e.target.value }))}
                  />
                </div>

                {/* Botones */}
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-3 bg-blue-600 text-white flex justify-center items-center gap-2 rounded-lg hover:bg-blue-700 transition shadow-md font-black uppercase text-[10px] tracking-wide disabled:opacity-60"
                  >
                    <FaSave />
                    {saving ? 'GUARDANDO...' : editing ? 'ACTUALIZAR PANTALLA' : 'CREAR PANTALLA'}
                  </button>
                  <button
                    onClick={closePanel}
                    className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition font-black uppercase text-[10px] tracking-wide"
                  >
                    Cancelar
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

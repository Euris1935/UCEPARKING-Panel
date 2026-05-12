import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaTv, FaPlus, FaEdit, FaTrash, FaSync, FaSearch,
  FaTimesCircle, FaSave, FaMapMarkerAlt, FaLayerGroup
} from 'react-icons/fa';
import { pantallaApi } from '../lib/api';
import { useOrg } from '../contexts/OrgContext';

// modo: 'plaza' | 'zona'
const EMPTY_FORM = { capacidad_total: '', id_plaza: '', id_zona: '', modo: 'zona' };

export default function Pantallas() {
  const { orgId } = useOrg();

  const [pantallas,    setPantallas]    = useState([]);
  const [plazas,       setPlazas]       = useState([]);
  const [zonas,        setZonas]        = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm,   setSearchTerm]   = useState('');

  const [showPanel, setShowPanel] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  // ── Carga de datos ──────────────────────────────────────────────────────────
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

  const loadCatalogos = useCallback(async () => {
    if (!orgId) return;
    try {
      const [plazaRes, zonaRes] = await Promise.all([
        supabase
          .from('plaza')
          .select('id_plaza, numero_plaza, id_zona, zona:id_zona(nombre)')
          .eq('organizacion_id', orgId)
          .order('numero_plaza'),
        supabase
          .from('zona')
          .select('id_zona, nombre, id_estado')
          .eq('organizacion_id', orgId)
          .eq('id_estado', 1)      // solo zonas activas
          .order('nombre'),
      ]);
      if (!plazaRes.error) setPlazas(plazaRes.data || []);
      if (!zonaRes.error)  setZonas(zonaRes.data  || []);
    } catch (err) {
      console.error('[Pantallas] catálogos:', err.message);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      loadPantallas();
      loadCatalogos();
    }
  }, [orgId, loadPantallas, loadCatalogos]);

  // ── Helpers de formulario ───────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowPanel(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    // Detectar modo: si tiene plaza específica → modo plaza; si solo zona → modo zona
    const modo = p.id_plaza ? 'plaza' : 'zona';
    setForm({
      capacidad_total: p.capacidad_total ?? '',
      id_plaza:        p.id_plaza        ?? '',
      id_zona:         p.id_zona         ?? '',
      modo,
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleModoChange = (modo) => {
    setForm(f => ({ ...f, modo, id_plaza: '', id_zona: '' }));
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

  const handleZonaChange = (e) => {
    setForm(f => ({ ...f, id_zona: Number(e.target.value) || '', id_plaza: '' }));
  };

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.capacidad_total || Number(form.capacidad_total) <= 0) {
      return Swal.fire('Atención', 'La capacidad total debe ser mayor a 0.', 'warning');
    }
    if (form.modo === 'plaza' && !form.id_plaza) {
      return Swal.fire('Atención', 'Debes seleccionar una plaza.', 'warning');
    }
    if (form.modo === 'zona' && !form.id_zona) {
      return Swal.fire('Atención', 'Debes seleccionar una zona.', 'warning');
    }

    setSaving(true);
    try {
      const body = { capacidad_total: Number(form.capacidad_total) };

      if (form.modo === 'plaza') {
        body.id_plaza = Number(form.id_plaza);
        // id_zona se infiere en el backend desde la plaza
      } else {
        body.id_zona  = Number(form.id_zona);
        body.id_plaza = null; // limpiar plaza si se cambia a modo zona
      }

      const res = editing
        ? await pantallaApi.update(editing.id_pantalla, body)
        : await pantallaApi.create(body);

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

  // ── Eliminar ───────────────────────────────────────────────────────────────
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

  // ── Helpers de display ─────────────────────────────────────────────────────
  const getTipoBadge = (p) => {
    if (p.id_plaza) {
      return (
        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
          <FaMapMarkerAlt size={8} /> Plaza
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
        <FaLayerGroup size={8} /> Zona
      </span>
    );
  };

  const getAsignacionLabel = (p) => {
    if (p.id_plaza) return p.plaza?.numero_plaza || `Plaza #${p.id_plaza}`;
    if (p.id_zona)  return p.zona?.nombre        || `Zona #${p.id_zona}`;
    return '—';
  };

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const filtered = pantallas.filter(p => {
    const q = searchTerm.toLowerCase();
    return (
      String(p.id_pantalla).includes(q) ||
      String(p.capacidad_total).includes(q) ||
      (p.plaza?.numero_plaza || '').toLowerCase().includes(q) ||
      (p.zona?.nombre || '').toLowerCase().includes(q)
    );
  });

  // ── UI del formulario para la zona seleccionada ────────────────────────────
  const zonaInfoLabel = () => {
    if (form.modo === 'plaza' && form.id_zona) {
      const z = plazas.find(p => p.id_plaza === Number(form.id_plaza))?.zona;
      return z?.nombre || `Zona #${form.id_zona}`;
    }
    return null;
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <FaTv className="text-blue-600" /> Pantallas Informativas
          </h2>
          <p className="text-gray-500 font-medium mt-1">
            Configura pantallas por <strong>zona</strong> (toda la zona) o por <strong>plaza específica</strong>.
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

        {/* ── Tabla ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">

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
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Tipo</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Asignado a</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Zona</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Capacidad</th>
                    <th className="px-6 py-3 text-center font-black text-gray-500 uppercase tracking-widest text-[10px]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-gray-500 italic text-sm">
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
                          {getTipoBadge(p)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {p.id_plaza
                              ? <FaMapMarkerAlt className="text-blue-400 shrink-0" />
                              : <FaLayerGroup   className="text-purple-400 shrink-0" />}
                            <span className="font-semibold text-gray-700 text-sm">
                              {getAsignacionLabel(p)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {p.zona?.nombre || (p.id_zona ? `Zona #${p.id_zona}` : '—')}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-gray-800">{p.capacidad_total}</span>
                          <span className="text-gray-400 text-xs ml-1">uds.</span>
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

            <div className="mt-4 text-xs text-gray-400 font-medium">
              {filtered.length} pantalla(s){searchTerm && ` de ${pantallas.length} totales`}
              {pantallas.length > 0 && (
                <span className="ml-3">
                  · <span className="text-blue-500">{pantallas.filter(p => p.id_plaza).length} por plaza</span>
                  {' '}· <span className="text-purple-500">{pantallas.filter(p => !p.id_plaza && p.id_zona).length} por zona</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Panel lateral ─────────────────────────────────────────────────── */}
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

                {/* ── Toggle Modo ─────────────────────────────────────────── */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">
                    Asignar pantalla a *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModoChange('zona')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold border-2 transition ${
                        form.modo === 'zona'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <FaLayerGroup /> Zona completa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModoChange('plaza')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold border-2 transition ${
                        form.modo === 'plaza'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <FaMapMarkerAlt /> Plaza específica
                    </button>
                  </div>
                </div>

                {/* ── Selector condicional ─────────────────────────────────── */}
                {form.modo === 'zona' ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Zona *
                    </label>
                    <select
                      className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-purple-500 focus:border-purple-500"
                      value={form.id_zona}
                      onChange={handleZonaChange}
                    >
                      <option value="">— Seleccionar Zona —</option>
                      {zonas.map(z => (
                        <option key={z.id_zona} value={z.id_zona}>{z.nombre}</option>
                      ))}
                    </select>
                    {form.id_zona && (
                      <p className="text-[10px] text-purple-600 font-semibold mt-1 flex items-center gap-1">
                        <FaLayerGroup size={9} />
                        Pantalla abarcará toda la zona seleccionada
                      </p>
                    )}
                  </div>
                ) : (
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
                          {pl.numero_plaza}{pl.zona?.nombre ? ` — ${pl.zona.nombre}` : ''}
                        </option>
                      ))}
                    </select>
                    {/* Zona heredada de la plaza */}
                    {zonaInfoLabel() && (
                      <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
                        <FaLayerGroup className="text-blue-400 shrink-0" size={11} />
                        <span className="text-xs text-blue-700 font-semibold">
                          Zona: {zonaInfoLabel()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Capacidad Total ──────────────────────────────────────── */}
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

                {/* ── Botones ──────────────────────────────────────────────── */}
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

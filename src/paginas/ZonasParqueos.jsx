

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave, FaArrowsAltH, FaArrowsAltV } from 'react-icons/fa';

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null);
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);

  // --- ESTADOS DE PLAZAS ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '', Amplitud: '2.50', Longitud: '5.00' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data: zData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
      setZonas(zData || []);

      const { data: pData } = await supabase.from('plazas').select(`*, estado_plaza(nombre_estado)`).order('Numero_Plaza');
      setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  /* ── Helper: obtiene las iniciales de las palabras del nombre ──
     Ej: "Zona Especial" → "ZE", "Piso 1 Norte" → "P1N"
     Palabras de 2 caracteres o menos (artículos, preposiciones) se excluyen si hay otras más largas.
  */
  const generarIniciales = (nombre) => {
    const palabras = nombre.trim().split(/\s+/);
    // Intentar excluir palabras triviales si hay al menos 2 palabras sustantivas
    const triviales = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en'];
    let sustantivas = palabras.filter(p => !triviales.includes(p.toLowerCase()));
    if (sustantivas.length === 0) sustantivas = palabras;
    return sustantivas.map(p => p[0].toUpperCase()).join('');
  };

  /* ── Generar plazas en lote para una zona ── */
  const generarPlazasEnLote = async (idZona, nombreZona, capacidad, idLibre) => {
    const prefijo = generarIniciales(nombreZona);
    // Obtener plazas existentes para no duplicar
    const { data: existentes } = await supabase.from('plazas').select('Numero_Plaza').eq('Id_Zona', idZona);
    const codigosExistentes = new Set((existentes || []).map(p => p.Numero_Plaza));

    const lote = [];
    let seq = 1;
    let insertadas = 0;
    while (insertadas < capacidad) {
      const codigo = `${prefijo}-${String(seq).padStart(2, '0')}`;
      if (!codigosExistentes.has(codigo)) {
        lote.push({
          Numero_Plaza: codigo,
          Id_Zona: idZona,
          id_estado: idLibre,
          Estado_Actual: 'LIBRE',
          Amplitud: 2.50,
          Longitud: 5.00
        });
        insertadas++;
      }
      seq++;
      if (seq > capacidad * 3) break; // Salvaguarda ante bucle infinito
    }

    const { error } = await supabase.from('plazas').insert(lote);
    if (error) throw error;
    return { prefijo, total: lote.length };
  };

  /* ── Acciones de zonas ── */
  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    if (parseInt(zoneForm.Capacidad_Total) <= 0) return Swal.fire('Error', "Capacidad debe ser > 0.", 'warning');

    const payload = { Nombre_Zona: zoneForm.Nombre_Zona.trim(), Capacidad_Total: parseInt(zoneForm.Capacidad_Total) };
    const estaCreando = !editingZone;

    // Si es nueva zona, previsualizar el código y pedir confirmación
    if (estaCreando) {
      const prefijo = generarIniciales(zoneForm.Nombre_Zona);
      const cap = parseInt(zoneForm.Capacidad_Total);
      const ejemplos = Array.from({ length: Math.min(cap, 3) }, (_, i) =>
        `${prefijo}-${String(i + 1).padStart(2, '0')}`).join(', ');

      const confirm = await Swal.fire({
        title: '¿Generar plazas automáticamente?',
        html: `Se crearán <b>${cap} plazas</b> con códigos:<br/>
               <code class="text-sm bg-gray-100 px-2 py-1 rounded">${ejemplos}${cap > 3 ? ` ... ${prefijo}-${String(cap).padStart(2, '0')}` : ''}</code>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: '⚡ Crear zona y plazas',
        cancelButtonText: 'Solo crear la zona'
      });

      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        // 1. Crear la zona y obtener su ID
        const { data: zonaCreada, error: errZ } = await supabase
          .from('zonas_estacionamiento').insert([payload]).select().single();
        if (errZ) throw errZ;

        if (confirm.isConfirmed) {
          // 2. Obtener el id del estado LIBRE
          const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'LIBRE').maybeSingle();
          const idLibre = est?.id_estado || 1;
          // 3. Generar plazas en lote
          const { total } = await generarPlazasEnLote(zonaCreada.Id_Zona, zonaCreada.Nombre_Zona, cap, idLibre);
          Swal.fire('✅ Éxito', `Zona creada con ${total} plazas generadas automáticamente.`, 'success');
        } else {
          Swal.fire('✅ Zona creada', 'Puedes agregar plazas manualmente cuando quieras.', 'success');
        }

        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }

    } else {
      // Editar zona existente (no genera plazas, solo actualiza datos)
      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        const { error } = await supabase.from('zonas_estacionamiento').update(payload).eq('Id_Zona', editingZone.Id_Zona);
        if (error) throw error;
        Swal.fire('Éxito', 'Zona actualizada.', 'success');
        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
    }
  };

  /* ── Generar plazas para zona existente (botón en tabla) ── */
  const handleGenerarPlazasExistente = async (zona) => {
    const plazasActuales = plazas.filter(p => p.Id_Zona === zona.Id_Zona).length;
    const faltantes = zona.Capacidad_Total - plazasActuales;

    if (faltantes <= 0) {
      return Swal.fire('Sin cambios', `Esta zona ya tiene ${plazasActuales} plazas (capacidad: ${zona.Capacidad_Total}).`, 'info');
    }

    const prefijo = generarIniciales(zona.Nombre_Zona);
    const confirm = await Swal.fire({
      title: `¿Generar ${faltantes} plazas faltantes?`,
      html: `La zona <b>${zona.Nombre_Zona}</b> tiene ${plazasActuales}/${zona.Capacidad_Total} plazas.<br/>
             Se agregarán las ${faltantes} restantes con prefijo <code>${prefijo}</code>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ' Generar'
    });
    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({ title: 'Generando...', didOpen: () => Swal.showLoading() });
      const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'LIBRE').maybeSingle();
      const idLibre = est?.id_estado || 1;
      const { total } = await generarPlazasEnLote(zona.Id_Zona, zona.Nombre_Zona, zona.Capacidad_Total, idLibre);
      Swal.fire('Listo', `Se generaron ${total} plazas nuevas.`, 'success');
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const filteredZonas = zonas.filter(z => z.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ Nombre_Zona: zone.Nombre_Zona, Capacidad_Total: zone.Capacidad_Total });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteZone = async (zoneId) => {
    const result = await Swal.fire({
      title: '¿Eliminar zona?',
      text: "Se borrarán TODAS las plazas de esta zona.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar todo'
    });

    if (result.isConfirmed) {
      try {
        // Borrado manual en cascada para evitar errores de FK
        await supabase.from('plazas').delete().eq('Id_Zona', zoneId);
        await supabase.from('zonas_estacionamiento').delete().eq('Id_Zona', zoneId);
        Swal.fire('Eliminado', 'Zona y plazas eliminadas.', 'success');
        loadData();
      } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar la zona', 'error');
      }
    }
  };

  const openPlazaModal = (plaza = null) => {
    if (plaza) {
      setEditingPlaza(plaza);
      setPlazaForm({
        Numero_Plaza: plaza.Numero_Plaza,
        Id_Zona: plaza.Id_Zona,
        Amplitud: plaza.Amplitud || '2.50',
        Longitud: plaza.Longitud || '5.00'
      });
    } else {
      setEditingPlaza(null);
      setPlazaForm(initialPlazaState);
    }
    setShowPlazaModal(true);
  };

  const handleSubmitPlaza = async (e) => {
    e.preventDefault();
    if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

    try {
      const payload = {
        Numero_Plaza: plazaForm.Numero_Plaza,
        Id_Zona: parseInt(plazaForm.Id_Zona),
        Amplitud: parseFloat(plazaForm.Amplitud),
        Longitud: parseFloat(plazaForm.Longitud)
      };

      if (editingPlaza) {
        const { error } = await supabase.from('plazas')
          .update(payload)
          .eq('Id_Plaza', editingPlaza.Id_Plaza);
        if (error) throw error;
        Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
      } else {
        const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Libre').maybeSingle();
        const idLibre = est?.id_estado || 1;

        const { error } = await supabase.from('plazas').insert([{
          ...payload,
          id_estado: idLibre,
          Estado_Actual: 'LIBRE'
        }]);
        if (error) throw error;

        // ── Actualizar Capacidad_Total si el nuevo total supera el valor guardado ──
        const idZona = parseInt(plazaForm.Id_Zona);
        const { count } = await supabase.from('plazas').select('Id_Plaza', { count: 'exact', head: true }).eq('Id_Zona', idZona);
        const zonaActual = zonas.find(z => z.Id_Zona === idZona);
        if (zonaActual && count > zonaActual.Capacidad_Total) {
          await supabase.from('zonas_estacionamiento').update({ Capacidad_Total: count }).eq('Id_Zona', idZona);
        }

        Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
      }

      setShowPlazaModal(false);
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };


  const handleDeletePlaza = async (id) => {
    const result = await Swal.fire({
      title: '¿Borrar plaza?',
      text: "Esta acción es irreversible.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Borrar'
    });

    if (result.isConfirmed) {
      await supabase.from('plazas').delete().eq('Id_Plaza', id);
      loadData();
      Swal.fire('Eliminada', '', 'success');
    }
  };

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de Parqueo</h2>
          <p className="text-gray-500">Gestión estructural de zonas y plazas.</p>
        </div>
        <button
          onClick={() => openPlazaModal(null)}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition"
        >
          <FaPlus /> NUEVA PLAZA
        </button>
      </header>

      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <section className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Zonas Registradas</h3>
            <div className="relative w-64">
              <input type="text" placeholder="Buscar zona..." className="w-full pl-10 pr-4 py-2 border rounded-lg"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <FaSearch className="absolute left-3 top-3 text-gray-400" />
            </div>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Capacidad</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                  <tr key={z.Id_Zona} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900"><FaParking className='inline mr-2 text-primary' /> {z.Nombre_Zona}</td>
                    <td className="px-6 py-3 text-gray-500">{z.Capacidad_Total}</td>
                    <td className="px-6 py-3 flex gap-2 justify-center">
                      <button onClick={() => handleEditZone(z)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><FaEdit /></button>
                      <button onClick={() => handleDeleteZone(z.Id_Zona)} className="text-red-500 hover:bg-red-50 p-2 rounded"><FaTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-gray-50 p-6 rounded-lg border border-gray-200 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{editingZone ? "Editar Zona" : "Crear Zona"}</h3>
          <form className="space-y-4" onSubmit={handleSubmitZone}>
            <input type="text" className="w-full border p-2 rounded" placeholder="Nombre (Ej: Sótano 1)"
              value={zoneForm.Nombre_Zona} onChange={(e) => setZoneForm({ ...zoneForm, Nombre_Zona: e.target.value })} />
            <input type="number" className="w-full border p-2 rounded" placeholder="Capacidad Total"
              value={zoneForm.Capacidad_Total} onChange={(e) => setZoneForm({ ...zoneForm, Capacidad_Total: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              {editingZone && <button type="button" onClick={() => { setEditingZone(null); setZoneForm(initialZoneState); }} className="text-gray-500 text-sm">Cancelar</button>}
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded shadow text-sm font-bold">{editingZone ? "Actualizar" : "Guardar"}</button>
            </div>
          </form>
        </section>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">Mapa de Plazas (Edición)</h3>
        {filteredZonas.map(zona => {
          const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona);
          return (
            <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <FaMapMarkerAlt className="text-gray-400" />
                <h3 className="text-lg font-bold text-gray-700">{zona.Nombre_Zona}</h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 ml-auto">{plazasDeZona.length} plazas</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {plazasDeZona.map(plaza => (
                  <div key={plaza.Id_Plaza} className="group relative p-3 rounded border bg-gray-50 hover:border-blue-400 transition-all cursor-pointer h-24 flex flex-col items-center justify-center">
                    <span className="font-bold text-lg text-gray-800">{plaza.Numero_Plaza}</span>
                    <span className="text-[10px] text-gray-400">{plaza.Amplitud}m x {plaza.Longitud}m</span>
                    <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded transition-all">
                      <button onClick={() => openPlazaModal(plaza)} className="text-blue-600 bg-blue-100 p-2 rounded-full hover:bg-blue-200" title="Editar"><FaEdit /></button>
                      <button onClick={() => handleDeletePlaza(plaza.Id_Plaza)} className="text-red-600 bg-red-100 p-2 rounded-full hover:bg-red-200" title="Borrar"><FaTrash /></button>
                    </div>
                  </div>
                ))}
                {plazasDeZona.length === 0 && <p className="col-span-full text-center text-sm text-gray-400 py-4">Zona vacía.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {showPlazaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{editingPlaza ? 'Editar Plaza' : 'Nueva Plaza'}</h3>
            <form onSubmit={handleSubmitPlaza} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Número / Código</label>
                <input className="w-full border p-2 rounded focus:ring-primary" placeholder="Ej: A-01"
                  value={plazaForm.Numero_Plaza} onChange={e => setPlazaForm({ ...plazaForm, Numero_Plaza: e.target.value })} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Zona</label>
                <select className="w-full border p-2 rounded focus:ring-primary"
                  value={plazaForm.Id_Zona} onChange={e => setPlazaForm({ ...plazaForm, Id_Zona: e.target.value })} required>
                  <option value="">-- Seleccionar Zona --</option>
                  {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><FaArrowsAltH /> Amplitud (m)</label>
                  <input type="number" step="0.01" className="w-full border p-2 rounded" value={plazaForm.Amplitud} onChange={e => setPlazaForm({ ...plazaForm, Amplitud: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><FaArrowsAltV /> Longitud (m)</label>
                  <input type="number" step="0.01" className="w-full border p-2 rounded" value={plazaForm.Longitud} onChange={e => setPlazaForm({ ...plazaForm, Longitud: e.target.value })} required />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setShowPlazaModal(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow flex items-center gap-2">
                  <FaSave /> {editingPlaza ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}




import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave, FaArrowsAltH, FaArrowsAltV } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';

export default function ZonasParqueo() {
  const { tienePermiso } = useRbac();
  const { orgId } = useOrg();
  const canCreate = tienePermiso('Zonas de Parqueo', 'crear');
  const canEdit = tienePermiso('Zonas de Parqueo', 'editar');
  const canDelete = tienePermiso('Zonas de Parqueo', 'eliminar');

  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null);
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  // --- ESTADOS DE PLAZAS ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '', Amplitud: '2.50', Longitud: '5.00' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { 
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) setCurrentPersonaId(uData.id_persona);
      }
    };
    init();
    loadData(); 
  }, []);

  const loadData = async () => {
    try {
      const { data: zData } = await supabase.from('zona').select('*').order('id_zona');
      setZonas(zData || []);

      const { data: pData } = await supabase.from('plaza').select(`*, estado_plaza(nombre)`).order('numero_plaza');
      setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  const registrarLog = async (tipo_nombre, descripcion) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Parqueos').maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id_tipo || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
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
  const generarPlazasEnLote = async (idZona, nombreZona, capacidadTotal, idLibre) => {
    const prefijo = generarIniciales(nombreZona);
    // Obtener plazas existentes para no duplicar
    const { data: existentes } = await supabase.from('plaza').select('numero_plaza').eq('id_zona', idZona);
    const codigosExistentes = new Set((existentes || []).map(p => p.numero_plaza));

    const lote = [];
    let seq = 1;
    let insertadas = 0;
    while (insertadas < capacidadTotal) {
      const codigo = `${prefijo}-${String(seq).padStart(2, '0')}`;
      if (!codigosExistentes.has(codigo)) {
        lote.push({
          numero_plaza: codigo,
          id_zona: idZona,
          id_estado: idLibre,
          amplitud: 2.50,
          longitud: 5.00,
          organizacion_id: orgId
        });
        insertadas++;
      }
      seq++;
      if (seq > capacidadTotal * 3) break; // Salvaguarda ante bucle infinito
    }

    const { error } = await supabase.from('plaza').insert(lote);
    if (error) throw error;
    return { prefijo, total: lote.length };
  };

  /* ── Acciones de zonas ── */
  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    if (parseInt(zoneForm.Capacidad_Total) <= 0) return Swal.fire('Error', "Capacidad debe ser > 0.", 'warning');
    if (!orgId) return Swal.fire('Error', 'Contexto de organización no detectado.', 'error');

    const payload = { 
      nombre: zoneForm.Nombre_Zona.trim(), 
      capacidad_total: parseInt(zoneForm.Capacidad_Total),
      organizacion_id: orgId
    };
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
        confirmButtonText: 'Crear zona y plazas',
        cancelButtonText: 'Solo crear la zona'
      });

      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        // 1. Crear la zona y obtener su ID
        const { data: zonaCreada, error: errZ } = await supabase
          .from('zona').insert([payload]).select().single();
        if (errZ) throw errZ;

        if (confirm.isConfirmed) {
          // 2. Obtener el id del estado LIBRE
          const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
          const idLibre = epLibre?.id_estado || 1;
          
          // 3. Generar plazas en lote
          const { total } = await generarPlazasEnLote(zonaCreada.id_zona, zonaCreada.nombre, cap, idLibre);
          Swal.fire('Éxito', `Zona creada con ${total} plazas generadas automáticamente.`, 'success');
        } else {
          Swal.fire('Zona creada', 'Puedes agregar plazas manualmente cuando quieras.', 'success');
        }

        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }

    } else {
      // Editar zona existente (no genera plazas, solo actualiza datos)
      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        const { error } = await supabase.from('zona').update(payload).eq('id_zona', editingZone.id_zona);
        if (error) throw error;
        Swal.fire('Éxito', 'Zona actualizada.', 'success');
        registrarLog('Zona Modificada', `Edición de zona: ${zoneForm.Nombre_Zona} (Capacidad: ${zoneForm.Capacidad_Total})`);
        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
    }
  };

  /* ── Generar plazas para zona existente (botón en tabla) ── */
  const handleGenerarPlazasExistente = async (zona) => {
    const plazasActuales = plazas.filter(p => p.id_zona === zona.id_zona).length;
    const faltantes = zona.capacidad_total - plazasActuales;

    if (faltantes <= 0) {
      return Swal.fire('Sin cambios', `Esta zona ya tiene ${plazasActuales} plazas (capacidad: ${zona.capacidad_total}).`, 'info');
    }

    const prefijo = generarIniciales(zona.nombre);
    const confirm = await Swal.fire({
      title: `¿Generar ${faltantes} plazas faltantes?`,
      html: `La zona <b>${zona.nombre}</b> tiene ${plazasActuales}/${zona.capacidad_total} plazas.<br/>
             Se agregarán las ${faltantes} restantes con prefijo <code>${prefijo}</code>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ' Generar'
    });
    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({ title: 'Generando...', didOpen: () => Swal.showLoading() });
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idLibre = epLibre?.id_estado || 1;

      const { total } = await generarPlazasEnLote(zona.id_zona, zona.nombre, zona.capacidad_total, idLibre);
      Swal.fire('Listo', `Se generaron ${total} plazas nuevas.`, 'success');
      registrarLog('Plazas Generadas', `Generación de ${total} plazas para zona: ${zona.nombre}`);
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const filteredZonas = zonas.filter(z => (z.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ Nombre_Zona: zone.nombre, Capacidad_Total: zone.capacidad_total });
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
        Swal.fire({ title: 'Eliminando...', didOpen: () => Swal.showLoading() });
        
        // 1. Obtener IDs de las plazas de esta zona para limpiar dependencias si es necesario
        const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', zoneId);
        const idsPlazas = (plazasZona || []).map(p => p.id_plaza);

        if (idsPlazas.length > 0) {
          // 2. Limpiar referencias en 'pantalla' (que dependen directamente de zona e id_plaza)
          await supabase.from('pantalla').update({ id_zona: null, id_plaza: null }).eq('id_zona', zoneId);
          // 3. Intentar borrar las plazas. Nota: Si tienen accesos/tickets, esto fallará por FK.
          const { error: errP } = await supabase.from('plaza').delete().eq('id_zona', zoneId);
          if (errP) throw new Error(`No se pueden borrar las plazas: ${errP.message}`);
        }

        // 4. Borrar la zona
        const { error: errZ } = await supabase.from('zona').delete().eq('id_zona', zoneId);
        if (errZ) throw new Error(`Error al borrar zona: ${errZ.message}`);

        Swal.fire('Eliminado', 'Zona y plazas eliminadas con éxito.', 'success');
        registrarLog('Zona Eliminada', `Eliminación de zona ID: ${zoneId}`);
        loadData();
      } catch (error) {
        console.error('Error delete:', error);
        Swal.fire('Error de Borrado', 
          error.message.includes('foreign key constraint') 
          ? 'No se puede eliminar la zona porque tiene historial (accesos, tickets o dispositivos) vinculado. Sugerencia: use la funcionalidad de Desactivar en el futuro.'
          : error.message, 
          'error'
        );
      }
    }
  };

  const openPlazaModal = (plaza = null) => {
    if (plaza) {
      setEditingPlaza(plaza);
      setPlazaForm({
        Numero_Plaza: plaza.numero_plaza,
        Id_Zona: plaza.id_zona,
        Amplitud: plaza.amplitud || '2.50',
        Longitud: plaza.longitud || '5.00'
      });
    } else {
      setEditingPlaza(null);
      setPlazaForm(initialPlazaState);
    }
    setShowPlazaModal(true);
  };

  const handleZonaChange = (idZonaStr) => {
    const idZona = parseInt(idZonaStr);
    if (!idZona) {
      setPlazaForm({ ...plazaForm, Id_Zona: '', Numero_Plaza: '' });
      return;
    }

    const zonaActual = zonas.find(z => z.id_zona === idZona);
    if (!zonaActual) return;

    const prefijo = generarIniciales(zonaActual.nombre);
    const plazasExistentes = plazas.filter(p => p.id_zona === idZona);

    let maxSeq = 0;
    plazasExistentes.forEach(p => {
      // Extraer número de formato "PREFIJO-01" o al final del string
      const partes = p.numero_plaza.split('-');
      if (partes.length > 1) {
        const num = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      } else {
        const numMatch = p.numero_plaza.match(/\d+$/);
        if (numMatch) {
          const num = parseInt(numMatch[0], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
    });

    // Empezar en la siguiente secuencia
    const nextSeq = maxSeq + 1;
    const nextCodigo = `${prefijo}-${String(nextSeq).padStart(2, '0')}`;

    setPlazaForm({ ...plazaForm, Id_Zona: idZonaStr, Numero_Plaza: nextCodigo });
  };

  const handleSubmitPlaza = async (e) => {
    e.preventDefault();
    if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

    try {
      const payload = {
        numero_plaza: plazaForm.Numero_Plaza,
        id_zona: parseInt(plazaForm.Id_Zona),
        amplitud: parseFloat(plazaForm.Amplitud),
        longitud: parseFloat(plazaForm.Longitud),
        organizacion_id: orgId
      };

      if (editingPlaza) {
        const { error } = await supabase.from('plaza')
          .update(payload)
          .eq('id_plaza', editingPlaza.id_plaza);
        if (error) throw error;
        Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
      } else {
        const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        const idLibre = est?.id_estado || 1;

        const { error } = await supabase.from('plaza').insert([{
          ...payload,
          id_estado: idLibre
        }]);
        if (error) throw error;

        // ── Actualizar Capacidad_Total si el nuevo total supera el valor guardado ──
        const idZona = parseInt(plazaForm.Id_Zona);
        const { count } = await supabase.from('plaza').select('id_plaza', { count: 'exact', head: true }).eq('id_zona', idZona);
        const zonaActual = zonas.find(z => z.id_zona === idZona);
        if (zonaActual && count > zonaActual.capacidad_total) {
          await supabase.from('zona').update({ capacidad_total: count }).eq('id_zona', idZona);
        }

        Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
      }

      setShowPlazaModal(false);
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };


  const handleDeletePlaza = async (plaza) => {
    const result = await Swal.fire({
      title: '¿Borrar plaza?',
      text: "Esta acción es irreversible.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Borrar'
    });

    if (result.isConfirmed) {
      try {
        const { error: errP } = await supabase.from('plaza').delete().eq('id_plaza', plaza.id_plaza);
        if (errP) throw errP;
        
        // Sincronizar automáticamente la capacidad a la baja tras el borrado
        const { count } = await supabase.from('plaza').select('id_plaza', { count: 'exact', head: true }).eq('id_zona', plaza.id_zona);
        await supabase.from('zona').update({ capacidad_total: count || 0 }).eq('id_zona', plaza.id_zona);

        loadData();
        Swal.fire('Eliminada', 'La plaza ha sido borrada.', 'success');
      } catch (error) {
        Swal.fire('Error', `No se pudo borrar la plaza: ${error.message}`, 'error');
      }
    }
  };

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de Parqueo</h2>
          <p className="text-gray-500">Gestión estructural de zonas y plazas.</p>
        </div>
        {canCreate && (
        <button
          onClick={() => openPlazaModal(null)}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition"
        >
          <FaPlus /> NUEVA PLAZA
        </button>
        )}
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Registro</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                  <tr key={z.id_zona} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900"><FaParking className='inline mr-2 text-primary' /> {z.nombre}</td>
                    <td className="px-6 py-3 text-gray-500 font-bold">{z.capacidad_total}</td>
                    <td className="px-6 py-3 text-[10px] text-gray-400 font-medium italic">
                      {z.created_at ? new Date(z.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}
                    </td>
                    <td className="px-6 py-3 flex gap-2 justify-center">
                      {canEdit && <button onClick={() => handleEditZone(z)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><FaEdit /></button>}
                      {canDelete && <button onClick={() => handleDeleteZone(z.id_zona)} className="text-red-500 hover:bg-red-50 p-2 rounded"><FaTrash /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {(canCreate || editingZone) && (
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
        )}
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">Mapa de Plazas (Edición)</h3>
        {filteredZonas.map(zona => {
          const plazasDeZona = plazas.filter(p => p.id_zona === zona.id_zona);
          return (
            <section key={zona.id_zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <FaMapMarkerAlt className="text-gray-400" />
                <h3 className="text-lg font-bold text-gray-700">{zona.nombre}</h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 ml-auto">{plazasDeZona.length} plazas</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {plazasDeZona.map(plaza => (
                  <div key={plaza.id_plaza} className="group relative p-3 rounded border bg-gray-50 hover:border-blue-400 transition-all cursor-pointer h-24 flex flex-col items-center justify-center">
                    <span className="font-bold text-lg text-gray-800">{plaza.numero_plaza}</span>
                    <span className="text-[10px] text-gray-400">{plaza.amplitud}m x {plaza.longitud}m</span>
                    {/* Fecha de creación de la plaza */}
                    {plaza.created_at && (
                      <div className="mt-auto pt-1 border-t border-gray-100 w-full text-center">
                        <span className="text-[9px] text-gray-400 font-medium tracking-tighter">
                          {new Date(plaza.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded transition-all">
                      {canEdit && <button onClick={() => openPlazaModal(plaza)} className="text-blue-600 bg-blue-100 p-2 rounded-full hover:bg-blue-200" title="Editar"><FaEdit /></button>}
                      {canDelete && <button onClick={() => handleDeletePlaza(plaza)} className="text-red-600 bg-red-100 p-2 rounded-full hover:bg-red-200" title="Borrar"><FaTrash /></button>}
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
                  value={plazaForm.Id_Zona} onChange={e => {
                    // Si estamos editando, solo cambiar el ID pero no autogenerar el nombre
                    if (editingPlaza) {
                      setPlazaForm({ ...plazaForm, Id_Zona: e.target.value });
                    } else {
                      handleZonaChange(e.target.value);
                    }
                  }} required>
                  <option value="">-- Seleccionar Zona --</option>
                  {zonas.map(z => <option key={z.id_zona} value={z.id_zona}>{z.nombre}</option>)}
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


import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Sensores() {
  const { orgId } = useOrg();
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosSensor, setEstadosSensor] = useState([]);
  
  // Catálogos nuevos v2.0
  const [listaTipos, setListaTipos] = useState([]);
  const [listaMarcas, setListaMarcas] = useState([]);
  const [listaModelos, setListaModelos] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  const initialForm = {
    id_tipo: '',
    id_marca: '',
    id_modelo: '',
    tipo_descripcion: '',
    id_plaza: '',
    id_estado: 1, // 1 = Activo (Default)
    fecha_instalacion: new Date().toISOString().split('T')[0],
    ultimo_mantenimiento: '',
    // RF4: Parámetros IoT configurables
    param_frecuencia: 5,
    param_umbral: 10,
    param_timeout: 30
  };
  const [formData, setFormData] = useState(initialForm);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('usuarios').select('id_persona').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.id_persona);
      }
    };
    init();
    loadData();
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: dispData, error } = await supabase
        .from('dispositivos')
        .select(`
          *,
          tipos_dispositivos(id_tipo, nombre_tipo, descripcion),
          modelos_equipo_cat(id_modelo_equipo, nombre, id_marca, marcas_equipo(nombre)),
          plazas(Id_Plaza, Numero_Plaza),
          estado_sensor(id_estado, nombre_estado)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      const { data: plazaData } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
      const plazasAsignadas = new Set((dispData || []).filter(d => d.id_plaza).map(d => d.id_plaza));
      setPlazas((plazaData || []).filter(p => !plazasAsignadas.has(p.Id_Plaza)));

      const { data: estSensor } = await supabase.from('estado_sensor').select('*').order('id_estado');
      setEstadosSensor(estSensor || []);

      const { data: tTipos } = await supabase.from('tipos_dispositivos').select('*').order('nombre_tipo');
      setListaTipos(tTipos || []);

      const { data: tMarcas } = await supabase.from('marcas_equipo').select('*').order('nombre');
      setListaMarcas(tMarcas || []);

      const { data: tModelos } = await supabase.from('modelos_equipo_cat').select('*').order('nombre');
      setListaModelos(tModelos || []);
      
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const registrarLog = async (tipo, descripcion, idPlaza = null, idDisp = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Hardware').maybeSingle();
      await supabase.from('eventos').insert([{
        Fecha_Hora: new Date().toISOString(),
        Descripcion: descripcion,
        Id_Plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo_evento: te?.id_tipo || null,
        id_origen_evento: oe?.id_origen || null,
        id_dispositivo: idDisp,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    
    let params = { param_frecuencia: 5, param_umbral: 10, param_timeout: 30 };
    let descTexto = disp.tipos_dispositivos?.descripcion || '';
    try {
      if (descTexto.startsWith('{')) {
        const parsed = JSON.parse(descTexto);
        params = {
          param_frecuencia: parsed.frecuencia ?? 5,
          param_umbral: parsed.umbral ?? 10,
          param_timeout: parsed.timeout ?? 30
        };
        descTexto = parsed.descripcion || '';
      }
    } catch (_) { }

    setFormData({
      id_tipo: disp.id_tipo || '',
      id_marca: disp.modelos_equipo_cat?.id_marca || '',
      id_modelo: disp.id_modelo_equipo || '',
      tipo_descripcion: descTexto,
      id_plaza: disp.id_plaza || '',
      id_estado: disp.id_estado || 1,
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || '',
      ...params
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const tipoObj = listaTipos.find(t => t.id_tipo === parseInt(formData.id_tipo));
    const esSensor = tipoObj?.nombre_tipo?.toLowerCase().includes('sensor');

    try {
      if (esSensor) {
         const descripcionFinal = JSON.stringify({
            descripcion: formData.tipo_descripcion,
            frecuencia: parseInt(formData.param_frecuencia),
            umbral: parseInt(formData.param_umbral),
            timeout: parseInt(formData.param_timeout)
          });
          await supabase.from('tipos_dispositivos').update({ descripcion: descripcionFinal }).eq('id_tipo', formData.id_tipo);
      }

      const dispData = {
        id_tipo: parseInt(formData.id_tipo),
        id_modelo_equipo: parseInt(formData.id_modelo),
        id_plaza: formData.id_plaza || null,
        id_estado: parseInt(formData.id_estado),
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null,
        organizacion_id: orgId
      };

      if (editingId) {
        // En UPDATE omitimos organizacion_id para evitar conflictos con políticas RLS 
        // de integridad si el valor ya existe y no debe cambiar.
        const updateData = { ...dispData };
        delete updateData.organizacion_id;

        const { error } = await supabase.from('dispositivos')
          .update(updateData)
          .eq('id_dispositivo', editingId);
          
        if (error) throw error;
        
        // Log de actualización
        const nuevoEstado = estadosSensor.find(e => e.id_estado === parseInt(formData.id_estado))?.nombre_estado;
        const tipoLog = parseInt(formData.id_estado) === 1 ? 'Dispositivo Online' : 
                      parseInt(formData.id_estado) === 3 ? 'Mantenimiento En Progreso' : 'Dispositivo Offline';
        
        await registrarLog(
          tipoLog,
          `Estado actualizado de ${tipoObj?.nombre_tipo || 'Equipo'}: ${nuevoEstado}.`,
          formData.id_plaza || null,
          editingId
        );

        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        const { data: nDisp, error } = await supabase.from('dispositivos').insert([dispData]).select('id_dispositivo').single();
        if (error) throw error;
        
        await registrarLog(
          'Dispositivo Online',
          `Nuevo dispositivo registrado: ${tipoObj?.nombre_tipo || 'Equipo'}.`,
          formData.id_plaza || null,
          nDisp.id_dispositivo
        );

        Swal.fire('Éxito', 'Registro creado', 'success');
      }

      setShowModal(false);
      setEditingId(null);
      setFormData(initialForm);
      loadData();
    } catch (error) {
      Swal.fire('Error', error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(initialForm);
  };

  const handleDelete = async (disp) => {
    const result = await Swal.fire({
      title: '¿Eliminar dispositivo?',
      text: "Se borrará de forma permanente el registro técnico.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#ef4444'
    });

    if (result.isConfirmed) {
      const { error } = await supabase.from('dispositivos').delete().eq('id_dispositivo', disp.id_dispositivo);
      if (error) Swal.fire('Error', error.message, 'error');
      else {
        await registrarLog(
          'Dispositivo Offline',
          `Dispositivo eliminado: ${disp.tipos_dispositivos?.nombre_tipo || 'Equipo'}.`,
          disp.id_plaza || null,
          disp.id_dispositivo
        );
        loadData();
      }
    }
  };

  const filteredDispositivos = dispositivos.filter(d => {
    const busqueda = searchTerm.toLowerCase();
    const nombreTipo = (d.tipos_dispositivos?.nombre_tipo || "").toLowerCase();
    const numeroPlaza = (d.plazas?.Numero_Plaza || "").toLowerCase();
    return nombreTipo.includes(busqueda) || numeroPlaza.includes(busqueda);
  });

  const tipoActual = listaTipos.find(t => t.id_tipo === parseInt(formData.id_tipo));
  const esSensor = tipoActual?.nombre_tipo?.toLowerCase().includes('sensor');

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Gestión de Hardware</h2>
          <p className="text-gray-500 font-medium">Administración de dispositivos y sensores del parqueo.</p>
        </div>
        {!showModal && (
          <button
            onClick={() => { setEditingId(null); setFormData(initialForm); setShowModal(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition duration-150"
          >
            <FaPlus /> Nuevo Registro
          </button>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        
        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <div className="relative w-72">
                <input
                  type="text" placeholder="Buscar por nombre o plaza..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none text-[10px] sm:text-xs"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
              </div>
              <button
                onClick={loadData}
                disabled={isRefreshing}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                title="Refrescar lista"
              >
                  <FaSync className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 uppercase text-[10px] text-gray-500 font-black tracking-widest sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 text-left">Hardware</th>
                    <th className="px-6 py-4 text-left">Marca - Modelo</th>
                    <th className="px-6 py-4 text-left">Plaza</th>
                    <th className="px-6 py-4 text-left">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredDispositivos.map((disp) => (
                    <tr key={disp.id_dispositivo} className="hover:bg-gray-50/50 transition duration-150 group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 uppercase text-xs">{disp.tipos_dispositivos?.nombre_tipo}</div>
                        <div className="text-[10px] text-gray-400 italic font-medium">{disp.tipos_dispositivos?.descripcion || '-'}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600 text-xs">
                        {disp.modelos_equipo_cat?.marcas_equipo?.nombre} - {disp.modelos_equipo_cat?.nombre}
                      </td>
                      <td className="px-6 py-4">
                        {disp.plazas && (
                          <div className="inline-flex items-center gap-1.5 bg-[#2eb17b]/10 border border-[#2eb17b] px-2.5 py-0.5 rounded-md shadow-sm">
                            <span className="text-[9px] font-black text-[#2eb17b] uppercase tracking-tighter">Plaza</span>
                            <span className="text-sm font-black text-[#2eb17b]">{disp.plazas.Numero_Plaza}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {disp.estado_sensor ? (
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] border uppercase tracking-tighter ${
                            disp.id_estado === 1 ? 'bg-green-50 text-green-700 border-green-200' :
                            disp.id_estado === 3 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {disp.estado_sensor.nombre_estado}
                          </span>
                        ) : <span className="text-gray-300 text-[10px] italic">N/A</span>}
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button onClick={() => handleEdit(disp)} className="text-blue-500 hover:text-blue-700"><FaEdit size={17} /></button>
                        <button onClick={() => handleDelete(disp)} className="text-red-400 hover:text-red-600"><FaTrash size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {showModal && (
        <aside className="w-full lg:w-[400px] flex-shrink-0">
          <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                <FaMicrochip className="text-blue-600" /> {editingId ? 'Editar Hardware' : 'Nuevo Hardware'}
              </h3>
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                <FaTimesCircle size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo de Equipo *</label>
                <SearchableSelect 
                  options={listaTipos.map(t => ({ value: t.id_tipo, label: t.nombre_tipo }))}
                  value={formData.id_tipo} 
                  onChange={val => setFormData({ ...formData, id_tipo: val })} 
                  placeholder="— Seleccionar Tipo —"
                  focusRingClass="focus:ring-blue-500"
                  selectedItemClass="bg-blue-100 text-blue-800"
                  className="bg-gray-50/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción Breve</label>
                <input 
                  type="text" 
                  className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50" 
                  placeholder="Ej: Cámara carril entrada" 
                  value={formData.tipo_descripcion} 
                  onChange={e => setFormData({ ...formData, tipo_descripcion: e.target.value })} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Marca *</label>
                  <SearchableSelect 
                    options={listaMarcas.map(m => ({ value: m.id_marca, label: m.nombre }))}
                    value={formData.id_marca} 
                    onChange={val => setFormData({ ...formData, id_marca: val, id_modelo: '' })} 
                    placeholder="— Marca —"
                    focusRingClass="focus:ring-blue-500"
                    selectedItemClass="bg-blue-100 text-blue-800"
                    className="bg-gray-50/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Modelo *</label>
                  <select 
                    className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50" 
                    value={formData.id_modelo} 
                    onChange={e => setFormData({ ...formData, id_modelo: e.target.value })} 
                    required 
                    disabled={!formData.id_marca}
                  >
                    <option value="">— Modelo —</option>
                    {listaModelos.filter(m => m.id_marca === parseInt(formData.id_marca)).map(m => (
                      <option key={m.id_modelo_equipo} value={m.id_modelo_equipo}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Instalación</label>
                  <input type="date" className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50" value={formData.fecha_instalacion} onChange={e => setFormData({ ...formData, fecha_instalacion: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Vincular Plaza</label>
                  <select className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50" value={formData.id_plaza} onChange={e => setFormData({ ...formData, id_plaza: e.target.value })}>
                    <option value="">— Ninguna —</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                    {editingId && formData.id_plaza && !plazas.find(p => String(p.Id_Plaza) === String(formData.id_plaza)) && (
                      <option value={formData.id_plaza}>Plaza asignada</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                {esSensor ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-purple-600 mb-1 uppercase tracking-widest">Estado (Sensor)</label>
                      <select className="border p-2 rounded-lg w-full text-sm bg-purple-50 border-purple-200 outline-none focus:ring-2 focus:ring-purple-200 font-bold" value={formData.id_estado} onChange={e => setFormData({ ...formData, id_estado: e.target.value })} required>
                        <option value="">-- Seleccionar Estado --</option>
                        {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                      </select>
                    </div>

                    <div className="border-t border-purple-100 pt-3">
                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3">Parámetros IoT Remotos</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Frecuencia (s)</label>
                          <input type="number" min="1" max="60" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_frecuencia} onChange={e => setFormData({ ...formData, param_frecuencia: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Umbral (cm)</label>
                          <input type="number" min="1" max="500" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_umbral} onChange={e => setFormData({ ...formData, param_umbral: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Timeout (s)</label>
                          <input type="number" min="5" max="300" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_timeout} onChange={e => setFormData({ ...formData, param_timeout: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-blue-600 mb-1 uppercase tracking-widest">Estado Operativo</label>
                    <select className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-blue-500 bg-white font-bold" value={formData.id_estado} onChange={e => setFormData({ ...formData, id_estado: e.target.value })}>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className={`grid ${editingId ? 'grid-cols-2' : ''} gap-3`}>
                {editingId && (
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 mb-1 uppercase">Últ. Mant.</label>
                    <input type="date" className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-blue-500 bg-gray-50" value={formData.ultimo_mantenimiento} onChange={e => setFormData({ ...formData, ultimo_mantenimiento: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md flex justify-center items-center gap-2">
                  <FaMicrochip /> {loading ? 'PROCESANDO...' : editingId ? 'ACTUALIZAR' : 'REGISTRAR'}
                </button>
              </div>
            </form>
          </section>
        </aside>
        )}
      </div>
    </Layout>
  );
}
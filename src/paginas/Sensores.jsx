import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
    }
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
        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        const { error } = await supabase.from('dispositivos').insert([dispData]);
        if (error) throw error;
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
      else loadData();
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
        <button
          onClick={() => { setEditingId(null); setFormData(initialForm); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow-md flex items-center gap-2 transition duration-150"
        >
          <FaPlus /> Nuevo Registro
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Inventario</h3>
          <div className="relative w-72">
            <input
              type="text" placeholder="Buscar por nombre o plaza..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 uppercase text-[10px] text-gray-500 font-black tracking-widest">
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh] animate-fadeIn border-t-8 border-blue-600">
            <h3 className="text-xl font-black mb-6 text-gray-800 flex items-center gap-2 uppercase tracking-tight border-b pb-2">
              <FaMicrochip className="text-blue-600" /> {editingId ? 'Editar Hardware' : 'Nuevo Hardware'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Tipo de Equipo *</label>
                  <select 
                    className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-semibold" 
                    value={formData.id_tipo} 
                    onChange={e => setFormData({ ...formData, id_tipo: e.target.value })} 
                    required
                  >
                    <option value="">— Seleccionar —</option>
                    {listaTipos.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.nombre_tipo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Descripción Breve</label>
                  <input 
                    type="text" 
                    className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" 
                    placeholder="Ej: Cámara carril entrada" 
                    value={formData.tipo_descripcion} 
                    onChange={e => setFormData({ ...formData, tipo_descripcion: e.target.value })} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Marca *</label>
                  <select 
                    className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-semibold" 
                    value={formData.id_marca} 
                    onChange={e => setFormData({ ...formData, id_marca: e.target.value, id_modelo: '' })} 
                    required
                  >
                    <option value="">— Seleccionar —</option>
                    {listaMarcas.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Modelo *</label>
                  <select 
                    className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-semibold" 
                    value={formData.id_modelo} 
                    onChange={e => setFormData({ ...formData, id_modelo: e.target.value })} 
                    required 
                    disabled={!formData.id_marca}
                  >
                    <option value="">— Seleccionar —</option>
                    {listaModelos.filter(m => m.id_marca === parseInt(formData.id_marca)).map(m => (
                      <option key={m.id_modelo_equipo} value={m.id_modelo_equipo}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Fecha Instalación</label>
                  <input type="date" className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.fecha_instalacion} onChange={e => setFormData({ ...formData, fecha_instalacion: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Vincular Plaza</label>
                  <select className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.id_plaza} onChange={e => setFormData({ ...formData, id_plaza: e.target.value })}>
                    <option value="">— Ninguna —</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                    {editingId && formData.id_plaza && !plazas.find(p => String(p.Id_Plaza) === String(formData.id_plaza)) && (
                      <option value={formData.id_plaza}>Plaza actualmente asignada</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                {esSensor ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-purple-600 mb-1 uppercase tracking-widest">Estado del Sensor (Específico)</label>
                      <select className="border p-2 rounded-lg w-full text-sm bg-purple-50 border-purple-200 outline-none focus:ring-2 focus:ring-purple-200 font-bold" value={formData.id_estado} onChange={e => setFormData({ ...formData, id_estado: e.target.value })} required>
                        <option value="">-- Seleccionar Estado --</option>
                        {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                      </select>
                    </div>

                    <div className="border-t border-purple-100 pt-3">
                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3">📡 Parámetros IoT Remotos</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Frecuencia (seg)</label>
                          <input type="number" min="1" max="60" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_frecuencia} onChange={e => setFormData({ ...formData, param_frecuencia: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Umbral (cm)</label>
                          <input type="number" min="1" max="500" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_umbral} onChange={e => setFormData({ ...formData, param_umbral: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Timeout (seg)</label>
                          <input type="number" min="5" max="300" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-orange-50 border-orange-200" value={formData.param_timeout} onChange={e => setFormData({ ...formData, param_timeout: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-blue-600 mb-1 uppercase tracking-widest">Estado Operativo del Equipo</label>
                    <select className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-bold" value={formData.id_estado} onChange={e => setFormData({ ...formData, id_estado: e.target.value })}>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className={`grid ${editingId ? 'grid-cols-2' : ''} gap-3`}>
                {editingId && (
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 ml-1 uppercase">Últ. Mant.</label>
                    <input type="date" className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100" value={formData.ultimo_mantenimiento} onChange={e => setFormData({ ...formData, ultimo_mantenimiento: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-bold uppercase text-[10px]">Cancelar</button>
                <button type="submit" disabled={loading} className="px-8 py-2 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 shadow shadow-blue-200 transition-all active:scale-95 uppercase text-[10px]">
                  {loading ? 'Procesando...' : editingId ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
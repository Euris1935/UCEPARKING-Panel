/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit, FaCalendarPlus } from 'react-icons/fa';

export default function Sensores() {
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosSensor, setEstadosSensor] = useState([]); // Catálogo de estado_sensor
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialForm = {
    tipo_nombre: '',
    tipo_descripcion: '',
    marca: '',
    modelo: '',
    ubicacion: '',
    id_plaza: '',
    estado_operativo: 'Operativo', // Estado general (Cámara, Pantalla, etc.)
    id_estado_sensor: '', // id_estado específico para sensores
    fecha_instalacion: new Date().toISOString().split('T')[0], // Nueva fecha de instalación
    ultimo_mantenimiento: ''
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Carga de dispositivos con relaciones
      const { data: dispData, error } = await supabase
        .from('dispositivos')
        .select(`
          *,
          tipos_dispositivos(id_tipo, nombre_tipo, descripcion),
          modelos_equipo(Id_Modelo, Modelo, Marca),
          plazas(Id_Plaza, Numero_Plaza),
          estado_sensor(id_estado, nombre_estado)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      // Carga de auxiliares
      const { data: plazaData } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
      setPlazas(plazaData || []);

      const { data: estSensor } = await supabase.from('estado_sensor').select('*').order('nombre_estado');
      setEstadosSensor(estSensor || []);
      
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    }
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    setFormData({
      tipo_nombre: disp.tipos_dispositivos?.nombre_tipo || '',
      tipo_descripcion: disp.tipos_dispositivos?.descripcion || '',
      marca: disp.modelos_equipo?.Marca || '',
      modelo: disp.modelos_equipo?.Modelo || '',
      ubicacion: disp.ubicacion || '',
      id_plaza: disp.id_plaza || '',
      estado_operativo: disp.estado_operativo || 'Operativo',
      id_estado_sensor: disp.id_estado || '', // Mapeo de id_estado de la tabla dispositivos
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Manejar TIPO y MODELO (Lógica de búsqueda/creación)
      let id_tipo;
      const { data: exTipo } = await supabase.from('tipos_dispositivos').select('id_tipo').ilike('nombre_tipo', formData.tipo_nombre.trim()).maybeSingle();
      if (exTipo) {
        id_tipo = exTipo.id_tipo;
        await supabase.from('tipos_dispositivos').update({ descripcion: formData.tipo_descripcion }).eq('id_tipo', id_tipo);
      } else {
        const { data: nTipo } = await supabase.from('tipos_dispositivos').insert([{ nombre_tipo: formData.tipo_nombre.trim(), descripcion: formData.tipo_descripcion }]).select();
        id_tipo = nTipo[0].id_tipo;
      }

      let id_modelo;
      const { data: exMod } = await supabase.from('modelos_equipo').select('Id_Modelo').ilike('Modelo', formData.modelo.trim()).ilike('Marca', formData.marca.trim()).maybeSingle();
      if (exMod) { id_modelo = exMod.Id_Modelo; } 
      else {
        const { data: nMod } = await supabase.from('modelos_equipo').insert([{ Modelo: formData.modelo.trim(), Marca: formData.marca.trim(), Tipo: formData.tipo_nombre.trim() }]).select();
        id_modelo = nMod[0].Id_Modelo;
      }

      // 2. Preparar objeto final de dispositivo
      const dispData = {
        id_tipo,
        id_modelo,
        id_plaza: formData.id_plaza || null,
        ubicacion: formData.ubicacion,
        estado_operativo: formData.estado_operativo,
        id_estado: formData.id_estado_sensor || null, // Estado específico del sensor
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null
      };

      if (editingId) {
        await supabase.from('dispositivos').update(dispData).eq('id_dispositivo', editingId);
        Swal.fire('Éxito', 'Dispositivo actualizado', 'success');
      } else {
        await supabase.from('dispositivos').insert([dispData]);
        Swal.fire('Éxito', 'Dispositivo registrado', 'success');
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

  const handleDelete = async (disp) => {
    const result = await Swal.fire({
      title: '¿Eliminar dispositivo?',
      text: "Se borrarán también los datos técnicos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
      await supabase.from('dispositivos').delete().eq('id_dispositivo', disp.id_dispositivo);
      if (disp.id_modelo) await supabase.from('modelos_equipo').delete().eq('Id_Modelo', disp.id_modelo);
      if (disp.id_tipo) await supabase.from('tipos_dispositivos').delete().eq('id_tipo', disp.id_tipo);
      loadData();
    }
  };

  // Determinar si el dispositivo actual es un sensor para mostrar campos extra
  const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Sensores</h2>
          <p className="text-gray-500">Administración de hardware y estados operativos.</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setFormData(initialForm); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md flex items-center gap-2"
        >
          <FaPlus /> Nuevo Dispositivo
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Inventario de Hardware</h3>
          <div className="relative w-64">
            <input 
              type="text" placeholder="Buscar..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 uppercase text-xs text-gray-500 font-bold">
              <tr>
                <th className="px-6 py-3 text-left">Hardware / Tipo</th>
                <th className="px-6 py-3 text-left">Marca - Modelo</th>
                <th className="px-6 py-3 text-left">Instalación</th>
                <th className="px-6 py-3 text-left">Estado Operativo</th>
                <th className="px-6 py-3 text-left">Estado Sensor</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dispositivos.filter(d => d.tipos_dispositivos?.nombre_tipo?.toLowerCase().includes(searchTerm.toLowerCase())).map((disp) => (
                <tr key={disp.id_dispositivo} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 uppercase">{disp.tipos_dispositivos?.nombre_tipo}</div>
                    <div className="text-[10px] text-gray-400">{disp.tipos_dispositivos?.descripcion || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {disp.modelos_equipo?.Marca} - {disp.modelos_equipo?.Modelo}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {disp.fecha_instalacion ? new Date(disp.fecha_instalacion).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px]">
                      {disp.estado_operativo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {disp.estado_sensor ? (
                      <span className="px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px]">
                        {disp.estado_sensor.nombre_estado}
                      </span>
                    ) : <span className="text-gray-300">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => handleEdit(disp)} className="text-blue-500 hover:text-blue-700"><FaEdit size={16}/></button>
                    <button onClick={() => handleDelete(disp)} className="text-red-400 hover:text-red-600"><FaTrash size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FaMicrochip className="text-blue-600"/> {editingId ? 'Editar Equipo' : 'Nuevo Equipo'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">TIPO DE EQUIPO</label>
                  <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Ej: Sensor, Cámara" value={formData.tipo_nombre} onChange={e => setFormData({...formData, tipo_nombre: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">DESCRIPCIÓN</label>
                  <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Descripción breve" value={formData.tipo_descripcion} onChange={e => setFormData({...formData, tipo_descripcion: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Marca" className="border p-2 rounded text-sm w-full" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                <input type="text" placeholder="Modelo" className="border p-2 rounded text-sm w-full" value={formData.modelo} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">FECHA INSTALACIÓN</label>
                  <input type="date" className="w-full border p-2 rounded text-sm" value={formData.fecha_instalacion} onChange={e => setFormData({...formData, fecha_instalacion: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">VINCULAR PLAZA</label>
                  <select className="border p-2 rounded w-full text-sm" value={formData.id_plaza} onChange={e => setFormData({...formData, id_plaza: e.target.value})}>
                    <option value="">Ninguna</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-xs font-bold text-blue-600 mb-1 uppercase text-[9px]">Estado Operativo (General)</label>
                  <select className="border p-2 rounded w-full text-sm" value={formData.estado_operativo} onChange={e => setFormData({...formData, estado_operativo: e.target.value})}>
                    <option value="Operativo">Operativo</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Falla">Falla</option>
                  </select>
                </div>

                
                {esSensor && (
                  <div>
                    <label className="block text-xs font-bold text-purple-600 mb-1 uppercase text-[9px]">Estado Sensor (Específico)</label>
                    <select className="border p-2 rounded w-full text-sm bg-purple-50" value={formData.id_estado_sensor} onChange={e => setFormData({...formData, id_estado_sensor: e.target.value})}>
                      <option value="">-- Seleccionar --</option>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Ubicación física" className="border p-2 rounded text-sm w-full" value={formData.ubicacion} onChange={e => setFormData({...formData, ubicacion: e.target.value})} required />
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 ml-1">ÚLT. MANTENIMIENTO</label>
                    <input type="date" className="border p-2 rounded text-sm w-full" value={formData.ultimo_mantenimiento} onChange={e => setFormData({...formData, ultimo_mantenimiento: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow">
                  {loading ? 'Guardando...' : editingId ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

*/


/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit } from 'react-icons/fa';

export default function Sensores() {
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosSensor, setEstadosSensor] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialForm = {
    tipo_nombre: '',
    tipo_descripcion: '',
    marca: '',
    modelo: '',
    ubicacion: '',
    id_plaza: '',
    estado_operativo: 'Operativo', 
    id_estado_sensor: '', 
    fecha_instalacion: new Date().toISOString().split('T')[0],
    ultimo_mantenimiento: ''
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
          modelos_equipo(Id_Modelo, Modelo, Marca),
          plazas(Id_Plaza, Numero_Plaza),
          estado_sensor(id_estado, nombre_estado)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      const { data: plazaData } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
      setPlazas(plazaData || []);

      const { data: estSensor } = await supabase.from('estado_sensor').select('*').order('nombre_estado');
      setEstadosSensor(estSensor || []);
      
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    }
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    setFormData({
      tipo_nombre: disp.tipos_dispositivos?.nombre_tipo || '',
      tipo_descripcion: disp.tipos_dispositivos?.descripcion || '',
      marca: disp.modelos_equipo?.Marca || '',
      modelo: disp.modelos_equipo?.Modelo || '',
      ubicacion: disp.ubicacion || '',
      id_plaza: disp.id_plaza || '',
      estado_operativo: disp.estado_operativo || 'Operativo',
      id_estado_sensor: disp.id_estado || '',
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

    try {
      // 1. Manejar TIPO y MODELO
      let id_tipo;
      const { data: exTipo } = await supabase.from('tipos_dispositivos').select('id_tipo').ilike('nombre_tipo', formData.tipo_nombre.trim()).maybeSingle();
      if (exTipo) {
        id_tipo = exTipo.id_tipo;
        await supabase.from('tipos_dispositivos').update({ descripcion: formData.tipo_descripcion }).eq('id_tipo', id_tipo);
      } else {
        const { data: nTipo } = await supabase.from('tipos_dispositivos').insert([{ nombre_tipo: formData.tipo_nombre.trim(), descripcion: formData.tipo_descripcion }]).select();
        id_tipo = nTipo[0].id_tipo;
      }

      let id_modelo;
      const { data: exMod } = await supabase.from('modelos_equipo').select('Id_Modelo').ilike('Modelo', formData.modelo.trim()).ilike('Marca', formData.marca.trim()).maybeSingle();
      if (exMod) { id_modelo = exMod.Id_Modelo; } 
      else {
        const { data: nMod } = await supabase.from('modelos_equipo').insert([{ Modelo: formData.modelo.trim(), Marca: formData.marca.trim(), Tipo: formData.tipo_nombre.trim() }]).select();
        id_modelo = nMod[0].Id_Modelo;
      }

      // 2. Lógica de estados según el tipo (Exclusión mutua)
      const dispData = {
        id_tipo,
        id_modelo,
        id_plaza: formData.id_plaza || null,
        ubicacion: formData.ubicacion,
        // Si es sensor, el operativo se guarda como N/A. Si no, se guarda el valor del form.
        estado_operativo: esSensor ? 'N/A' : formData.estado_operativo,
        // Si es sensor, guardamos su ID de estado. Si no, va nulo.
        id_estado: esSensor ? (formData.id_estado_sensor || null) : null,
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null
      };

      if (editingId) {
        await supabase.from('dispositivos').update(dispData).eq('id_dispositivo', editingId);
        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        await supabase.from('dispositivos').insert([dispData]);
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

  const handleDelete = async (disp) => {
    const result = await Swal.fire({
      title: '¿Eliminar dispositivo?',
      text: "Se borrarán también los datos técnicos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
      await supabase.from('dispositivos').delete().eq('id_dispositivo', disp.id_dispositivo);
      if (disp.id_modelo) await supabase.from('modelos_equipo').delete().eq('Id_Modelo', disp.id_modelo);
      if (disp.id_tipo) await supabase.from('tipos_dispositivos').delete().eq('id_tipo', disp.id_tipo);
      loadData();
    }
  };

  const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Hardware</h2>
          <p className="text-gray-500">Administración de dispositivos y sensores del parqueo.</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setFormData(initialForm); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md flex items-center gap-2"
        >
          <FaPlus /> Nuevo Registro
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Inventario</h3>
          <div className="relative w-64">
            <input 
              type="text" placeholder="Buscar..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 uppercase text-xs text-gray-500 font-bold">
              <tr>
                <th className="px-6 py-3 text-left">Hardware</th>
                <th className="px-6 py-3 text-left">Marca - Modelo</th>
                <th className="px-6 py-3 text-left">Ubicación</th>
                <th className="px-6 py-3 text-left">Estado Gral.</th>
                <th className="px-6 py-3 text-left">Estado Sensor</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dispositivos.filter(d => d.tipos_dispositivos?.nombre_tipo?.toLowerCase().includes(searchTerm.toLowerCase())).map((disp) => (
                <tr key={disp.id_dispositivo} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 uppercase">{disp.tipos_dispositivos?.nombre_tipo}</div>
                    <div className="text-[10px] text-gray-400">{disp.tipos_dispositivos?.descripcion || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {disp.modelos_equipo?.Marca} - {disp.modelos_equipo?.Modelo}
                  </td>
                  <td className="px-6 py-4 text-gray-500 italic">
                    {disp.ubicacion} {disp.plazas && <span className="block text-blue-600 font-bold not-italic text-[10px]">P: {disp.plazas.Numero_Plaza}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${disp.estado_operativo === 'N/A' ? 'text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                      {disp.estado_operativo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {disp.estado_sensor ? (
                      <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] border border-purple-200 uppercase">
                        {disp.estado_sensor.nombre_estado}
                      </span>
                    ) : <span className="text-gray-300 text-[10px]">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => handleEdit(disp)} className="text-blue-500 hover:text-blue-700"><FaEdit size={16}/></button>
                    <button onClick={() => handleDelete(disp)} className="text-red-400 hover:text-red-600"><FaTrash size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FaMicrochip className="text-blue-600"/> {editingId ? 'Editar Hardware' : 'Nuevo Hardware'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">TIPO DE EQUIPO</label>
                  <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Ej: Sensor, Cámara" value={formData.tipo_nombre} onChange={e => setFormData({...formData, tipo_nombre: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">DESCRIPCIÓN</label>
                  <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Descripción breve" value={formData.tipo_descripcion} onChange={e => setFormData({...formData, tipo_descripcion: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Marca" className="border p-2 rounded text-sm w-full" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                <input type="text" placeholder="Modelo" className="border p-2 rounded text-sm w-full" value={formData.modelo} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">FECHA INSTALACIÓN</label>
                  <input type="date" className="w-full border p-2 rounded text-sm" value={formData.fecha_instalacion} onChange={e => setFormData({...formData, fecha_instalacion: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">VINCULAR PLAZA</label>
                  <select className="border p-2 rounded w-full text-sm" value={formData.id_plaza} onChange={e => setFormData({...formData, id_plaza: e.target.value})}>
                    <option value="">Ninguna</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
               
                {esSensor ? (
                  <div>
                    <label className="block text-xs font-bold text-purple-600 mb-1 uppercase text-[9px]">Estado del Sensor (Específico)</label>
                    <select className="border p-2 rounded w-full text-sm bg-purple-50 border-purple-200" value={formData.id_estado_sensor} onChange={e => setFormData({...formData, id_estado_sensor: e.target.value})} required>
                      <option value="">-- Seleccionar Estado --</option>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1 italic">* El estado general se marcará como N/A automáticamente.</p>
                  </div>
                ) : (
                  
                  <div>
                    <label className="block text-xs font-bold text-blue-600 mb-1 uppercase text-[9px]">Estado Operativo del Equipo</label>
                    <select className="border p-2 rounded w-full text-sm" value={formData.estado_operativo} onChange={e => setFormData({...formData, estado_operativo: e.target.value})}>
                      <option value="Operativo">Operativo</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Falla">Falla</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Ubicación física" className="border p-2 rounded text-sm w-full" value={formData.ubicacion} onChange={e => setFormData({...formData, ubicacion: e.target.value})} required />
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 ml-1">ÚLT. MANTENIMIENTO</label>
                    <input type="date" className="border p-2 rounded text-sm w-full" value={formData.ultimo_mantenimiento} onChange={e => setFormData({...formData, ultimo_mantenimiento: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow transition">
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

*/

/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit } from 'react-icons/fa';

export default function Sensores() {
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosSensor, setEstadosSensor] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialForm = {
    tipo_nombre: '',
    tipo_descripcion: '',
    marca: '',
    modelo: '',
    ubicacion: '',
    id_plaza: '',
    estado_operativo: 'Operativo', 
    id_estado_sensor: '', 
    fecha_instalacion: new Date().toISOString().split('T')[0],
    ultimo_mantenimiento: ''
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
          modelos_equipo(Id_Modelo, Modelo, Marca),
          plazas(Id_Plaza, Numero_Plaza),
          estado_sensor(id_estado, nombre_estado)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      const { data: plazaData } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
      setPlazas(plazaData || []);

      const { data: estSensor } = await supabase.from('estado_sensor').select('*').order('nombre_estado');
      setEstadosSensor(estSensor || []);
      
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    }
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    setFormData({
      tipo_nombre: disp.tipos_dispositivos?.nombre_tipo || '',
      tipo_descripcion: disp.tipos_dispositivos?.descripcion || '',
      marca: disp.modelos_equipo?.Marca || '',
      modelo: disp.modelos_equipo?.Modelo || '',
      ubicacion: disp.ubicacion || '',
      id_plaza: disp.id_plaza || '',
      estado_operativo: disp.estado_operativo || 'Operativo',
      id_estado_sensor: disp.id_estado || '',
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

    try {
      let id_tipo;
      const { data: exTipo } = await supabase.from('tipos_dispositivos').select('id_tipo').ilike('nombre_tipo', formData.tipo_nombre.trim()).maybeSingle();
      if (exTipo) {
        id_tipo = exTipo.id_tipo;
        await supabase.from('tipos_dispositivos').update({ descripcion: formData.tipo_descripcion }).eq('id_tipo', id_tipo);
      } else {
        const { data: nTipo } = await supabase.from('tipos_dispositivos').insert([{ nombre_tipo: formData.tipo_nombre.trim(), descripcion: formData.tipo_descripcion }]).select();
        id_tipo = nTipo[0].id_tipo;
      }

      let id_modelo;
      const { data: exMod } = await supabase.from('modelos_equipo').select('Id_Modelo').ilike('Modelo', formData.modelo.trim()).ilike('Marca', formData.marca.trim()).maybeSingle();
      if (exMod) { id_modelo = exMod.Id_Modelo; } 
      else {
        const { data: nMod } = await supabase.from('modelos_equipo').insert([{ Modelo: formData.modelo.trim(), Marca: formData.marca.trim(), Tipo: formData.tipo_nombre.trim() }]).select();
        id_modelo = nMod[0].Id_Modelo;
      }

      const dispData = {
        id_tipo,
        id_modelo,
        id_plaza: formData.id_plaza || null,
        ubicacion: formData.ubicacion,
        estado_operativo: esSensor ? 'N/A' : formData.estado_operativo,
        id_estado: esSensor ? (formData.id_estado_sensor || null) : null,
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null
      };

      if (editingId) {
        await supabase.from('dispositivos').update(dispData).eq('id_dispositivo', editingId);
        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        await supabase.from('dispositivos').insert([dispData]);
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
      text: "Se borrarán también los datos técnicos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
      await supabase.from('dispositivos').delete().eq('id_dispositivo', disp.id_dispositivo);
      if (disp.id_modelo) await supabase.from('modelos_equipo').delete().eq('Id_Modelo', disp.id_modelo);
      if (disp.id_tipo) await supabase.from('tipos_dispositivos').delete().eq('id_tipo', disp.id_tipo);
      loadData();
    }
  };

  // FILTRO MEJORADO: Busca por Nombre de Dispositivo (Tipo) y Número de Plaza
  const filteredDispositivos = dispositivos.filter(d => {
    const busqueda = searchTerm.toLowerCase();
    const nombreTipo = (d.tipos_dispositivos?.nombre_tipo || "").toLowerCase();
    const numeroPlaza = (d.plazas?.Numero_Plaza || "").toLowerCase();
    
    return nombreTipo.includes(busqueda) || numeroPlaza.includes(busqueda);
  });

  const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Hardware</h2>
          <p className="text-gray-500">Administración de dispositivos y sensores del parqueo.</p>
        </div>
        <button 
          onClick={() => { setEditingId(null); setFormData(initialForm); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md flex items-center gap-2 transition duration-150"
        >
          <FaPlus /> Nuevo Registro
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Inventario</h3>
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
            <thead className="bg-gray-50 uppercase text-xs text-gray-500 font-bold">
              <tr>
                <th className="px-6 py-3 text-left">Hardware</th>
                <th className="px-6 py-3 text-left">Marca - Modelo</th>
                <th className="px-6 py-3 text-left">Ubicación / Plaza</th>
                <th className="px-6 py-3 text-left">Estado Gral.</th>
                <th className="px-6 py-3 text-left">Estado Sensor</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDispositivos.map((disp) => (
                <tr key={disp.id_dispositivo} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 uppercase">{disp.tipos_dispositivos?.nombre_tipo}</div>
                    <div className="text-[10px] text-gray-400">{disp.tipos_dispositivos?.descripcion || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {disp.modelos_equipo?.Marca} - {disp.modelos_equipo?.Modelo}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-500 text-xs italic mb-1">{disp.ubicacion}</div>
                    
                    {disp.plazas && (
                      <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded inline-block">
                        <span className="text-[10px] font-bold uppercase mr-1">Plaza:</span>
                        <span className="text-lg font-black">{disp.plazas.Numero_Plaza}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${disp.estado_operativo === 'N/A' ? 'text-gray-300' : 'bg-gray-100 text-gray-700 border'}`}>
                      {disp.estado_operativo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {disp.estado_sensor ? (
                      <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] border border-purple-200 uppercase">
                        {disp.estado_sensor.nombre_estado}
                      </span>
                    ) : <span className="text-gray-300 text-[10px]">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => handleEdit(disp)} className="text-blue-500 hover:text-blue-700 transition-colors"><FaEdit size={18}/></button>
                    <button onClick={() => handleDelete(disp)} className="text-red-400 hover:text-red-600 transition-colors"><FaTrash size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh] animate-fadeIn">
            <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2 border-b pb-2">
              <FaMicrochip className="text-blue-600"/> {editingId ? 'Editar Hardware' : 'Nuevo Hardware'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">TIPO DE EQUIPO</label>
                  <input type="text" className="w-full border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" placeholder="Ej: Sensor, Cámara" value={formData.tipo_nombre} onChange={e => setFormData({...formData, tipo_nombre: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">DESCRIPCIÓN</label>
                  <input type="text" className="w-full border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" placeholder="Descripción breve" value={formData.tipo_descripcion} onChange={e => setFormData({...formData, tipo_descripcion: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Marca" className="border p-2 rounded text-sm w-full outline-none focus:ring-1 focus:ring-blue-400" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                <input type="text" placeholder="Modelo" className="border p-2 rounded text-sm w-full outline-none focus:ring-1 focus:ring-blue-400" value={formData.modelo} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">FECHA INSTALACIÓN</label>
                  <input type="date" className="w-full border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" value={formData.fecha_instalacion} onChange={e => setFormData({...formData, fecha_instalacion: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">VINCULAR PLAZA</label>
                  <select className="border p-2 rounded w-full text-sm outline-none focus:ring-1 focus:ring-blue-400" value={formData.id_plaza} onChange={e => setFormData({...formData, id_plaza: e.target.value})}>
                    <option value="">Ninguna</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                {esSensor ? (
                  <div>
                    <label className="block text-xs font-bold text-purple-600 mb-1 uppercase text-[9px]">Estado del Sensor (Específico)</label>
                    <select className="border p-2 rounded w-full text-sm bg-purple-50 border-purple-200 outline-none focus:ring-1 focus:ring-purple-400" value={formData.id_estado_sensor} onChange={e => setFormData({...formData, id_estado_sensor: e.target.value})} required>
                      <option value="">-- Seleccionar Estado --</option>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1 italic">* El estado general se marcará como N/A automáticamente.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-blue-600 mb-1 uppercase text-[9px]">Estado Operativo del Equipo</label>
                    <select className="border p-2 rounded w-full text-sm outline-none focus:ring-1 focus:ring-blue-400" value={formData.estado_operativo} onChange={e => setFormData({...formData, estado_operativo: e.target.value})}>
                      <option value="Operativo">Operativo</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Falla">Falla</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Ubicación física" className="border p-2 rounded text-sm w-full outline-none focus:ring-1 focus:ring-blue-400" value={formData.ubicacion} onChange={e => setFormData({...formData, ubicacion: e.target.value})} required />
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 ml-1">ÚLT. MANTENIMIENTO</label>
                    <input type="date" className="border p-2 rounded text-sm w-full outline-none focus:ring-1 focus:ring-blue-400" value={formData.ultimo_mantenimiento} onChange={e => setFormData({...formData, ultimo_mantenimiento: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow transition-all active:scale-95">
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

*/

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit } from 'react-icons/fa';

export default function Sensores() {
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosSensor, setEstadosSensor] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialForm = {
    tipo_nombre: '',
    tipo_descripcion: '',
    marca: '',
    modelo: '',
    ubicacion: '',
    id_plaza: '',
    estado_operativo: 'Operativo', 
    id_estado_sensor: '', 
    fecha_instalacion: new Date().toISOString().split('T')[0],
    ultimo_mantenimiento: ''
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
          modelos_equipo(Id_Modelo, Modelo, Marca),
          plazas(Id_Plaza, Numero_Plaza),
          estado_sensor(id_estado, nombre_estado)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      const { data: plazaData } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
      setPlazas(plazaData || []);

      const { data: estSensor } = await supabase.from('estado_sensor').select('*').order('nombre_estado');
      setEstadosSensor(estSensor || []);
      
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    }
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    setFormData({
      tipo_nombre: disp.tipos_dispositivos?.nombre_tipo || '',
      tipo_descripcion: disp.tipos_dispositivos?.descripcion || '',
      marca: disp.modelos_equipo?.Marca || '',
      modelo: disp.modelos_equipo?.Modelo || '',
      ubicacion: disp.ubicacion || '',
      id_plaza: disp.id_plaza || '',
      estado_operativo: disp.estado_operativo || 'Operativo',
      id_estado_sensor: disp.id_estado || '',
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

    try {
      let id_tipo;
      const { data: exTipo } = await supabase.from('tipos_dispositivos').select('id_tipo').ilike('nombre_tipo', formData.tipo_nombre.trim()).maybeSingle();
      if (exTipo) {
        id_tipo = exTipo.id_tipo;
        await supabase.from('tipos_dispositivos').update({ descripcion: formData.tipo_descripcion }).eq('id_tipo', id_tipo);
      } else {
        const { data: nTipo } = await supabase.from('tipos_dispositivos').insert([{ nombre_tipo: formData.tipo_nombre.trim(), descripcion: formData.tipo_descripcion }]).select();
        id_tipo = nTipo[0].id_tipo;
      }

      let id_modelo;
      const { data: exMod } = await supabase.from('modelos_equipo').select('Id_Modelo').ilike('Modelo', formData.modelo.trim()).ilike('Marca', formData.marca.trim()).maybeSingle();
      if (exMod) { id_modelo = exMod.Id_Modelo; } 
      else {
        const { data: nMod } = await supabase.from('modelos_equipo').insert([{ Modelo: formData.modelo.trim(), Marca: formData.marca.trim(), Tipo: formData.tipo_nombre.trim() }]).select();
        id_modelo = nMod[0].Id_Modelo;
      }

      const dispData = {
        id_tipo,
        id_modelo,
        id_plaza: formData.id_plaza || null,
        ubicacion: formData.ubicacion,
        estado_operativo: esSensor ? 'N/A' : formData.estado_operativo,
        id_estado: esSensor ? (formData.id_estado_sensor || null) : null,
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null
      };

      if (editingId) {
        await supabase.from('dispositivos').update(dispData).eq('id_dispositivo', editingId);
        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        await supabase.from('dispositivos').insert([dispData]);
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
      text: "Se borrarán también los datos técnicos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    });

    if (result.isConfirmed) {
      await supabase.from('dispositivos').delete().eq('id_dispositivo', disp.id_dispositivo);
      if (disp.id_modelo) await supabase.from('modelos_equipo').delete().eq('Id_Modelo', disp.id_modelo);
      if (disp.id_tipo) await supabase.from('tipos_dispositivos').delete().eq('id_tipo', disp.id_tipo);
      loadData();
    }
  };

  const filteredDispositivos = dispositivos.filter(d => {
    const busqueda = searchTerm.toLowerCase();
    const nombreTipo = (d.tipos_dispositivos?.nombre_tipo || "").toLowerCase();
    const numeroPlaza = (d.plazas?.Numero_Plaza || "").toLowerCase();
    
    return nombreTipo.includes(busqueda) || numeroPlaza.includes(busqueda);
  });

  const esSensor = formData.tipo_nombre.toLowerCase().includes('sensor');

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
                <th className="px-6 py-4 text-left">Ubicación / Plaza</th>
                <th className="px-6 py-4 text-left">Estado Gral.</th>
                <th className="px-6 py-4 text-left">Estado Sensor</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredDispositivos.map((disp) => (
                <tr key={disp.id_dispositivo} className="hover:bg-gray-50/50 transition duration-150 group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 uppercase">{disp.tipos_dispositivos?.nombre_tipo}</div>
                    <div className="text-[10px] text-gray-400 italic">{disp.tipos_dispositivos?.descripcion || '-'}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-600">
                    {disp.modelos_equipo?.Marca} - {disp.modelos_equipo?.Modelo}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-500 text-[10px] uppercase font-bold mb-1.5">{disp.ubicacion}</div>
                    {/* PLAZA MÁS PEQUEÑA Y ESTÉTICA EN COLOR #2eb17b */}
                    {disp.plazas && (
                      <div className="inline-flex items-center gap-1.5 bg-[#2eb17b]/10 border border-[#2eb17b] px-2.5 py-0.5 rounded-md shadow-sm">
                        <span className="text-[9px] font-black text-[#2eb17b] uppercase tracking-tighter">Plaza</span>
                        <span className="text-sm font-black text-[#2eb17b]">{disp.plazas.Numero_Plaza}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${disp.estado_operativo === 'N/A' ? 'text-gray-300' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                      {disp.estado_operativo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {disp.estado_sensor ? (
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200 uppercase tracking-tighter">
                        {disp.estado_sensor.nombre_estado}
                      </span>
                    ) : <span className="text-gray-300 text-[10px] italic">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onClick={() => handleEdit(disp)} className="text-blue-500 hover:text-blue-700"><FaEdit size={17}/></button>
                    <button onClick={() => handleDelete(disp)} className="text-red-400 hover:text-red-600"><FaTrash size={15}/></button>
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
              <FaMicrochip className="text-blue-600"/> {editingId ? 'Editar Hardware' : 'Nuevo Hardware'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">TIPO DE EQUIPO</label>
                  <input type="text" className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" placeholder="Ej: Sensor, Cámara" value={formData.tipo_nombre} onChange={e => setFormData({...formData, tipo_nombre: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">DESCRIPCIÓN</label>
                  <input type="text" className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" placeholder="Descripción breve" value={formData.tipo_descripcion} onChange={e => setFormData({...formData, tipo_descripcion: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Marca" className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.marca} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                <input type="text" placeholder="Modelo" className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.modelo} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">FECHA INSTALACIÓN</label>
                  <input type="date" className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.fecha_instalacion} onChange={e => setFormData({...formData, fecha_instalacion: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">VINCULAR PLAZA</label>
                  <select className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all" value={formData.id_plaza} onChange={e => setFormData({...formData, id_plaza: e.target.value})}>
                    <option value="">Ninguna</option>
                    {plazas.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                {esSensor ? (
                  <div>
                    <label className="block text-[10px] font-black text-purple-600 mb-1 uppercase tracking-widest">Estado del Sensor (Específico)</label>
                    <select className="border p-2 rounded-lg w-full text-sm bg-purple-50 border-purple-200 outline-none focus:ring-2 focus:ring-purple-200" value={formData.id_estado_sensor} onChange={e => setFormData({...formData, id_estado_sensor: e.target.value})} required>
                      <option value="">-- Seleccionar Estado --</option>
                      {estadosSensor.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre_estado}</option>)}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1 italic">* El estado general se marcará como N/A automáticamente.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-blue-600 mb-1 uppercase tracking-widest">Estado Operativo del Equipo</label>
                    <select className="border p-2 rounded-lg w-full text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" value={formData.estado_operativo} onChange={e => setFormData({...formData, estado_operativo: e.target.value})}>
                      <option value="Operativo">Operativo</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Falla">Falla</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Ubicación física" className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" value={formData.ubicacion} onChange={e => setFormData({...formData, ubicacion: e.target.value})} required />
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 ml-1 uppercase">Últ. Mant.</label>
                    <input type="date" className="border p-2 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" value={formData.ultimo_mantenimiento} onChange={e => setFormData({...formData, ultimo_mantenimiento: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-bold uppercase text-[10px] tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="px-8 py-2 bg-blue-600 text-white rounded-lg font-black hover:bg-blue-700 shadow shadow-blue-200 transition-all active:scale-95 uppercase text-[10px] tracking-widest">
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
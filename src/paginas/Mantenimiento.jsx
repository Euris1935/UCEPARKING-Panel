

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaWrench, FaTools, FaFilter, FaCalendarAlt } from 'react-icons/fa';

export default function Mantenimiento() {
  const [mantenimientos, setMantenimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Catalogos para el formulario
  const [dispositivos, setDispositivos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]); 
  const [tiposMantenimiento, setTiposMantenimiento] = useState([]);
  const [estadosMantenimiento, setEstadosMantenimiento] = useState([]);

  // Modal y Formulario
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    descripcion: '',
    id_dispositivo: '',
    id_tecnico: '',
    id_tipo: '', 
    fecha_inicio: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        
        const { data: mantData, error } = await supabase
            .from('mantenimientos')
            .select(`
                Id_Mantenimiento,
                Fecha_Inicio,
                Fecha_Fin,
                Descripcion_Problema,
                
                estado_mantenimiento ( nombre_estado ),
                tipo_mantenimiento ( nombre_tipo ),
                dispositivos ( 
                    ubicacion, 
                    tipos_dispositivos ( nombre_tipo ) 
                ),
                empleados ( 
                    personas ( nombre, apellido ) 
                )
            `)
            .order('Fecha_Inicio', { ascending: false });

        if (error) throw error;
        setMantenimientos(mantData || []);

        
        const { data: dispData } = await supabase.from('dispositivos').select('id_dispositivo, ubicacion, tipos_dispositivos(nombre_tipo)').eq('estado_operativo', 'Activo'); // Solo mostrar activos?
        const { data: empData } = await supabase.from('empleados').select('Id_Empleado, personas(nombre, apellido)');
        const { data: tipoData } = await supabase.from('tipo_mantenimiento').select('*');
        const { data: estData } = await supabase.from('estado_mantenimiento').select('*');

        setDispositivos(dispData || []);
        setTecnicos(empData || []);
        setTiposMantenimiento(tipoData || []);
        setEstadosMantenimiento(estData || []);

    } catch (error) {
        console.error("Error cargando mantenimientos:", error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        
        const estadoInicial = estadosMantenimiento.find(e => e.nombre_estado.toLowerCase().includes('pendiente'))?.id_estado || 1;

        const { error } = await supabase.from('mantenimientos').insert([{
            Descripcion_Problema: formData.descripcion,
            Fecha_Inicio: formData.fecha_inicio,
            id_dispositivo: parseInt(formData.id_dispositivo),
            ID_Empleado_Tecnico: parseInt(formData.id_tecnico),
            id_tipo_mantenimiento: parseInt(formData.id_tipo),
            id_estado: estadoInicial,
            Tipo_Dispositivo_Afectado: 'Hardware', 
            Estado_Mantenimiento: 'Pendiente'
        }]);

        if (error) throw error;

        Swal.fire('Creado', 'Solicitud de mantenimiento registrada', 'success');
        setShowModal(false);
        setFormData({ descripcion: '', id_dispositivo: '', id_tecnico: '', id_tipo: '', fecha_inicio: new Date().toISOString().split('T')[0] });
        loadData();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };

  const handleResolve = async (id) => {
      const { value: confirm } = await Swal.fire({
          title: '¿Marcar como Resuelto?',
          text: "El dispositivo volverá a estar operativo.",
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, finalizar'
      });

      if (confirm) {
          // Buscar ID de estado Resuelto
          const idResuelto = estadosMantenimiento.find(e => e.nombre_estado.toLowerCase().includes('resuelto'))?.id_estado;

          const { error } = await supabase.from('mantenimientos').update({
              id_estado: idResuelto,
              Fecha_Fin: new Date().toISOString(),
              Estado_Mantenimiento: 'Resuelto' // Legacy
          }).eq('Id_Mantenimiento', id);

          if (!error) {
              Swal.fire('Listo', 'Mantenimiento finalizado.', 'success');
              loadData();
          }
      }
  };

  // Filtrado
  const filteredItems = mantenimientos.filter(m => 
    m.Descripcion_Problema.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.empleados?.personas?.nombre + ' ' + m.empleados?.personas?.apellido).toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.dispositivos?.tipos_dispositivos?.nombre_tipo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Mantenimiento</h2>
          <p className="text-gray-500">Gestión de incidencias, reparaciones preventivas y correctivas.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow flex items-center gap-2 transition"
        >
          <FaPlus /> Nueva Solicitud
        </button>
      </header>

     
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-4">
        <div className="relative flex-1">
            <input 
                type="text" 
                placeholder="Buscar por descripción, técnico o dispositivo..." 
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
        </div>
        <FaFilter className="text-gray-400" />
      </div>

     
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Dispositivo / Ubicación</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Problema</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Técnico</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                  <tr><td colSpan="7" className="text-center py-8">Cargando datos...</td></tr>
              ) : filteredItems.length === 0 ? (
                  <tr><td colSpan="7" className="text-center py-8 text-gray-500">No hay mantenimientos registrados.</td></tr>
              ) : (
                  filteredItems.map(item => (
                    <tr key={item.Id_Mantenimiento} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                            <div className="text-sm font-bold text-gray-900">{item.dispositivos?.tipos_dispositivos?.nombre_tipo || 'Dispositivo Desconocido'}</div>
                            <div className="text-xs text-gray-500">{item.dispositivos?.ubicacion || 'Sin ubicación'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={item.Descripcion_Problema}>
                            {item.Descripcion_Problema}
                        </td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full border ${
                                item.tipo_mantenimiento?.nombre_tipo === 'Preventivo' 
                                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                : 'bg-orange-50 text-orange-700 border-orange-200'
                            }`}>
                                {item.tipo_mantenimiento?.nombre_tipo || 'N/A'}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                            {item.empleados?.personas?.nombre} {item.empleados?.personas?.apellido}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                                <FaCalendarAlt className="text-gray-400" size={12}/> 
                                {new Date(item.Fecha_Inicio).toLocaleDateString()}
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                item.estado_mantenimiento?.nombre_estado === 'Resuelto' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                                {item.estado_mantenimiento?.nombre_estado || item.Estado_Mantenimiento}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                            {item.estado_mantenimiento?.nombre_estado !== 'Resuelto' && (
                                <button 
                                    onClick={() => handleResolve(item.Id_Mantenimiento)}
                                    className="text-green-600 hover:bg-green-50 p-2 rounded-full transition" 
                                    title="Marcar como Resuelto"
                                >
                                    <FaCheckCircle size={18} />
                                </button>
                            )}
                        </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

     
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FaTools className="text-primary" /> Nueva Solicitud
                    </h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Dispositivo *</label>
                            <select 
                                required 
                                className="w-full border p-2 rounded bg-gray-50"
                                value={formData.id_dispositivo}
                                onChange={e => setFormData({...formData, id_dispositivo: e.target.value})}
                            >
                                <option value="">Seleccionar...</option>
                                {dispositivos.map(d => (
                                    <option key={d.id_dispositivo} value={d.id_dispositivo}>
                                        {d.tipos_dispositivos?.nombre_tipo} - {d.ubicacion}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Tipo Mantenimiento *</label>
                            <select 
                                required 
                                className="w-full border p-2 rounded bg-gray-50"
                                value={formData.id_tipo}
                                onChange={e => setFormData({...formData, id_tipo: e.target.value})}
                            >
                                <option value="">Seleccionar...</option>
                                {tiposMantenimiento.map(t => (
                                    <option key={t.id_tipo} value={t.id_tipo}>{t.nombre_tipo}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Técnico Asignado *</label>
                        <select 
                            required 
                            className="w-full border p-2 rounded bg-gray-50"
                            value={formData.id_tecnico}
                            onChange={e => setFormData({...formData, id_tecnico: e.target.value})}
                        >
                            <option value="">Seleccionar...</option>
                            {tecnicos.map(t => (
                                <option key={t.Id_Empleado} value={t.Id_Empleado}>
                                    {t.personas?.nombre} {t.personas?.apellido}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Fecha Inicio</label>
                        <input 
                            type="date" 
                            required
                            className="w-full border p-2 rounded bg-gray-50"
                            value={formData.fecha_inicio}
                            onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Descripción del Problema *</label>
                        <textarea 
                            required 
                            rows="3"
                            className="w-full border p-2 rounded bg-gray-50"
                            placeholder="Detalle la falla o tarea a realizar..."
                            value={formData.descripcion}
                            onChange={e => setFormData({...formData, descripcion: e.target.value})}
                        ></textarea>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow">Registrar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}

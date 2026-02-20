

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { 
    FaSearch, FaPlus, FaUserTie, FaTrash, FaSuitcase, FaCalendarAlt 
} from 'react-icons/fa';

export default function Asignaciones() {
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Catálogos
  const [empleadosList, setEmpleadosList] = useState([]);
  const [plazasList, setPlazasList] = useState([]);

  // Formulario
  const initialForm = { 
      Id_Empleado: '', 
      Id_Plaza: '', 
      Fecha_Inicio: new Date().toISOString().split('T')[0], 
      Notas: '' 
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        
        const { data: asigData, error: asigError } = await supabase
            .from('asignaciones_parqueo')
            .select(`
                *,
                empleados:Id_Empleado_Asignado ( 
                    Id_Empleado, 
                    personas:persona_id ( nombre, apellido ) 
                ),
                plazas:Id_Plaza ( 
                    Id_Plaza, 
                    Numero_Plaza 
                )
            `)
            .order('Fecha_Inicio', { ascending: false });

        if (asigError) {
            console.error("Error cargando asignaciones:", asigError);
        } else {
            setAsignaciones(asigData || []);
        }

      
        const { data: empData, error: empError } = await supabase
            .from('empleados')
            .select(`
                Id_Empleado, 
                personas:persona_id ( nombre, apellido )
            `);
            
        if (empError) console.error("Error empleados:", empError);
        else setEmpleadosList(empData || []);

 
        const { data: plazaData, error: plazaError } = await supabase
            .from('plazas')
            .select('Id_Plaza, Numero_Plaza')
            .order('Numero_Plaza');
            
        if (plazaError) console.error("Error plazas:", plazaError);
        else setPlazasList(plazaData || []);

    } catch (error) {
        console.error("Error general:", error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.Id_Empleado || !formData.Id_Plaza) {
          return Swal.fire('Error', 'Debe seleccionar empleado y plaza', 'warning');
      }

      try {
          setLoading(true);
          
          // Crear la asignación
          const { error: insertError } = await supabase.from('asignaciones_parqueo').insert([{
              Id_Empleado_Asignado: parseInt(formData.Id_Empleado),
              Id_Plaza: parseInt(formData.Id_Plaza),
              Fecha_Inicio: formData.Fecha_Inicio,
              Notas: formData.Notas,
              Estado_Asignacion: 'Activa'
          }]);

          if (insertError) throw insertError;

         
          const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'OCUPADA').maybeSingle();
          const idOcupada = est?.id_estado || 2; 

          await supabase.from('plazas').update({ 
              Estado_Actual: 'OCUPADA', 
              id_estado: idOcupada 
          }).eq('Id_Plaza', formData.Id_Plaza);

          Swal.fire('Éxito', 'Plaza asignada correctamente.', 'success');
          setFormData(initialForm);
          setShowModal(false);
          loadData(); 

      } catch (error) {
          Swal.fire('Error', error.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleLiberar = async (asignacion) => {
      const result = await Swal.fire({
          title: '¿Liberar Plaza?',
          text: "Se eliminará la asignación y la plaza quedará libre.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, liberar',
          confirmButtonColor: '#d33'
      });

      if (result.isConfirmed) {
          try {
             
              const { error } = await supabase.from('asignaciones_parqueo').delete().eq('Id_Asignacion', asignacion.Id_Asignacion);
              if (error) throw error;

              
              const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'LIBRE').maybeSingle();
              const idLibre = est?.id_estado || 1;

              await supabase.from('plazas').update({ 
                  Estado_Actual: 'LIBRE', 
                  id_estado: idLibre 
              }).eq('Id_Plaza', asignacion.Id_Plaza);

              Swal.fire('Liberado', 'La plaza está disponible nuevamente.', 'success');
              loadData();

          } catch (error) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  
  const filteredData = asignaciones.filter(item => {
      const nombre = item.empleados?.personas?.nombre || '';
      const apellido = item.empleados?.personas?.apellido || '';
      const plaza = item.plazas?.Numero_Plaza || '';
      const fullString = `${nombre} ${apellido} ${plaza}`.toLowerCase();
      return fullString.includes(searchTerm.toLowerCase());
  });

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Asignaciones Fijas</h2>
          <p className="text-gray-500">Gestión de parqueos asignados a empleados.</p>
        </div>
        <button 
            onClick={() => setShowModal(true)} 
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold shadow flex items-center gap-2 transition"
        >
            <FaPlus /> Nueva Asignación
        </button>
      </header>

      
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-end mb-4">
            <div className="relative w-64">
                <input 
                    type="text" 
                    placeholder="Buscar empleado o plaza..." 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-purple-500"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-purple-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Empleado</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Plaza</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Fecha Inicio</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-purple-800 uppercase">Notas</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-purple-800 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {filteredData.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay asignaciones registradas.</td></tr>
                    ) : (
                        filteredData.map(item => (
                            <tr key={item.Id_Asignacion} className="hover:bg-purple-50/20 transition">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                                    <div className="bg-purple-100 p-2 rounded-full text-purple-600"><FaUserTie /></div>
                                    
                                    {item.empleados?.personas ? 
                                        `${item.empleados.personas.nombre} ${item.empleados.personas.apellido}` 
                                        : <span className="text-gray-400 italic">Sin datos</span>
                                    }
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-700">
                                    {item.plazas?.Numero_Plaza || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <FaCalendarAlt className="text-gray-400"/>
                                        {item.Fecha_Inicio ? new Date(item.Fecha_Inicio).toLocaleDateString() : '-'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate">
                                    {item.Notas || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <button 
                                        onClick={() => handleLiberar(item)}
                                        className="text-red-600 hover:bg-red-50 px-3 py-1 rounded border border-red-200 text-xs font-bold transition"
                                    >
                                        <FaTrash className="inline mr-1"/> Liberar
                                    </button>
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
            <div className="bg-white p-6 rounded-lg shadow-xl w-96 animate-fade-in-down border-t-4 border-purple-600">
                <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    <FaSuitcase className="text-purple-600"/> Asignar Plaza
                </h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empleado</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-purple-500"
                            value={formData.Id_Empleado}
                            onChange={e => setFormData({...formData, Id_Empleado: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar --</option>
                            {empleadosList.map(emp => (
                                <option key={emp.Id_Empleado} value={emp.Id_Empleado}>
                                    
                                    {emp.personas ? `${emp.personas.nombre} ${emp.personas.apellido}` : `Empleado #${emp.Id_Empleado}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Plaza Disponible</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-purple-500"
                            value={formData.Id_Plaza}
                            onChange={e => setFormData({...formData, Id_Plaza: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar --</option>
                            {plazasList.map(p => (
                                <option key={p.Id_Plaza} value={p.Id_Plaza}>
                                    {p.Numero_Plaza}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                        <input 
                            type="date" 
                            className="w-full border p-2 rounded focus:ring-purple-500"
                            value={formData.Fecha_Inicio}
                            onChange={e => setFormData({...formData, Fecha_Inicio: e.target.value})}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                        <textarea 
                            className="w-full border p-2 rounded focus:ring-purple-500"
                            rows="2"
                            placeholder="Detalles..."
                            value={formData.Notas}
                            onChange={e => setFormData({...formData, Notas: e.target.value})}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold shadow">
                            {loading ? 'Guardando...' : 'Guardar Asignación'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}




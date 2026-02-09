

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaDownload, FaFileAlt, FaPlus, FaTrash, FaUser } from 'react-icons/fa';

export default function Reportes() {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados 
  const [showModal, setShowModal] = useState(false);
  const [tipoReporte, setTipoReporte] = useState('');
  const [descripcion, setDescripcion] = useState(''); 

  useEffect(() => { loadReportes(); }, []);

  const loadReportes = async () => {
    try {
        const { data, error } = await supabase
          .from('reportes')
          .select(`
            *,
            personas (nombre, apellido)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setReportes(data || []);
    } catch (error) {
        console.error("Error cargando reportes:", error.message);
    }
  };

  const handleCreateReport = async () => {
    if (!tipoReporte) return Swal.fire('Atención', "Selecciona un tipo de reporte.", 'warning');
    if (!descripcion.trim()) return Swal.fire('Atención', "Agrega una descripción.", 'warning');
    
    setLoading(true);

    try {
        // Obtener usuario autenticado 
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("No hay sesión activa.");

        // Buscar el persona_id asociado a este usuario
        const { data: usuarioData, error: userError } = await supabase
            .from('usuarios')
            .select('persona_id')
            .eq('id', user.id)
            .single();
        
        if (userError || !usuarioData) throw new Error("No se encontró el perfil de persona asociado.");

        
        const rutaFicticia = `/reportes/${tipoReporte.toLowerCase().replace(/ /g, '_')}_${Date.now()}.pdf`;

        //Insertar en reportes
        const { error } = await supabase.from('reportes').insert([{
            Tipo_Reporte: tipoReporte,
            Descripcion: descripcion, 
            Datos_Adjuntos_Ruta: rutaFicticia,
            persona_id: usuarioData.persona_id 
        }]);

        if (error) throw error;

        Swal.fire('Generado', "Reporte creado exitosamente.", 'success');
        
        setShowModal(false);
        setTipoReporte('');
        setDescripcion('');
        loadReportes();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id) => {
      const result = await Swal.fire({
          title: '¿Eliminar reporte?',
          text: "Se borrará del historial permanentemente.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sí, eliminar'
      });

      if (result.isConfirmed) {
          const { error } = await supabase.from('reportes').delete().eq('Id_Reporte', id);
          
          if (error) Swal.fire('Error', error.message, 'error');
          else {
              Swal.fire('Eliminado', 'El reporte ha sido eliminado.', 'success');
              loadReportes();
          }
      }
  };

  const filteredReportes = reportes.filter(r => 
    r.Tipo_Reporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.personas?.nombre + ' ' + r.personas?.apellido).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Reportes</h2>
          <p className="text-gray-500">Historial de reportes e incidencias.</p>
        </div>
        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition"
          onClick={() => setShowModal(true)}
        >
          <FaPlus /> Generar Nuevo Reporte
        </button>
      </header>

      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Nuevo Reporte</h3>
                
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 text-gray-700">Tipo de Reporte:</label>
                    <select 
                        className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                        value={tipoReporte}
                        onChange={(e) => setTipoReporte(e.target.value)}
                    >
                        <option value="">-- Seleccionar --</option>
                        <option value="Ocupación Diaria">Ocupación Diaria</option>
                        <option value="Ingresos Financieros">Ingresos Financieros</option>
                        <option value="Incidencias Técnicas">Incidencias Técnicas</option>
                        <option value="Actividad de Usuarios">Actividad de Usuarios</option>
                    </select>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium mb-1 text-gray-700">Descripción / Observaciones:</label>
                    <textarea 
                        className="w-full border p-2 rounded h-24 resize-none focus:ring-primary focus:border-primary"
                        placeholder="Escriba los detalles del reporte aquí..."
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                    ></textarea>
                </div>
                
                <div className="flex justify-end gap-2 pt-2 border-t">
                    <button 
                        onClick={() => setShowModal(false)} 
                        className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleCreateReport} 
                        disabled={loading} 
                        className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50 transition shadow"
                    >
                        {loading ? "Guardando..." : "Guardar"}
                    </button>
                </div>
            </div>
        </div>
      )}

      
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Documentos Recientes</h3>
            <div className="relative w-64">
                <input 
                    type="text" placeholder="Buscar reporte..." 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase text-xs">Detalles del Reporte</th>
                <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase text-xs">Fecha Creación</th>
                <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase text-xs">Generado Por</th>
                <th className="px-6 py-3 text-center font-bold text-gray-500 uppercase text-xs">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredReportes.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-gray-500">No hay reportes generados aún.</td></tr>
              ) : (
                filteredReportes.map(r => (
                <tr key={r.Id_Reporte} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                        <div className="bg-blue-50 p-2 rounded-lg mr-3">
                            <FaFileAlt className='text-blue-600 text-lg'/> 
                        </div>
                        <div>
                            <p className="font-bold text-gray-900">{r.Tipo_Reporte}</p>
                            <p className="text-xs text-gray-500 max-w-xs truncate" title={r.Descripcion}>
                                {r.Descripcion || "Sin descripción"}
                            </p>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-gray-100 p-1.5 rounded-full text-gray-500 border border-gray-200">
                            <FaUser className="text-xs"/>
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                            {r.personas ? `${r.personas.nombre} ${r.personas.apellido}` : 'Sistema / Desconocido'}
                        </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 flex gap-3 justify-center">
                    <button 
                        onClick={() => Swal.fire('Descarga', `Simulando descarga de: ${r.Datos_Adjuntos_Ruta}`, 'info')} 
                        className="text-green-600 hover:text-green-800 bg-green-50 p-2 rounded-full transition" 
                        title="Descargar PDF"
                    >
                        <FaDownload />
                    </button>
                    <button 
                        onClick={() => handleDelete(r.Id_Reporte)} 
                        className="text-red-600 hover:text-red-800 bg-red-50 p-2 rounded-full transition" 
                        title="Eliminar"
                    >
                        <FaTrash />
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
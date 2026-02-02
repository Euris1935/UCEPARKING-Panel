

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaDownload, FaFileAlt, FaPlus, FaTrash, FaUser } from 'react-icons/fa';

export default function Reportes() {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Estados 
  const [showModal, setShowModal] = useState(false);
  const [tipoReporte, setTipoReporte] = useState('');
  const [descripcion, setDescripcion] = useState(''); 

  useEffect(() => { loadReportes(); }, []);

  const loadReportes = async () => {
    
    const { data, error } = await supabase
      .from('REPORTE')
      .select(`
        Id_Reporte, 
        Fecha_Creacion, 
        Tipo_Reporte, 
        Descripcion,
        Datos_Adjuntos_Ruta, 
        USUARIO (Nombre, Apellido)
      `)
      .order('Fecha_Creacion', { ascending: false });

    if (error) console.error("Error cargando reportes:", error);
    setReportes(data || []);
  };

  const handleCreateReport = async () => {
    if (!tipoReporte) return alert("Por favor selecciona un tipo de reporte.");
    if (!descripcion.trim()) return alert("Por favor agrega una descripción al reporte.");
    
    setLoading(true);

    try {
        // Obtener usuario autenticado actual
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) throw new Error("No hay sesión activa.");

        // Simular ruta del archivo
        const rutaFicticia = `/reportes/${tipoReporte.toLowerCase().replace(/ /g, '_')}_${Date.now()}.pdf`;

        //  Insertar en BD
        const { error } = await supabase.from('REPORTE').insert([{
            Tipo_Reporte: tipoReporte,
            Descripcion: descripcion, 
            Datos_Adjuntos_Ruta: rutaFicticia,
            Id_Usuario_Generador: user.id 
        }]);

        if (error) throw error;

        alert("Reporte generado exitosamente.");
        
      
        setShowModal(false);
        setTipoReporte('');
        setDescripcion('');
        loadReportes();

    } catch (error) {
        alert("Error al generar reporte: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id) => {
      if(window.confirm("¿Eliminar este reporte del historial?")) {
          const { error } = await supabase.from('REPORTE').delete().eq('Id_Reporte', id);
          if (error) alert("Error al eliminar");
          else loadReportes();
      }
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Reportes</h2>
          <p className="text-gray-500">Historial de reportes e incidencias.</p>
        </div>
        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md"
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
                
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => setShowModal(false)} 
                        className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleCreateReport} 
                        disabled={loading} 
                        className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? "Guardando..." : "Guardar Reporte"}
                    </button>
                </div>
            </div>
        </div>
      )}

      
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Detalles del Reporte</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Generado Por</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reportes.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-gray-500">No hay reportes generados aún.</td></tr>
              ) : (
                reportes.map(r => (
                <tr key={r.Id_Reporte} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                        <FaFileAlt className='text-primary text-xl mr-3'/> 
                        <div>
                            <p className="font-bold text-gray-900">{r.Tipo_Reporte}</p>
                            
                            <p className="text-sm text-gray-500 max-w-xs truncate" title={r.Descripcion}>
                                {r.Descripcion || "Sin descripción"}
                            </p>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(r.Fecha_Creacion).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-gray-200 p-1.5 rounded-full text-gray-500">
                            <FaUser className="text-xs"/>
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                           
                            {r.USUARIO ? `${r.USUARIO.Nombre} ${r.USUARIO.Apellido}` : 'Usuario Desconocido'}
                        </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 flex gap-3">
                    <button onClick={() => alert(`Simulando descarga de: ${r.Datos_Adjuntos_Ruta}`)} className="text-green-600 hover:text-green-800" title="Descargar PDF"><FaDownload /></button>
                    <button onClick={() => handleDelete(r.Id_Reporte)} className="text-red-600 hover:text-red-800" title="Eliminar"><FaTrash /></button>
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

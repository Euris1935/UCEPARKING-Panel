

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaDownload, FaFileAlt, FaPlus, FaTrash, FaUser } from 'react-icons/fa';

export default function Reportes() {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [tipoReporte, setTipoReporte] = useState('');
  const [descripcion, setDescripcion] = useState(''); 
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Estados Previas
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    if (!fechaDesde || !fechaHasta) return Swal.fire('Atención', "Selecciona las fechas para el reporte.", 'warning');
    if (new Date(fechaDesde) > new Date(fechaHasta)) return Swal.fire('Atención', "La fecha de inicio no puede ser mayor a la fecha de fin.", 'warning');
    
    setLoading(true);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa.");

        const url = 'http://localhost:4000/api/reports';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            fechaDesde: `${fechaDesde}T00:00:00.000Z`,
            fechaHasta: `${fechaHasta}T23:59:59.999Z`,
            tipo: tipoReporte,
            descripcion
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Error al generar reporte en el backend.");

        Swal.fire('Generado', "Reporte creado exitosamente.", 'success');
        
        setShowModal(false);
        setTipoReporte('');
        setDescripcion('');
        setFechaDesde('');
        setFechaHasta('');
        loadReportes();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const handlePreviewNewReport = async () => {
    if (!tipoReporte) return Swal.fire('Atención', "Selecciona un tipo de reporte.", 'warning');
    if (!fechaDesde || !fechaHasta) return Swal.fire('Atención', "Selecciona las fechas para el reporte.", 'warning');
    if (new Date(fechaDesde) > new Date(fechaHasta)) return Swal.fire('Atención', "La fecha de inicio no puede ser mayor a la fecha de fin.", 'warning');
    
    setPreviewLoading(true);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa.");

        const url = 'http://localhost:4000/api/reports/preview';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            fechaDesde: `${fechaDesde}T00:00:00.000Z`,
            fechaHasta: `${fechaHasta}T23:59:59.999Z`,
            tipo: tipoReporte
          })
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(resData.message || resData.error || "Error al previsualizar reporte.");

        setPreviewData({
            tipo: tipoReporte,
            descripcion: descripcion || "Previsualización (Aún no guardado)",
            fecha_creacion: new Date().toISOString(),
            data: resData.data
        });
        setShowPreviewModal(true);

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setPreviewLoading(false);
    }
  };

  const handlePreviewExistingReport = async (id) => {
    setPreviewLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa.");

        const url = `http://localhost:4000/api/reports/${id}/preview`;
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(resData.message || resData.error || "Error al previsualizar reporte.");

        setPreviewData(resData);
        setShowPreviewModal(true);
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setPreviewLoading(false);
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

  const handleDownloadExcel = async (id, title) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No hay sesión activa.");

        const url = `http://localhost:4000/api/reports/${id}/download`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.error || errData.message || "Error descargando Documento");
        }

        const blob = await res.blob();
        const objUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = objUrl;
        link.download = `reporte_${title.replace(/ /g, '_')}_${id}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
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
                        <option value="GENERAL">General (Ocupación, Ingresos, y Accesos)</option>
                        <option value="EVENTOS">Eventos (Registro de actividad de hardware/sistema)</option>
                        <option value="OCUPACION">Ocupación Diaria</option>
                        <option value="INCIDENCIAS">Incidencias Técnicas</option>
                        <option value="ACTIVIDAD">Actividad de Usuarios</option>
                    </select>
                </div>

                <div className="flex gap-4 mb-4">
                    <div className="w-1/2">
                        <label className="block text-sm font-medium mb-1 text-gray-700">Fecha Desde:</label>
                        <input 
                            type="date"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                        />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-sm font-medium mb-1 text-gray-700">Fecha Hasta:</label>
                        <input 
                            type="date"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                        />
                    </div>
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
                        className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handlePreviewNewReport} 
                        disabled={previewLoading} 
                        className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50 transition shadow font-bold"
                    >
                        {previewLoading ? "Cargando..." : "Previsualizar"}
                    </button>
                    <button 
                        onClick={handleCreateReport} 
                        disabled={loading} 
                        className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50 transition shadow font-bold"
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
                        onClick={() => handlePreviewExistingReport(r.Id_Reporte)} 
                        className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 p-2 rounded-full transition" 
                        title="Previsualizar"
                    >
                        <FaSearch />
                    </button>
                    <button 
                        onClick={() => handleDownloadExcel(r.Id_Reporte, r.Tipo_Reporte)} 
                        className="text-green-600 hover:text-green-800 bg-green-50 p-2 rounded-full transition" 
                        title="Descargar Excel"
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

      {/* Modal de Previsualización */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header Navbar */}
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FaSearch className="text-indigo-600"/> Previsualización: {previewData.tipo}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">{previewData.descripcion}</p>
                    </div>
                    <button 
                        onClick={() => setShowPreviewModal(false)}
                        className="text-gray-400 hover:text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-full w-8 h-8 flex items-center justify-center transition font-bold"
                    >
                        ✕
                    </button>
                </div>
                
                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                    {previewData.tipo === 'EVENTOS' ? (
                        <div className="bg-white rounded border overflow-x-auto shadow-sm">
                            <table className="min-w-full text-sm text-left align-middle">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold border-b">
                                    <tr>
                                        <th className="px-4 py-3">Fecha</th>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">Descripción</th>
                                        <th className="px-4 py-3">Usuario</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(previewData.data?.eventos || []).slice(0, 100).map((ev, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{new Date(ev.Fecha_Creacion || ev.Fecha_Hora).toLocaleString()}</td>
                                            <td className="px-4 py-2 font-bold text-xs"><span className="bg-gray-200 text-gray-700 px-2 py-1 rounded">{ev.Tipo_Evento}</span></td>
                                            <td className="px-4 py-2 truncate max-w-xs" title={ev.Descripcion}>{ev.Descripcion}</td>
                                            <td className="px-4 py-2 text-gray-600">{ev.origen_evento || ev.Usuario || '-'}</td>
                                        </tr>
                                    ))}
                                    {(previewData.data?.eventos || []).length === 0 && (
                                        <tr><td colSpan="4" className="text-center py-4 text-gray-400">Sin eventos en este periodo.</td></tr>
                                    )}
                                    {previewData.data?.eventos?.length > 100 && (
                                        <tr><td colSpan="4" className="text-center py-3 text-sm text-gray-500 italic bg-gray-50">Mostrando los primeros 100 registros... Descargue el Excel para ver todos.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded border shadow-sm border-l-4 border-blue-500 flex flex-col justify-center">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Total Entradas</p>
                                    <p className="text-2xl font-bold text-gray-800">{previewData.data?.resumen_ocupacion?.total_entradas || 0}</p>
                                </div>
                                <div className="bg-white p-4 rounded border shadow-sm border-l-4 border-green-500 flex flex-col justify-center">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Total Salidas</p>
                                    <p className="text-2xl font-bold text-gray-800">{previewData.data?.resumen_ocupacion?.total_salidas || 0}</p>
                                </div>
                                <div className="bg-white p-4 rounded border shadow-sm border-l-4 border-purple-500 flex flex-col justify-center">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Duración Media</p>
                                    <p className="text-2xl font-bold text-gray-800">{previewData.data?.resumen_ocupacion?.duracion_promedio_minutos || 0}m</p>
                                </div>
                                <div className="bg-white p-4 rounded border shadow-sm border-l-4 border-amber-500 flex flex-col justify-center">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Pico de Ocupación</p>
                                    <p className="text-2xl font-bold text-gray-800">{previewData.data?.resumen_ocupacion?.hora_pico || 'N/A'}</p>
                                </div>
                            </div>
                            
                            <h4 className="font-bold text-gray-800 border-b pb-2 mb-3 mt-4">Estadísticas Generales</h4>
                            <div className="bg-white rounded border overflow-x-auto shadow-sm">
                                <table className="min-w-full text-sm text-left align-middle">
                                    <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold border-b">
                                        <tr>
                                            <th className="px-4 py-3">Indicador</th>
                                            <th className="px-4 py-3 text-center">Valor Registrado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-bold text-gray-700">Tickets Emitidos</td>
                                            <td className="px-4 py-2 text-center font-bold">{previewData.data?.resumen_general?.tickets_emitidos || 0}</td>
                                        </tr>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-bold text-gray-700">Vehículos Nuevos Reg.</td>
                                            <td className="px-4 py-2 text-center font-bold">{previewData.data?.resumen_general?.nuevos_vehiculos_registrados || 0}</td>
                                        </tr>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-bold text-gray-700">Total Reservas</td>
                                            <td className="px-4 py-2 text-center font-bold">{previewData.data?.resumen_general?.total_reservas || 0}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

    </Layout>
  );
}
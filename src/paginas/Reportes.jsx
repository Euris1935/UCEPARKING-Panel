

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaDownload, FaFileAlt, FaPlus, FaTrash, FaUser, FaSync, FaTimesCircle } from 'react-icons/fa';
import SearchableSelect from '../componentes/SearchableSelect';
import { useOrg } from '../contexts/OrgContext';

export default function Reportes() {
    const { orgId } = useOrg();
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [tipoReporte, setTipoReporte] = useState('');
  const [descripcion, setDescripcion] = useState(''); 
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tiposReporteList, setTiposReporteList] = useState([]);

  // Estados Previas
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => { 
    if (orgId) {
      loadReportes(); 
      loadTiposReporte();
    }
  }, [orgId]);

  const loadTiposReporte = async () => {
    try {
        const { data, error } = await supabase.from('tipo_reporte').select('*').order('nombre');
        if (error) throw error;
        setTiposReporteList(data || []);
    } catch (error) {
        console.error("Error cargando tipos de reporte:", error.message);
    }
  };

  const loadReportes = async () => {
    setIsRefreshing(true);
    try {
        const { data, error } = await supabase
          .from('reporte')
          .select(`
            *,
            persona (nombre, apellido),
            tipo_reporte (nombre)
          `)
          .eq('organizacion_id', orgId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setReportes(data || []);
    } catch (error) {
        console.error("Error cargando reportes:", error.message);
    } finally {
        setIsRefreshing(false);
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

  const handleEliminarReporte = async (reporteId) => {
    const confirm = await Swal.fire({
        title: '¿Eliminar reporte?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        const { error } = await supabase.from('reporte').delete().eq('id_reporte', reporteId);
        if (error) {
            Swal.fire('Error', 'No se pudo eliminar el reporte.', 'error');
        } else {
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
    (r.tipo_reporte?.nombre || r.tipo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (`${r.persona?.nombre || ""} ${r.persona?.apellido || ""}`).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Reportes</h2>
          <p className="text-gray-500 font-medium">Historial de reportes e incidencias.</p>
        </div>
        {!showModal && (
        <button 
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition duration-150"
          onClick={() => setShowModal(true)}
        >
          <FaPlus /> Generar Reporte
        </button>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <div className="relative w-72">
                    <input 
                        type="text" placeholder="Buscar reporte por tipo o usuario..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <FaSearch className="absolute left-3 top-3 text-gray-400" />
                </div>
                <button
                    onClick={loadReportes}
                    disabled={isRefreshing}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                    title="Refrescar lista"
                >
                    <FaSync className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Detalles del Reporte</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Fecha Creación</th>
                    <th className="px-6 py-3 text-left font-black text-gray-500 uppercase tracking-widest text-[10px]">Generado Por</th>
                    <th className="px-6 py-3 text-center font-black text-gray-500 uppercase tracking-widest text-[10px]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredReportes.length === 0 ? (
                    <tr><td colSpan="4" className="p-8 text-center text-gray-500 italic text-sm">No hay reportes generados aún.</td></tr>
                  ) : (
                    filteredReportes.map(r => (
                    <tr key={r.id_reporte} className="hover:bg-blue-50/20 transition group">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                            <div className="bg-blue-50 p-2 text-blue-600 rounded-lg mr-3 shadow-sm border border-blue-100">
                                <FaFileAlt className='text-lg'/> 
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-xs uppercase">{r.tipo_reporte?.nombre || r.tipo}</p>
                                <p className="text-[10px] italic font-medium text-gray-400 max-w-xs truncate mt-0.5" title={r.descripcion}>
                                    {r.descripcion || "Sin descripción"}
                                </p>
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="bg-gray-100 p-1.5 rounded-full text-gray-500 border border-gray-200">
                                <FaUser className="text-[10px]"/>
                            </div>
                            <span className="text-xs font-bold text-gray-700 uppercase">
                                {r.persona ? `${r.persona.nombre} ${r.persona.apellido}` : 'Sistema / Desconocido'}
                            </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button 
                            onClick={() => handlePreviewExistingReport(r.id_reporte)} 
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-2 rounded transition" 
                            title="Previsualizar"
                        >
                            <FaSearch size={16}/>
                        </button>
                        <button 
                            onClick={() => handleDownloadExcel(r.id_reporte, r.tipo_reporte?.nombre || r.tipo)} 
                            className="text-green-500 hover:text-green-700 hover:bg-green-50 p-2 rounded transition" 
                            title="Descargar Excel"
                        >
                            <FaDownload size={16}/>
                        </button>
                        <button 
                            onClick={() => handleEliminarReporte(r.id_reporte)} 
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition" 
                            title="Eliminar"
                        >
                            <FaTrash size={15}/>
                        </button>
                      </td>
                    </tr>
                  )))}
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
                  <FaFileAlt className="text-blue-600"/> Nuevo Reporte
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                  <FaTimesCircle size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tipo de Reporte *</label>
                  <SearchableSelect
                      options={tiposReporteList.map(t => ({ value: t.id_tipo.toString(), label: t.nombre }))}
                      value={tipoReporte}
                      onChange={val => setTipoReporte(val)}
                      placeholder="— Seleccionar Tipo —"
                      focusRingClass="focus:ring-blue-500"
                      selectedItemClass="bg-blue-100 text-blue-800"
                      className="bg-gray-50/50"
                  />
              </div>

              <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Desde *</label>
                      <input 
                          type="date"
                          className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500"
                          value={fechaDesde}
                          onChange={(e) => setFechaDesde(e.target.value)}
                      />
                  </div>
                  <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha Hasta *</label>
                      <input 
                          type="date"
                          className="w-full border p-2 rounded-lg text-sm bg-gray-50 outline-none focus:ring-blue-500"
                          value={fechaHasta}
                          onChange={(e) => setFechaHasta(e.target.value)}
                      />
                  </div>
              </div>

              <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Descripción / Observaciones *</label>
                  <textarea 
                      className="w-full border p-2 rounded-lg bg-gray-50 text-sm outline-none focus:ring-blue-500 h-24 resize-none"
                      placeholder="Escriba los detalles del reporte..."
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                  ></textarea>
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                  <button 
                      onClick={handlePreviewNewReport} 
                      disabled={previewLoading || loading} 
                      className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-black uppercase text-[10px] tracking-wide"
                  >
                      {previewLoading ? "CARGANDO DATOS..." : "PREVISUALIZAR"}
                  </button>
                  <button 
                      onClick={handleCreateReport} 
                      disabled={loading || previewLoading} 
                      className="w-full py-3 bg-blue-600 text-white flex justify-center items-center gap-2 rounded-lg hover:bg-blue-700 transition shadow-md font-black uppercase text-[10px] tracking-wide"
                  >
                      <FaDownload/> {loading ? "GUARDANDO..." : "GUARDAR REPORTE"}
                  </button>
              </div>
            </div>
          </section>
        </aside>
        )}
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
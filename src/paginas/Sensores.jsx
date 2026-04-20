import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaMicrochip, FaTrash, FaEdit, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';

export default function Sensores() {
  const { orgId } = useOrg();
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosEquipo, setEstadosEquipo] = useState([]);
  
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
    id_plaza: '',
    id_estado: '',       // Estado Operativo (contexto equipo)
    fecha_instalacion: new Date().toISOString().split('T')[0],
    ultimo_mantenimiento: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [localOrgId, setLocalOrgId] = useState(null);

  useEffect(() => {
    if (orgId) {
      loadData();
      // Sincronización en tiempo real
      const channel = supabase.channel('realtime_sensores')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivo' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, loadData)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [orgId]);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: dispData, error } = await supabase
        .from('dispositivo')
        .select(`
          *,
          tipo:tipo_dispositivo!id_tipo(id_tipo, nombre),
          modelo:modelo!id_modelo(id_modelo, nombre, id_marca, marca!modelo_marca_fk(id_marca, nombre)),
          plaza:plaza!id_plaza(id_plaza, numero_plaza),
          estado:estado_dispositivo!dispositivo_estado_fk(id_estado, nombre)
        `)
        .eq('organizacion_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispositivos(dispData || []);

      // 2. Carga paralela de catálogos
      const [
        { data: tTipos }, 
        { data: tMarcas }, 
        { data: tModelos }, 
        { data: pData }, 
        { data: eDisp }
      ] = await Promise.all([
        supabase.from('tipo_dispositivo').select('id_tipo, nombre').order('nombre'),
        supabase.from('marca').select('id_marca, nombre').order('nombre'),
        supabase.from('modelo').select('id_modelo, nombre, id_marca').order('nombre'),
        supabase.from('plaza').select('*, zona:id_zona(id_zona, nombre, estado_zona:id_estado(nombre))').eq('organizacion_id', orgId).order('numero_plaza'),
        supabase.from('estado_dispositivo').select('id_estado, nombre').order('nombre')
      ]);

      setListaTipos(tTipos || []);
      setListaMarcas(tMarcas || []);
      setListaModelos(tModelos || []);
      
      // Filtrar plazas solo de zonas "Activas"
      const plazasDisponibles = (pData || []).filter(p => (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa');
      setPlazas(plazasDisponibles);
      
      setEstadosEquipo(eDisp || []);

      // Valores por defecto para nuevos registros
      if (!editingId && !formData.id_estado) {
        const estOperativo = (eDisp || []).find(e => e.nombre.toLowerCase().includes('operativo'));
        
        setFormData(prev => ({ 
          ...prev, 
          id_estado: estOperativo?.id_estado || prev.id_estado
        }));
      }
      
    } catch (error) {
      console.error("Error crítico en loadData:", error.message);
      Swal.fire({ 
        title: 'Error de Red', 
        text: 'No se pudo sincronizar con la base de datos de hardware.', 
        icon: 'error', 
        toast: true, 
        position: 'top-end', 
        showConfirmButton: false, 
        timer: 4000 
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRegistrarLog = async (tipo_nombre, descripcion, idPlaza = null, idDisp = null) => {
    if (!currentPersonaId) return;
    await registrarLog({
      tipo_nombre,
      descripcion,
      id_persona: currentPersonaId,
      organizacion_id: orgId,
      id_plaza: idPlaza,
      id_dispositivo: idDisp,
      origen: 'Panel Web - Hardware y Sensores'
    });
  };

  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    
    setFormData({
      id_tipo: disp.id_tipo || '',
      id_marca: disp.modelo?.id_marca || '',
      id_modelo: disp.id_modelo || '',
      id_plaza: disp.id_plaza ? String(disp.id_plaza) : '',
      id_estado: disp.id_estado ? String(disp.id_estado) : '',
      fecha_instalacion: disp.fecha_instalacion ? disp.fecha_instalacion.split('T')[0] : '',
      ultimo_mantenimiento: disp.ultimo_mantenimiento || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const tipoObj = listaTipos.find(t => String(t.id_tipo) === String(formData.id_tipo));

    try {
      const effectiveOrgId = localOrgId || orgId;

      const dispData = {
        id_tipo: parseInt(formData.id_tipo),
        id_modelo: parseInt(formData.id_modelo),
        id_plaza: formData.id_plaza || null,
        id_estado: parseInt(formData.id_estado) || null,
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null,
        // Enviar organizacion_id solo si existe (evita violar RLS por null)
        ...(effectiveOrgId ? { organizacion_id: effectiveOrgId } : {})
      };

      if (editingId) {
        // En UPDATE omitimos organizacion_id para evitar conflictos con políticas RLS 
        // de integridad si el valor ya existe y no debe cambiar.
        const updateData = { ...dispData };
        delete updateData.organizacion_id;

        const { error } = await supabase.from('dispositivo')
          .update(updateData)
          .eq('id_dispositivo', editingId);
          
        if (error) throw error;
        
        // Log de actualización inteligente
        const nombreEstadoOp = estadosEquipo.find(e => String(e.id_estado) === String(formData.id_estado))?.nombre || 'N/A';
        
        const tipoLog = nombreEstadoOp.toLowerCase().includes('operativo') ? EVENT_TYPES.DISPOSITIVO_ONLINE : 
                       nombreEstadoOp.toLowerCase().includes('mantenimiento') ? EVENT_TYPES.MANTENIMIENTO_INICIADO : EVENT_TYPES.DISPOSITIVO_OFFLINE;
        
        let descLog = `Actualización de ${tipoObj?.nombre || 'Dispositivo'}: Estado Operativo a ${nombreEstadoOp}.`;

        await handleRegistrarLog(
          tipoLog,
          descLog,
          formData.id_plaza || null,
          editingId
        );

        Swal.fire('Éxito', 'Registro actualizado', 'success');
      } else {
        const { data: nDisp, error } = await supabase.from('dispositivo').insert([dispData]).select('id_dispositivo').single();
        if (error) throw error;
        
        await handleRegistrarLog(
          EVENT_TYPES.DISPOSITIVO_ONLINE,
          `Nuevo dispositivo registrado: ${tipoObj?.nombre || 'Equipo'}.`,
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

  const handleNew = () => {
    setEditingId(null);
    const estOperativo = estadosEquipo.find(e => e.nombre.toLowerCase().includes('operativo'));
    
    setFormData({
      ...initialForm,
      id_estado: estOperativo?.id_estado || ''
    });
    setShowModal(true);
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
      try {
        // 1. Desvincular de Eventos y Mantenimientos para evitar error de Foreign Key
        // Usamos una promesa paralela para que sea más rápido
        await Promise.all([
          supabase.from('evento').update({ id_dispositivo: null }).eq('id_dispositivo', disp.id_dispositivo),
          supabase.from('mantenimiento').update({ id_dispositivo: null }).eq('id_dispositivo', disp.id_dispositivo)
        ]);

        // 2. Ahora sí, borrar el dispositivo
        const { error } = await supabase.from('dispositivo').delete().eq('id_dispositivo', disp.id_dispositivo);
        
        if (error) throw error;

        await handleRegistrarLog(
          EVENT_TYPES.DISPOSITIVO_OFFLINE,
          `Dispositivo eliminado permanentemente: ${disp.tipo?.nombre || 'Equipo'}.`,
          disp.id_plaza || null,
          null // Ya no existe el ID del dispositivo
        );
        Swal.fire('Eliminado', 'Dispositivo borrado correctamente', 'success');
        loadData();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    }
  };

  const filteredDispositivos = dispositivos.filter(d => {
    const busqueda = searchTerm.toLowerCase();
    const nombreTipo = (d.tipo?.nombre || "").toLowerCase();
    const numeroPlaza = (d.plaza?.numero_plaza || "").toLowerCase();
    return nombreTipo.includes(busqueda) || numeroPlaza.includes(busqueda);
  });

  const tipoActual = listaTipos.find(t => String(t.id_tipo) === String(formData.id_tipo));
  const esSensor = tipoActual?.nombre?.toLowerCase().includes('sensor');

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Gestión de Hardware</h2>
          <p className="text-gray-500 font-medium">Administración de dispositivos y sensores del parqueo.</p>
        </div>
        {!showModal && (
          <button
            onClick={handleNew}
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
                    <th className="px-6 py-4 text-left">Fecha Creación</th>
                    <th className="px-6 py-4 text-left">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredDispositivos.map((disp) => (
                    <tr key={disp.id_dispositivo} className="hover:bg-gray-50/50 transition duration-150 group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900 uppercase text-xs">{disp.tipo?.nombre}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600 text-xs">
                        {disp.modelo?.marca?.nombre} - {disp.modelo?.nombre}
                      </td>
                      <td className="px-6 py-4">
                        {disp.plaza && (
                          <div className="inline-flex items-center gap-1.5 bg-[#2eb17b]/10 border border-[#2eb17b] px-2.5 py-0.5 rounded-md shadow-sm">
                            <span className="text-[9px] font-black text-[#2eb17b] uppercase tracking-tighter">Plaza</span>
                            <span className="text-sm font-black text-[#2eb17b]">{disp.plaza.numero_plaza}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">
                        {disp.created_at ? new Date(disp.created_at).toLocaleString('es-DO', { 
                          day: '2-digit', month: '2-digit', year: 'numeric', 
                          hour: '2-digit', minute: '2-digit', hour12: true 
                        }) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {disp.estado ? (
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] border uppercase tracking-tighter w-fit ${
                              disp.estado.nombre.toLowerCase().includes('operativo') ? 'bg-green-50 text-green-700 border-green-200' :
                              disp.estado.nombre.toLowerCase().includes('mantenimiento') || disp.estado.nombre.toLowerCase().includes('fuera') ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {disp.estado.nombre}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[10px] italic">Estado N/A</span>
                          )}
                        </div>
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
                  options={listaTipos.map(t => ({ value: t.id_tipo, label: t.nombre }))}
                  value={formData.id_tipo} 
                  onChange={val => setFormData({ ...formData, id_tipo: val })} 
                  placeholder="— Seleccionar Tipo —"
                  focusRingClass="focus:ring-blue-500"
                  selectedItemClass="bg-blue-100 text-blue-800"
                  className="bg-gray-50/50"
                />
              </div>

              {/* Campo ubicación eliminado por normalización */}

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
                    {listaModelos.filter(m => String(m.id_marca) === String(formData.id_marca)).map(m => (
                      <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>
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
                  <select 
                    className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50" 
                    value={formData.id_plaza} 
                    onChange={e => setFormData({ ...formData, id_plaza: e.target.value })}
                  >
                    <option value="">— Ninguna —</option>
                    {plazas.filter(p => {
                      // Mostrar si la plaza está libre O si es la plaza del dispositivo que estamos editando
                      const estaOcupada = dispositivos.some(d => 
                        String(d.id_plaza) === String(p.id_plaza) && 
                        d.id_dispositivo !== editingId
                      );
                      return !estaOcupada;
                    }).map(p => (
                      <option key={p.id_plaza} value={p.id_plaza}>{p.numero_plaza}</option>
                    ))}
                    {editingId && formData.id_plaza && !plazas.find(p => String(p.id_plaza) === String(formData.id_plaza)) && (
                      <option value={formData.id_plaza}>Plaza asignada</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                {/* SIEMPRE MOSTRAR ESTADO OPERATIVO */}
                <div>
                  <label className="block text-[10px] font-black text-blue-600 mb-1 uppercase tracking-widest">Estado Operativo</label>
                  <select 
                    className={`border p-2 rounded-lg w-full text-sm outline-none focus:ring-blue-500 bg-white font-bold ${!editingId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    value={formData.id_estado} 
                    onChange={e => setFormData({ ...formData, id_estado: e.target.value })}
                    required
                    disabled={!editingId}
                  >
                    {!editingId && <option value="">Auto: Operativo</option>}
                    {estadosEquipo.map(est => <option key={est.id_estado} value={est.id_estado}>{est.nombre}</option>)}
                  </select>
                </div>
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


import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { 
  FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, 
  FaPlus, FaCalendarAlt, FaTrash, FaLock, FaSync
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Reservaciones() {
  const { tienePermiso } = useRbac();
  const { orgId } = useOrg();
  const canCreate = tienePermiso('Reservas', 'crear');
  const canEdit = tienePermiso('Reservas', 'editar');
  const canDelete = tienePermiso('Reservas', 'eliminar');

  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  
  const [editingReservaId, setEditingReservaId] = useState(null);
  const [originalPlazaId, setOriginalPlazaId] = useState(null); 

  const [personasList, setPersonasList] = useState([]); 
  const [plazasList, setPlazasList] = useState([]);
  
  const initialForm = {
    id_persona: '',
    Id_Plaza: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const isUpdating = !!editingReservaId;

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) setCurrentPersonaId(uData.id_persona);
      }
    };
    init();
    loadReservas();
    loadAuxData();
  }, []);

  // --- 2. VERIFICADOR DE TIEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => {
      checkExpiredReservations();
    }, 5000); 
    return () => clearInterval(timer);
  }, [reservas]); 

  const loadReservas = async () => {
    setIsRefreshing(true);
    try {
        const { data, error } = await supabase
          .from('reserva')
          .select(`
            *,
            persona (id_persona, nombre, apellido),
            plaza (id_plaza, numero_plaza),
            estado ( nombre ) 
          `)
          .order('fecha_hora_inicio', { ascending: false });

        if (error) throw error;
        setReservas(data || []);
    } catch (error) { console.error("Error cargando reservas:", error.message); }
    finally { setIsRefreshing(false); }
  };

  const loadAuxData = async () => {
    try {
        // Obtener estado 'Libre' para plaza
        const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
        const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

        const { data: personas } = await supabase.from('persona').select('id_persona, nombre, apellido').order('nombre');
        const { data: plazas } = await supabase.from('plaza').select('id_plaza, numero_plaza').eq('id_estado', idEstLibrePlaza).order('numero_plaza');
        setPersonasList(personas || []);
        setPlazasList(plazas || []);
    } catch (error) { console.error("Error aux:", error); }
  };

  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo').select('id').eq('contexto', 'evento').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Reservas').maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_plaza: idPlaza, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  // --- 3. LÓGICA DE PRECISIÓN PARA AUTO-COMPLETADO ---
  const checkExpiredReservations = async () => {
    if (reservas.length === 0) return;

    const ahora = new Date();
    const tzOffset = ahora.getTimezoneOffset() * 60000;
    const ahoraString = new Date(ahora - tzOffset).toISOString().slice(0, 16);

    const vencidas = reservas.filter(r => {
      const nombreEstado = r.estado?.nombre?.trim();
      const esActiva = nombreEstado === 'Activa' || r.id_estado === 1;
      if (!esActiva) return false;

      const fechaFinDB = r.fecha_hora_fin ? r.fecha_hora_fin.replace(' ', 'T').slice(0, 16) : '';
      return fechaFinDB !== '' && ahoraString >= fechaFinDB;
    });

    for (const res of vencidas) {
      await handleMarkCompleted(res.id_reserva, res.id_plaza, true);
    }
  };

  // --- 4. ACCIONES (COMPLETAR, CANCELAR, ELIMINAR) ---

  const handleMarkCompleted = async (id, idPlaza, isAuto = false) => {
    try {
        const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
        const idEstCompletadoRes = estadosCat?.find(e => e.contexto === 'reserva' && e.nombre === 'Completada')?.id || 3;
        const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

        await supabase.from('reserva').update({ id_estado: idEstCompletadoRes }).eq('id_reserva', id);
        if (idPlaza) await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', idPlaza);
        if (!isAuto) {
            Swal.fire('Éxito', 'Reserva completada.', 'success');
            const p = plazasList.find(p => p.id_plaza === idPlaza);
            registrarLog('Ticket Cerrado', `Reserva completada para plaza ${p?.numero_plaza || idPlaza}`, idPlaza);
        }
        loadReservas();
        loadAuxData(); 
    } catch (e) { console.error(e); }
  };

  const handleCancelReserva = async (idReserva, idPlaza) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La plaza se liberará.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
        const idEstCanceladaRes = estadosCat?.find(e => e.contexto === 'reserva' && e.nombre === 'Cancelada')?.id || 2;
        const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

        await supabase.from('reserva').update({ id_estado: idEstCanceladaRes }).eq('id_reserva', idReserva);
        if (idPlaza) await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', idPlaza);
        const p = plazasList.find(p => p.id_plaza === idPlaza);
        registrarLog('Reserva Cancelada', `Reserva cancelada para plaza ${p?.numero_plaza || idPlaza}`, idPlaza);
        loadReservas();
        loadAuxData();
    }
  };

  const handleDelete = async (idReserva, idPlaza, estadoNombre) => {
    const result = await Swal.fire({ title: '¿Eliminar?', text: "Se borrará definitivamente.", icon: 'error', showCancelButton: true });
    if (result.isConfirmed) {
        await supabase.from('reserva').delete().eq('id_reserva', idReserva);
        if (estadoNombre === 'Activa' && idPlaza) {
             const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
             const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;
             await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', idPlaza);
        }
        loadReservas();
        loadAuxData();
    }
  };

  // --- 5. FORMULARIO ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
        // Validar duración máxima de reserva según configuración
        if (formData.Fecha_Hora_Inicio && formData.Fecha_Hora_Fin) {
            const inicio = new Date(formData.Fecha_Hora_Inicio);
            const fin = new Date(formData.Fecha_Hora_Fin);
            const duracionHoras = (fin - inicio) / (1000 * 60 * 60);
            const cfg = JSON.parse(localStorage.getItem('appSettings') || '{}');
            const maxHoras = cfg.tiempoMaximoReserva || 4;
            if (duracionHoras > maxHoras) {
                setLoading(false);
                return Swal.fire('Duración excedida', `La reserva no puede superar las ${maxHoras} hora(s). La duración seleccionada es de ${duracionHoras.toFixed(1)} hora(s).`, 'warning');
            }
            if (duracionHoras <= 0) {
                setLoading(false);
                return Swal.fire('Fecha inválida', 'La fecha de fin debe ser posterior a la fecha de inicio.', 'error');
            }
        }

        const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
        const idEstActivaRes = estadosCat?.find(e => e.contexto === 'reserva' && e.nombre === 'Activa')?.id || 1;
        const idEstReservPlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Reservado')?.id || 3;
        const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

        const payload = {
            id_persona: formData.id_persona,
            id_plaza: parseInt(formData.Id_Plaza),
            fecha_hora_inicio: formData.Fecha_Hora_Inicio,
            fecha_hora_fin: formData.Fecha_Hora_Fin,
            id_estado: idEstActivaRes,
            organizacion_id: orgId
        };

        let error;
        if (isUpdating) {
            const { error: updateError } = await supabase.from('reserva').update(payload).eq('id_reserva', editingReservaId);
            error = updateError;
            if (!error && parseInt(formData.Id_Plaza) !== originalPlazaId) {
                await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', originalPlazaId);
                await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
            }
        } else {
            const { error: insertError } = await supabase.from('reserva').insert([payload]);
            error = insertError;
            if (!error) {
                await supabase.from('plaza').update({ id_estado: idEstReservPlaza }).eq('id_plaza', parseInt(formData.Id_Plaza));
            }
        }
        
        if (error) throw error;
        
        const plazaSelect = plazasList.find(p => p.id_plaza === parseInt(formData.Id_Plaza));
        const personaSelect = personasList.find(p => p.id_persona === formData.id_persona);
        registrarLog(
            isUpdating ? 'Cambio de Estado' : 'Reserva Creada',
            `${isUpdating ? 'Edición' : 'Creación'} de reserva: ${personaSelect?.nombre} ${personaSelect?.apellido} en Plaza ${plazaSelect?.numero_plaza || formData.Id_Plaza}`, 
            parseInt(formData.Id_Plaza)
        );

        resetForm();
        loadReservas();
        loadAuxData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); } 
    finally { setLoading(false); }
  };

  const handleEdit = (res) => {
    setEditingReservaId(res.id_reserva);
    setOriginalPlazaId(res.id_plaza);
    const format = (str) => str ? str.replace(' ', 'T').slice(0, 16) : '';
    setFormData({
      id_persona: res.id_persona,
      Id_Plaza: res.id_plaza,
      Fecha_Hora_Inicio: format(res.fecha_hora_inicio),
      Fecha_Hora_Fin: format(res.fecha_hora_fin)
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData(initialForm);
    setEditingReservaId(null);
    setShowModal(false);
  };

  const formatDisplayDate = (dateStr) => {
      if (!dateStr) return '-';
      return dateStr.replace('T', ' ').split('.')[0].slice(0, 16);
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Reservaciones</h2>
            <p className="text-gray-500 font-medium">Gestión de tiempos y plazas reservadas.</p>
        </div>
        {canCreate && !showModal && (
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-xl font-bold shadow-md flex items-center gap-2">
            <FaPlus /> Nueva Reserva
        </button>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">

        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Buscar persona o plaza..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
              </div>
              <button
                onClick={() => { loadReservas(); loadAuxData(); }}
                disabled={isRefreshing}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                title="Refrescar lista"
              >
                <FaSync className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-6 py-4 text-left">Persona</th>
                    <th className="px-6 py-4 text-left">Plaza</th>
                    <th className="px-6 py-4 text-left">Inicio</th>
                    <th className="px-6 py-4 text-left">Fin</th>
                    <th className="px-6 py-4 text-left">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {reservas.filter(r => `${r.persona?.nombre} ${r.persona?.apellido} ${r.plaza?.numero_plaza}`.toLowerCase().includes(searchTerm.toLowerCase())).map(r => {
                    const nombreEstado = r.estado?.nombre;
                    const isActive = nombreEstado === 'Activa' || r.id_estado === 1;
                    return (
                      <tr key={r.id_reserva} className="hover:bg-gray-50/50 transition-all text-sm">
                        <td className="px-6 py-4 font-bold text-gray-700">{r.persona?.nombre} {r.persona?.apellido}</td>
                        <td className="px-6 py-4"><span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-black text-xs">#{r.plaza?.numero_plaza}</span></td>
                        <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.fecha_hora_inicio)}</td>
                        <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.fecha_hora_fin)}</td>
                        <td className="px-6 py-4">
                            <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${isActive ? 'bg-green-100 text-green-800' : nombreEstado === 'Cancelada' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                {nombreEstado || 'Activa'}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                          {isActive ? (
                            <>
                              {canEdit && <button onClick={() => handleMarkCompleted(r.id_reserva, r.id_plaza)} className="text-green-500 hover:scale-110 transition-transform" title="Completar"><FaCheckCircle size={20}/></button>}
                              {canEdit && <button onClick={() => handleCancelReserva(r.id_reserva, r.id_plaza)} className="text-orange-500 hover:scale-110 transition-transform" title="Cancelar"><FaTimesCircle size={20}/></button>}
                              {canEdit && <button onClick={() => handleEdit(r)} className="text-blue-500 hover:scale-110 transition-transform" title="Editar"><FaEdit size={20}/></button>}
                            </>
                          ) : (
                            <div className="text-gray-300 italic text-xs flex items-center gap-1"><FaLock size={12} /> Cerrada</div>
                          )}
                          {canDelete && <button onClick={() => handleDelete(r.id_reserva, r.id_plaza, nombreEstado)} className="text-red-500 hover:scale-110 ml-2" title="Eliminar"><FaTrash size={18}/></button>}
                        </td>
                      </tr>
                    );
                  })}
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
                    <FaCalendarAlt className="text-blue-600"/> {isUpdating ? 'Editar Reserva' : 'Nueva Reserva'}
                </h3>
                <button type="button" onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition" title="Cerrar">
                    <FaTimesCircle size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                   <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Persona *</label>
                   <SearchableSelect
                     options={personasList.map(p => ({ value: p.id_persona, label: `${p.nombre} ${p.apellido}` }))}
                     value={formData.id_persona}
                     onChange={(val) => setFormData({...formData, id_persona: val})}
                     placeholder="— Seleccionar Persona —"
                     focusRingClass="focus:ring-blue-500"
                     selectedItemClass="bg-blue-100 text-blue-800"
                     className="bg-gray-50/50"
                   />
                 </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Plaza *</label>
                    <SearchableSelect
                      options={plazasList.map(p => ({ value: p.id_plaza, label: p.numero_plaza }))}
                      value={formData.Id_Plaza}
                      onChange={(val) => setFormData({...formData, Id_Plaza: val})}
                      placeholder="— Seleccionar Plaza —"
                      focusRingClass="focus:ring-blue-500"
                      selectedItemClass="bg-blue-100 text-blue-800"
                      className="bg-gray-50/50"
                    />
                  </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Inicio *</label>
                     <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none" value={formData.Fecha_Hora_Inicio} onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})} required />
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fin *</label>
                      <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm focus:ring-blue-500 bg-gray-50 outline-none" value={formData.Fecha_Hora_Fin} onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})} required />
                   </div>
                 </div>
                 <div className="pt-2">
                   <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md flex justify-center items-center gap-2">
                     <FaCalendarAlt /> GUARDAR RESERVA
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

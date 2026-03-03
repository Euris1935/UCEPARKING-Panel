

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { 
  FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, 
  FaPlus, FaCalendarAlt, FaTrash, FaLock 
} from 'react-icons/fa';

export default function Reservaciones() {
  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
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
    try {
        const { data, error } = await supabase
          .from('RESERVA')
          .select(`
            *,
            personas (id, nombre, apellido),
            plazas (Id_Plaza, Numero_Plaza),
            estado_reserva ( nombre_estado ) 
          `)
          .order('Fecha_Hora_Inicio', { ascending: false });

        if (error) throw error;
        setReservas(data || []);
    } catch (error) { console.error("Error cargando reservas:", error.message); }
  };

  const loadAuxData = async () => {
    try {
        const { data: personas } = await supabase.from('personas').select('id, nombre, apellido').order('nombre');
        const { data: plazas } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza, Estado_Actual').ilike('Estado_Actual', 'LIBRE').order('Numero_Plaza');
        setPersonasList(personas || []);
        setPlazasList(plazas || []);
    } catch (error) { console.error("Error aux:", error); }
  };

  // --- 3. LÓGICA DE PRECISIÓN PARA AUTO-COMPLETADO ---
  const checkExpiredReservations = async () => {
    if (reservas.length === 0) return;

    const ahora = new Date();
    const tzOffset = ahora.getTimezoneOffset() * 60000;
    const ahoraString = new Date(ahora - tzOffset).toISOString().slice(0, 16);

    const vencidas = reservas.filter(r => {
      const nombreEstado = r.Estado_Reserva?.trim();
      const esActiva = nombreEstado === 'Activa' || r.id_estado === 1;
      if (!esActiva) return false;

      const fechaFinDB = r.Fecha_Hora_Fin ? r.Fecha_Hora_Fin.replace(' ', 'T').slice(0, 16) : '';
      return fechaFinDB !== '' && ahoraString >= fechaFinDB;
    });

    for (const res of vencidas) {
      await handleMarkCompleted(res.Id_Reserva, res.Id_Plaza, true);
    }
  };

  // --- 4. ACCIONES (COMPLETAR, CANCELAR, ELIMINAR) ---

  const handleMarkCompleted = async (id, idPlaza, isAuto = false) => {
    try {
        await supabase.from('RESERVA').update({ Estado_Reserva: 'Completada', id_estado: 2 }).eq('Id_Reserva', id);
        if (idPlaza) await supabase.from('plazas').update({ Estado_Actual: 'Libre', id_estado: 1 }).eq('Id_Plaza', idPlaza);
        if (!isAuto) Swal.fire('Éxito', 'Reserva completada.', 'success');
        loadReservas();
        loadAuxData(); 
    } catch (e) { console.error(e); }
  };

  const handleCancel = async (idReserva, idPlaza) => {
    const result = await Swal.fire({ title: '¿Cancelar?', text: "La plaza se liberará.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b' });
    if (result.isConfirmed) {
        await supabase.from('RESERVA').update({ Estado_Reserva: 'Cancelada', id_estado: 3 }).eq('Id_Reserva', idReserva);
        if (idPlaza) await supabase.from('plazas').update({ Estado_Actual: 'Libre', id_estado: 1 }).eq('Id_Plaza', idPlaza);
        loadReservas();
        loadAuxData();
    }
  };

  const handleDelete = async (idReserva, idPlaza, estado) => {
    const result = await Swal.fire({ title: '¿Eliminar?', text: "Se borrará definitivamente.", icon: 'error', showCancelButton: true });
    if (result.isConfirmed) {
        await supabase.from('RESERVA').delete().eq('Id_Reserva', idReserva);
        if (estado === 'Activa' && idPlaza) {
            await supabase.from('plazas').update({ Estado_Actual: 'Libre', id_estado: 1 }).eq('Id_Plaza', idPlaza);
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
        const payload = {
            id_persona: formData.id_persona,
            Id_Plaza: parseInt(formData.Id_Plaza),
            Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
            Fecha_Hora_Fin: formData.Fecha_Hora_Fin,
            Estado_Reserva: 'Activa', 
            id_estado: 1
        };

        if (isUpdating) {
            await supabase.from('RESERVA').update(payload).eq('Id_Reserva', editingReservaId);
            if (parseInt(formData.Id_Plaza) !== originalPlazaId) {
                await supabase.from('plazas').update({ Estado_Actual: 'Libre', id_estado: 1 }).eq('Id_Plaza', originalPlazaId);
                await supabase.from('plazas').update({ Estado_Actual: 'RESERVADA', id_estado: 3 }).eq('Id_Plaza', parseInt(formData.Id_Plaza));
            }
        } else {
            await supabase.from('RESERVA').insert([payload]);
            await supabase.from('plazas').update({ Estado_Actual: 'RESERVADA', id_estado: 3 }).eq('Id_Plaza', parseInt(formData.Id_Plaza));
        }
        resetForm();
        loadReservas();
        loadAuxData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); } 
    finally { setLoading(false); }
  };

  const handleEdit = (reserva) => {
    setEditingReservaId(reserva.Id_Reserva);
    setOriginalPlazaId(reserva.Id_Plaza);
    const format = (str) => str ? str.replace(' ', 'T').slice(0, 16) : '';
    setFormData({
      id_persona: reserva.id_persona,
      Id_Plaza: reserva.Id_Plaza,
      Fecha_Hora_Inicio: format(reserva.Fecha_Hora_Inicio),
      Fecha_Hora_Fin: format(reserva.Fecha_Hora_Fin)
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
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-primary hover:bg-blue-700 text-white py-2.5 px-6 rounded-xl font-bold shadow-lg flex items-center gap-2">
            <FaPlus /> Nueva Reserva
        </button>
      </header>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border-t-8 border-primary">
                <h3 className="text-2xl font-black mb-6 text-gray-800 flex items-center gap-2 uppercase tracking-tighter">
                    <FaCalendarAlt className="text-primary"/> {isUpdating ? 'Editar' : 'Nueva'} Reserva
                </h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <select className="w-full border-2 border-gray-100 p-2.5 rounded-xl text-sm outline-none bg-gray-50/50" value={formData.id_persona} onChange={(e) => setFormData({...formData, id_persona: e.target.value})} required>
                        <option value="">-- Seleccionar Persona --</option>
                        {personasList.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                    </select>
                    <select className="w-full border-2 border-gray-100 p-2.5 rounded-xl text-sm outline-none bg-gray-50/50" value={formData.Id_Plaza} onChange={(e) => setFormData({...formData, Id_Plaza: e.target.value})} required>
                        <option value="">-- Seleccionar Plaza --</option>
                        {plazasList.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                    </select>
                    <div className="grid grid-cols-1 gap-4">
                        <input type="datetime-local" className="w-full border-2 border-gray-100 p-2.5 rounded-xl text-sm" value={formData.Fecha_Hora_Inicio} onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})} required />
                        <input type="datetime-local" className="w-full border-2 border-gray-100 p-2.5 rounded-xl text-sm" value={formData.Fecha_Hora_Fin} onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})} required />
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t">
                        <button type="button" onClick={resetForm} className="px-6 py-2.5 text-gray-400 font-bold uppercase text-xs">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-8 py-2.5 bg-primary text-white rounded-xl font-black uppercase text-xs shadow-lg">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
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
              {reservas.filter(r => `${r.personas?.nombre} ${r.personas?.apellido} ${r.plazas?.Numero_Plaza}`.toLowerCase().includes(searchTerm.toLowerCase())).map(r => {
                const isActive = r.Estado_Reserva === 'Activa' || r.id_estado === 1;
                return (
                  <tr key={r.Id_Reserva} className="hover:bg-gray-50/50 transition-all text-sm">
                    <td className="px-6 py-4 font-bold text-gray-700">{r.personas?.nombre} {r.personas?.apellido}</td>
                    <td className="px-6 py-4"><span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-black text-xs">#{r.plazas?.Numero_Plaza}</span></td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.Fecha_Hora_Inicio)}</td>
                    <td className="px-6 py-4 text-gray-500 font-medium">{formatDisplayDate(r.Fecha_Hora_Fin)}</td>
                    <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${isActive ? 'bg-green-100 text-green-800' : r.Estado_Reserva === 'Cancelada' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                            {r.Estado_Reserva || 'Activa'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right flex gap-3 justify-end items-center">
                      {isActive ? (
                        <>
                          <button onClick={() => handleMarkCompleted(r.Id_Reserva, r.Id_Plaza)} className="text-green-500 hover:scale-110 transition-transform" title="Completar"><FaCheckCircle size={20}/></button>
                          <button onClick={() => handleCancel(r.Id_Reserva, r.Id_Plaza)} className="text-orange-500 hover:scale-110 transition-transform" title="Cancelar"><FaTimesCircle size={20}/></button>
                          <button onClick={() => handleEdit(r)} className="text-blue-500 hover:scale-110 transition-transform" title="Editar"><FaEdit size={20}/></button>
                        </>
                      ) : (
                        <div className="text-gray-300 italic text-xs flex items-center gap-1"><FaLock size={12} /> Cerrada</div>
                      )}
                      <button onClick={() => handleDelete(r.Id_Reserva, r.Id_Plaza, r.Estado_Reserva)} className="text-red-500 hover:scale-110 ml-2" title="Eliminar"><FaTrash size={18}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

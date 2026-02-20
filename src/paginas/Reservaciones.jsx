

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, FaPlus, FaCalendarAlt, FaTrash, FaLock } from 'react-icons/fa';

export default function Reservaciones() {
  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [editingReservaId, setEditingReservaId] = useState(null);
  const [originalPlazaId, setOriginalPlazaId] = useState(null); 

  const [personasList, setPersonasList] = useState([]); 
  const [plazasList, setPlazasList] = useState([]);
  const [estadosPlazaList, setEstadosPlazaList] = useState([]); 
  const [estadosReservaList, setEstadosReservaList] = useState([]);
  
  const initialForm = {
    id_persona: '',
    Id_Plaza: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const isUpdating = !!editingReservaId;

  useEffect(() => {
    loadReservas();
    loadAuxData(); 
  }, []);

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
    } catch (error) {
        console.error("Error cargando reservas:", error.message);
    }
  };

  const loadAuxData = async () => {
    try {
        const { data: personas } = await supabase.from('personas').select('id, nombre, apellido').order('nombre');
        const { data: plazas } = await supabase.from('plazas').select('Id_Plaza, Numero_Plaza').order('Numero_Plaza');
        const { data: estPlaza } = await supabase.from('estado_plaza').select('*');
        const { data: estReserva } = await supabase.from('estado_reserva').select('*'); 
        
        setPersonasList(personas || []);
        setPlazasList(plazas || []);
        setEstadosPlazaList(estPlaza || []);
        setEstadosReservaList(estReserva || []);
    } catch (error) {
        console.error("Error datos auxiliares:", error);
    }
  };

  const getEstadoPlazaId = (nombre) => estadosPlazaList.find(e => e.nombre_estado.toLowerCase() === nombre.toLowerCase())?.id_estado || 1;
  
  const getEstadoReservaId = (nombre) => {
      return estadosReservaList.find(e => e.nombre_estado.toUpperCase() === nombre.toUpperCase())?.id_estado;
  };

  const formatDateForInput = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  
  const handleEdit = (reserva) => {
      setEditingReservaId(reserva.Id_Reserva);
      setOriginalPlazaId(reserva.Id_Plaza);
      setFormData({
          id_persona: reserva.id_persona,
          Id_Plaza: reserva.Id_Plaza,
          Fecha_Hora_Inicio: formatDateForInput(reserva.Fecha_Hora_Inicio),
          Fecha_Hora_Fin: formatDateForInput(reserva.Fecha_Hora_Fin)
      });
      setShowModal(true);
  };

  const resetForm = () => {
      setFormData(initialForm);
      setEditingReservaId(null);
      setOriginalPlazaId(null);
      setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
        if (new Date(formData.Fecha_Hora_Inicio) >= new Date(formData.Fecha_Hora_Fin)) {
            throw new Error("La fecha de fin debe ser posterior a la fecha de inicio.");
        }

        const idPlazaLibre = getEstadoPlazaId('LIBRE');
        const idPlazaReservada = getEstadoPlazaId('RESERVADA');
        
        // CORRECCIÓN: Usamos 'ACTIVA'
        const idReservaActiva = getEstadoReservaId('ACTIVA'); 

        if (!idReservaActiva) throw new Error("No se encontró el estado 'ACTIVA' en la base de datos.");

        if (isUpdating) {
            // ACTUALIZAR
            const { error: errorUpdate } = await supabase
                .from('RESERVA')
                .update({
                    id_persona: formData.id_persona,
                    Id_Plaza: parseInt(formData.Id_Plaza),
                    Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
                    Fecha_Hora_Fin: formData.Fecha_Hora_Fin
                })
                .eq('Id_Reserva', editingReservaId);

            if (errorUpdate) throw errorUpdate;

            if (parseInt(formData.Id_Plaza) !== originalPlazaId) {
                if (originalPlazaId) {
                    await supabase.from('plazas').update({ Estado_Actual: 'LIBRE', id_estado: idPlazaLibre }).eq('Id_Plaza', originalPlazaId);
                }
                await supabase.from('plazas').update({ Estado_Actual: 'RESERVADA', id_estado: idPlazaReservada }).eq('Id_Plaza', parseInt(formData.Id_Plaza));
            }
            Swal.fire('Actualizada', 'La reserva ha sido modificada.', 'success');

        } else {
            // CREAR (Estado 'ACTIVA')
            const { error: errorReserva } = await supabase.from('RESERVA').insert([{
                id_persona: formData.id_persona,
                Id_Plaza: parseInt(formData.Id_Plaza),
                Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
                Fecha_Hora_Fin: formData.Fecha_Hora_Fin,
                Estado_Reserva: 'ACTIVA', 
                id_estado: idReservaActiva
            }]);

            if (errorReserva) throw errorReserva;

            await supabase.from('plazas').update({ Estado_Actual: 'RESERVADA', id_estado: idPlazaReservada }).eq('Id_Plaza', parseInt(formData.Id_Plaza));
            Swal.fire('Creada', 'Reserva registrada exitosamente.', 'success');
        }
        
        resetForm();
        loadReservas();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setLoading(false);
    }
  };



  const handleCancel = async (idReserva, idPlaza) => {
    const result = await Swal.fire({
        title: '¿Cancelar Reserva?',
        text: "Esto liberará la plaza en el mapa.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, cancelar'
    });

    if (result.isConfirmed) {
        try {
           
            const idReservaCancelada = getEstadoReservaId('CANCELADA');
            const idPlazaLibre = getEstadoPlazaId('LIBRE');

            if (!idReservaCancelada) throw new Error("No se encontró el estado 'CANCELADA' en la base de datos.");

            await supabase.from('RESERVA').update({ Estado_Reserva: 'CANCELADA', id_estado: idReservaCancelada }).eq('Id_Reserva', idReserva);
            
            if (idPlaza) {
                await supabase.from('plazas').update({ Estado_Actual: 'LIBRE', id_estado: idPlazaLibre }).eq('Id_Plaza', idPlaza);
            }

            Swal.fire('Cancelada', 'Reserva cancelada.', 'success');
            loadReservas();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
  };
  
 
  const handleMarkFinalized = async (id) => {
    try {
        const idEstadoFinalizada = getEstadoReservaId('FINALIZADA');
        
        if (!idEstadoFinalizada) return Swal.fire('Error', 'No existe el estado "FINALIZADA" en la base de datos.', 'error');

        const { error } = await supabase
            .from('RESERVA')
            .update({ 
                Estado_Reserva: 'FINALIZADA', 
                id_estado: idEstadoFinalizada 
            })
            .eq('Id_Reserva', id);
            
        if (error) throw error;
        loadReservas();
        Swal.fire('Finalizada', 'Reserva marcada como completada.', 'success');
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (idReserva, idPlaza) => {
      const result = await Swal.fire({
          title: '¿Eliminar registro?',
          text: "Se borrará permanentemente de la base de datos.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sí, borrar'
      });

      if (result.isConfirmed) {
          try {
              if (idPlaza) {
                const idPlazaLibre = getEstadoPlazaId('LIBRE');
                await supabase.from('plazas').update({ Estado_Actual: 'LIBRE', id_estado: idPlazaLibre }).eq('Id_Plaza', idPlaza);
              }

              const { error } = await supabase.from('RESERVA').delete().eq('Id_Reserva', idReserva);
              if (error) throw error;

              Swal.fire('Borrado', 'Registro eliminado.', 'success');
              loadReservas();
          } catch (error) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

 
  const StatusBadge = ({ reserva }) => {
    
    const nombreEstado = reserva.estado_reserva?.nombre_estado || reserva.Estado_Reserva || 'Desconocido';
    
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    const s = nombreEstado.toUpperCase();
    
    if (s === 'ACTIVA') classes += 'bg-green-100 text-green-800';
    else if (s === 'CANCELADA') classes += 'bg-red-100 text-red-800';
    else if (s === 'FINALIZADA') classes += 'bg-blue-100 text-blue-800';
    else classes += 'bg-gray-100 text-gray-800';

    return <span className={classes}>{nombreEstado}</span>;
  };

  const filteredReservas = reservas.filter(r => {
    const nombreCompleto = `${r.personas?.nombre || ''} ${r.personas?.apellido || ''}`.toLowerCase();
    const numeroPlaza = r.plazas?.Numero_Plaza?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return nombreCompleto.includes(search) || numeroPlaza.includes(search);
  });

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Gestión de Reservaciones</h2>
            <p className="text-gray-500">Administra las reservas del sistema.</p>
        </div>
        <button 
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
        >
            <FaPlus /> Nueva Reserva
        </button>
      </header>

      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96 animate-fadeIn">
                <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    <FaCalendarAlt className="text-primary"/> 
                    {isUpdating ? 'Editar Reserva' : 'Crear Reserva'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Persona (Cliente)</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.id_persona}
                            onChange={(e) => setFormData({...formData, id_persona: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Persona --</option>
                            {personasList.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Plaza</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Id_Plaza}
                            onChange={(e) => setFormData({...formData, Id_Plaza: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Plaza --</option>
                            {plazasList.map(p => (
                                <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                        <input type="datetime-local" className="w-full border p-2 rounded" value={formData.Fecha_Hora_Inicio} onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                        <input type="datetime-local" className="w-full border p-2 rounded" value={formData.Fecha_Hora_Fin} onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})} required />
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                        <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50 shadow">
                            {loading ? "Procesando..." : (isUpdating ? "Actualizar" : "Crear")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Historial de Reservas</h3>
          <div className="relative w-64">
            <input 
              type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Persona</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plaza</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredReservas.map(r => {
                const nombreEstado = r.estado_reserva?.nombre_estado || r.Estado_Reserva || '';
                
                const isActive = nombreEstado.toUpperCase() === 'ACTIVA';

                return (
                  <tr key={r.Id_Reserva} className="hover:bg-gray-50 transition duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {r.personas?.nombre || 'Desconocido'} {r.personas?.apellido || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                      {r.plazas?.Numero_Plaza || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(r.Fecha_Hora_Inicio).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(r.Fecha_Hora_Fin).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <StatusBadge reserva={r} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3 justify-end items-center">
                      
                      {isActive ? (
                          <>
                              <button onClick={() => handleMarkFinalized(r.Id_Reserva)} title="Finalizar Reserva" className="text-green-600 hover:text-green-800 p-1.5 hover:bg-green-50 rounded"><FaCheckCircle size={18}/></button>
                              <button onClick={() => handleCancel(r.Id_Reserva, r.Id_Plaza)} title="Cancelar" className="text-yellow-600 hover:text-yellow-800 p-1.5 hover:bg-yellow-50 rounded"><FaTimesCircle size={18}/></button>
                              <button onClick={() => handleEdit(r)} title="Editar" className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded"><FaEdit size={18}/></button>
                              <button onClick={() => handleDelete(r.Id_Reserva, r.Id_Plaza)} title="Eliminar" className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 rounded"><FaTrash size={16}/></button>
                          </>
                      ) : (
                          <div className="flex items-center gap-2 text-gray-400 cursor-not-allowed" title="Reserva cerrada (Solo lectura)">
                              <FaLock size={14} />
                              <span className="text-xs italic">Bloqueada</span>
                          </div>
                      )}

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






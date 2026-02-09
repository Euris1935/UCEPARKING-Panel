

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, FaPlus } from 'react-icons/fa';

export default function Reservaciones() {
  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para catalogos y formulario
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Estado para controlar la edicion
  const [editingReservaId, setEditingReservaId] = useState(null);
  const [originalPlazaId, setOriginalPlazaId] = useState(null); // Para saber si cambió la plaza

  const [personasList, setPersonasList] = useState([]); 
  const [plazasList, setPlazasList] = useState([]);
  const [estadosList, setEstadosList] = useState([]); 
  
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
            plazas (Id_Plaza, Numero_Plaza)
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
        const { data: estados } = await supabase.from('estado_plaza').select('*');
        
        setPersonasList(personas || []);
        setPlazasList(plazas || []);
        setEstadosList(estados || []);
    } catch (error) {
        console.error("Error datos auxiliares:", error);
    }
  };

  const getEstadoId = (nombreEstado) => {
      const estado = estadosList.find(e => e.nombre_estado.toUpperCase() === nombreEstado.toUpperCase());
      return estado ? estado.id_estado : null;
  };

  // Función para formatear fecha de DB a input datetime-local
  const formatDateForInput = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      // Ajuste para zona horaria local
      const offset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
      return localISOTime;
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

        const idLibre = getEstadoId('LIBRE');
        const idReservada = getEstadoId('RESERVADA');

        if (isUpdating) {
          
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
                    await supabase.from('plazas')
                        .update({ Estado_Actual: 'LIBRE', id_estado: idLibre })
                        .eq('Id_Plaza', originalPlazaId);
                }
                //reservar
                await supabase.from('plazas')
                    .update({ Estado_Actual: 'RESERVADA', id_estado: idReservada })
                    .eq('Id_Plaza', parseInt(formData.Id_Plaza));
            }

            Swal.fire('Actualizada', 'La reserva ha sido modificada.', 'success');

        } else {
            //crear nueva
            const { error: errorReserva } = await supabase.from('RESERVA').insert([{
                id_persona: formData.id_persona,
                Id_Plaza: parseInt(formData.Id_Plaza),
                Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
                Fecha_Hora_Fin: formData.Fecha_Hora_Fin,
                Estado_Reserva: 'Activa'
            }]);

            if (errorReserva) throw errorReserva;

            
            const { error: errorPlaza } = await supabase
                .from('plazas')
                .update({ Estado_Actual: 'RESERVADA', id_estado: idReservada }) 
                .eq('Id_Plaza', parseInt(formData.Id_Plaza));

            if (errorPlaza) console.warn("Error visual plaza:", errorPlaza);

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
            const { error: rError } = await supabase
                .from('RESERVA')
                .update({ Estado_Reserva: 'Cancelada' })
                .eq('Id_Reserva', idReserva);
            
            if (rError) throw rError;

            if (idPlaza) {
                const idLibre = getEstadoId('LIBRE');
                await supabase
                    .from('plazas')
                    .update({ Estado_Actual: 'LIBRE', id_estado: idLibre })
                    .eq('Id_Plaza', idPlaza);
            }

            Swal.fire('Cancelada', 'La reserva ha sido cancelada.', 'success');
            loadReservas();

        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
  };
  
  const handleMarkUsed = async (id) => {
    try {
        const { error } = await supabase
            .from('RESERVA')
            .update({ Estado_Reserva: 'Usada' })
            .eq('Id_Reserva', id);
            
        if (error) throw error;
        loadReservas();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };

  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    const s = status ? status.toLowerCase() : '';
    switch (s) {
      case 'activa': classes += 'bg-green-100 text-green-800'; break;
      case 'expirada': classes += 'bg-yellow-100 text-yellow-800'; break;
      case 'cancelada': classes += 'bg-red-100 text-red-800'; break;
      case 'usada': classes += 'bg-blue-100 text-blue-800'; break;
      default: classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{status}</span>;
  };

  const filteredReservas = reservas.filter(r => {
    const nombreCompleto = `${r.personas?.nombre || ''} ${r.personas?.apellido || ''}`.toLowerCase();
    const numeroPlaza = r.plazas?.Numero_Plaza?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return nombreCompleto.includes(search) || numeroPlaza.includes(search) || String(r.Id_Reserva).includes(search);
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
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">
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
                                <option key={p.id} value={p.id}>
                                    {p.nombre} {p.apellido}
                                </option>
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
                                <option key={p.Id_Plaza} value={p.Id_Plaza}>
                                    {p.Numero_Plaza}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                        <input 
                            type="datetime-local"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Fecha_Hora_Inicio}
                            onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                        <input 
                            type="datetime-local"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Fecha_Hora_Fin}
                            onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})}
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50">
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
              {filteredReservas.map(r => (
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
                    <StatusBadge status={r.Estado_Reserva} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3 justify-end">
                    {r.Estado_Reserva === 'Activa' && (
                        <>
                            <button onClick={() => handleMarkUsed(r.Id_Reserva)} title="Marcar como Usada" className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"><FaCheckCircle size={18}/></button>
                            <button onClick={() => handleCancel(r.Id_Reserva, r.Id_Plaza)} title="Cancelar Reserva" className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"><FaTimesCircle size={18}/></button>
                        </>
                    )}
                    
                    <button onClick={() => handleEdit(r)} title="Editar Reserva" className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded"><FaEdit size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
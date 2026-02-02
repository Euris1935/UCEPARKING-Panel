

/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaCheckCircle, FaTimesCircle, FaPlus } from 'react-icons/fa';

export default function Reservaciones() {
  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // --- ESTADOS NUEVOS PARA CREACIÓN ---
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usuariosList, setUsuariosList] = useState([]);
  const [plazasList, setPlazasList] = useState([]);
  
  const initialForm = {
    Id_Usuario: '',
    Id_Plaza: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: ''
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadReservas();
    loadAuxData(); // Cargar listas para los selectores
  }, []);

  const loadReservas = async () => {
    const { data } = await supabase
      .from('RESERVA')
      .select(`
        Id_Reserva, 
        Fecha_Hora_Inicio, 
        Fecha_Hora_Fin, 
        Estado_Reserva, 
        USUARIO (Id_Usuario, Nombre, Apellido), 
        PLAZA (Id_Plaza, Numero_Plaza)
      `)
      .order('Fecha_Hora_Inicio', { ascending: false });

    setReservas(data || []);
  };

  // --- CARGAR DATOS PARA LOS SELECTORES ---
  const loadAuxData = async () => {
    const { data: usuarios } = await supabase.from('USUARIO').select('Id_Usuario, Nombre, Apellido');
    const { data: plazas } = await supabase.from('PLAZA').select('Id_Plaza, Numero_Plaza');
    
    setUsuariosList(usuarios || []);
    setPlazasList(plazas || []);
  };

  // --- FUNCIÓN PARA CREAR RESERVA ---
  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
        // Validaciones básicas
        if (new Date(formData.Fecha_Hora_Inicio) >= new Date(formData.Fecha_Hora_Fin)) {
            alert("La fecha de fin debe ser posterior a la fecha de inicio.");
            setLoading(false);
            return;
        }

        const { error } = await supabase.from('RESERVA').insert([{
            Id_Usuario: formData.Id_Usuario,
            Id_Plaza: parseInt(formData.Id_Plaza),
            Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
            Fecha_Hora_Fin: formData.Fecha_Hora_Fin,
            Estado_Reserva: 'Activa' // Estado por defecto
        }]);

        if (error) throw error;

        alert("Reserva creada exitosamente.");
        setFormData(initialForm);
        setShowModal(false);
        loadReservas();

    } catch (error) {
        alert("Error al crear reserva: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    switch (status.toLowerCase()) {
      case 'activa': classes += 'bg-green-100 text-green-800'; break;
      case 'expirada': classes += 'bg-yellow-100 text-yellow-800'; break;
      case 'cancelada': classes += 'bg-red-100 text-red-800'; break;
      case 'usada': classes += 'bg-blue-100 text-blue-800'; break;
      default: classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{status}</span>;
  };

  const filteredReservas = reservas.filter(r =>
    r.USUARIO?.Nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.PLAZA?.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.Id_Reserva).includes(searchTerm)
  );

  const handleCancel = async (id) => {
    if (window.confirm('¿Confirmar la cancelación de esta reserva?')) {
        const { error } = await supabase.from('RESERVA').update({ Estado_Reserva: 'Cancelada' }).eq('Id_Reserva', id);
        if (error) alert('Error al cancelar: ' + error.message);
        else loadReservas();
    }
  };
  
  const handleMarkUsed = async (id) => {
    const { error } = await supabase.from('RESERVA').update({ Estado_Reserva: 'Usada' }).eq('Id_Reserva', id);
    if (error) alert('Error al marcar como usada: ' + error.message);
    else loadReservas();
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Gestión de Reservaciones</h2>
            <p className="text-gray-500">Administra las reservas del sistema.</p>
        </div>
        <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
        >
            <FaPlus /> Nueva Reserva
        </button>
      </header>

     
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Crear Reserva</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                    
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Id_Usuario}
                            onChange={(e) => setFormData({...formData, Id_Usuario: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Usuario --</option>
                            {usuariosList.map(u => (
                                <option key={u.Id_Usuario} value={u.Id_Usuario}>
                                    {u.Nombre} {u.Apellido}
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora Inicio</label>
                        <input 
                            type="datetime-local"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Fecha_Hora_Inicio}
                            onChange={(e) => setFormData({...formData, Fecha_Hora_Inicio: e.target.value})}
                            required
                        />
                    </div>

                   
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora Fin</label>
                        <input 
                            type="datetime-local"
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Fecha_Hora_Fin}
                            onChange={(e) => setFormData({...formData, Fecha_Hora_Fin: e.target.value})}
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button 
                            type="button"
                            onClick={() => setShowModal(false)} 
                            className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading} 
                            className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? "Creando..." : "Crear"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Historial de Reservas</h3>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plaza</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredReservas.map(r => (
                <tr key={r.Id_Reserva} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {r.USUARIO?.Nombre} {r.USUARIO?.Apellido}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{r.PLAZA?.Numero_Plaza}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(r.Fecha_Hora_Inicio).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(r.Fecha_Hora_Fin).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <StatusBadge status={r.Estado_Reserva} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                    {r.Estado_Reserva === 'Activa' && (
                        <>
                            <button onClick={() => handleMarkUsed(r.Id_Reserva)} title="Marcar como Usada" className="text-green-600 hover:text-green-800"><FaCheckCircle /></button>
                            <button onClick={() => handleCancel(r.Id_Reserva)} title="Cancelar Reserva" className="text-red-600 hover:text-red-800"><FaTimesCircle /></button>
                        </>
                    )}
                    <button title="Ver Detalles" className="text-blue-600 hover:text-blue-800"><FaEdit /></button>
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
  */

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaCheckCircle, FaTimesCircle, FaPlus } from 'react-icons/fa';

export default function Reservaciones() {
  const [reservas, setReservas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // --- ESTADOS PARA MODAL Y CARGA ---
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usuariosList, setUsuariosList] = useState([]);
  const [plazasList, setPlazasList] = useState([]);
  
  const initialForm = {
    Id_Usuario: '',
    Id_Plaza: '',
    Fecha_Hora_Inicio: '',
    Fecha_Hora_Fin: ''
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadReservas();
    loadAuxData(); 
  }, []);

  const loadReservas = async () => {
    const { data } = await supabase
      .from('RESERVA')
      .select(`
        Id_Reserva, 
        Fecha_Hora_Inicio, 
        Fecha_Hora_Fin, 
        Estado_Reserva, 
        USUARIO (Id_Usuario, Nombre, Apellido), 
        PLAZA (Id_Plaza, Numero_Plaza)
      `)
      .order('Fecha_Hora_Inicio', { ascending: false });

    setReservas(data || []);
  };

  const loadAuxData = async () => {
    // Cargamos usuarios y plazas para los selectores del formulario
    const { data: usuarios } = await supabase.from('USUARIO').select('Id_Usuario, Nombre, Apellido');
    const { data: plazas } = await supabase.from('PLAZA').select('Id_Plaza, Numero_Plaza');
    
    setUsuariosList(usuarios || []);
    setPlazasList(plazas || []);
  };

  // --- AQUÍ ESTÁ LA MAGIA PARA ACTUALIZAR EL MAPA DE OCUPACIÓN ---
  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
        if (new Date(formData.Fecha_Hora_Inicio) >= new Date(formData.Fecha_Hora_Fin)) {
            alert("La fecha de fin debe ser posterior a la fecha de inicio.");
            setLoading(false);
            return;
        }

        // 1. Guardamos la Reserva
        const { error: errorReserva } = await supabase.from('RESERVA').insert([{
            Id_Usuario: formData.Id_Usuario,
            Id_Plaza: parseInt(formData.Id_Plaza),
            Fecha_Hora_Inicio: formData.Fecha_Hora_Inicio,
            Fecha_Hora_Fin: formData.Fecha_Hora_Fin,
            Estado_Reserva: 'Activa'
        }]);

        if (errorReserva) throw errorReserva;

        // 2. ACTUALIZACIÓN AUTOMÁTICA: Poner la plaza en "Reservada" (Amarillo)
        // Esto hace que en la página de Ocupación cambie de color
        const { error: errorPlaza } = await supabase
            .from('PLAZA')
            .update({ Estado_Actual: 'Reservada' }) 
            .eq('Id_Plaza', parseInt(formData.Id_Plaza));

        if (errorPlaza) {
            console.error("Error actualizando mapa:", errorPlaza);
        }

        alert("¡Reserva creada! La plaza se ha marcado como Reservada en el mapa.");
        setFormData(initialForm);
        setShowModal(false);
        loadReservas();

    } catch (error) {
        alert("Error al crear reserva: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    switch (status.toLowerCase()) {
      case 'activa': classes += 'bg-green-100 text-green-800'; break;
      case 'expirada': classes += 'bg-yellow-100 text-yellow-800'; break;
      case 'cancelada': classes += 'bg-red-100 text-red-800'; break;
      case 'usada': classes += 'bg-blue-100 text-blue-800'; break;
      default: classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{status}</span>;
  };

  const filteredReservas = reservas.filter(r =>
    r.USUARIO?.Nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.PLAZA?.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.Id_Reserva).includes(searchTerm)
  );

  // --- AL CANCELAR, LIBERAMOS LA PLAZA AUTOMÁTICAMENTE ---
  const handleCancel = async (idReserva, idPlaza) => {
    if (window.confirm('¿Confirmar cancelación? Esto liberará la plaza en el mapa.')) {
        
        // 1. Cancelar la reserva
        const { error } = await supabase.from('RESERVA').update({ Estado_Reserva: 'Cancelada' }).eq('Id_Reserva', idReserva);
        
        if (!error && idPlaza) {
            // 2. Liberar la plaza (Poner en Verde/Libre)
            await supabase.from('PLAZA').update({ Estado_Actual: 'Libre' }).eq('Id_Plaza', idPlaza);
        }

        if (error) alert('Error: ' + error.message);
        else loadReservas();
    }
  };
  
  const handleMarkUsed = async (id) => {
    const { error } = await supabase.from('RESERVA').update({ Estado_Reserva: 'Usada' }).eq('Id_Reserva', id);
    if (error) alert('Error: ' + error.message);
    else loadReservas();
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-bold text-gray-900">Gestión de Reservaciones</h2>
            <p className="text-gray-500">Administra las reservas del sistema.</p>
        </div>
        <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
        >
            <FaPlus /> Nueva Reserva
        </button>
      </header>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Crear Reserva</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                        <select 
                            className="w-full border p-2 rounded focus:ring-primary focus:border-primary"
                            value={formData.Id_Usuario}
                            onChange={(e) => setFormData({...formData, Id_Usuario: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Usuario --</option>
                            {usuariosList.map(u => (
                                <option key={u.Id_Usuario} value={u.Id_Usuario}>
                                    {u.Nombre} {u.Apellido}
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
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 disabled:opacity-50">
                            {loading ? "Procesando..." : "Crear"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* TABLA */}
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Historial</h3>
          <div className="relative">
            <input 
              type="text" placeholder="Buscar..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plaza</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredReservas.map(r => (
                <tr key={r.Id_Reserva} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {r.USUARIO?.Nombre} {r.USUARIO?.Apellido}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{r.PLAZA?.Numero_Plaza}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(r.Fecha_Hora_Inicio).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(r.Fecha_Hora_Fin).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <StatusBadge status={r.Estado_Reserva} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                    {r.Estado_Reserva === 'Activa' && (
                        <>
                            <button onClick={() => handleMarkUsed(r.Id_Reserva)} title="Marcar como Usada" className="text-green-600 hover:text-green-800"><FaCheckCircle /></button>
                            {/* Pasamos el ID de la plaza para liberarla */}
                            <button onClick={() => handleCancel(r.Id_Reserva, r.PLAZA?.Id_Plaza)} title="Cancelar Reserva" className="text-red-600 hover:text-red-800"><FaTimesCircle /></button>
                        </>
                    )}
                    <button title="Ver Detalles" className="text-blue-600 hover:text-blue-800"><FaEdit /></button>
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
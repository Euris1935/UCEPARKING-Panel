

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';

import { FaSearch, FaPlus, FaCheck, FaTimes, FaWrench, FaEdit } from 'react-icons/fa'; 

export default function Mantenimiento() {
  const [mantenimientos, setMantenimientos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    loadMantenimientos();
  }, []);

  const loadMantenimientos = async () => {
   
    const { data } = await supabase
      .from('MANTENIMIENTO')
      .select(`
        Id_Mantenimiento,
        Fecha_Inicio,
        Fecha_Fin,
        Descripcion_Problema,
        Estado_Mantenimiento,
        Tipo_Dispositivo_Afectado,
        Id_Sensor,
        Id_Camara,
        EMPLEADO (Nombre, Apellido)
      `)
      .order('Fecha_Inicio', { ascending: false });

    setMantenimientos(data || []);
  };
  
  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    switch (status.toLowerCase()) {
      case 'resuelto':
        classes += 'bg-green-100 text-green-800';
        break;
      case 'en curso':
        classes += 'bg-blue-100 text-blue-800';
        break;
      case 'pendiente':
        classes += 'bg-yellow-100 text-yellow-800';
        break;
      case 'cancelado':
        classes += 'bg-red-100 text-red-800';
        break;
      default:
        classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{status}</span>;
  };

  const filteredMantenimientos = mantenimientos.filter(m =>
    m.Descripcion_Problema.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.Estado_Mantenimiento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.Tipo_Dispositivo_Afectado.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleMarkResolved = async (id) => {
    const { error } = await supabase.from('MANTENIMIENTO').update({ Estado_Mantenimiento: 'Resuelto', Fecha_Fin: new Date().toISOString() }).eq('Id_Mantenimiento', id);
    if (error) alert('Error al resolver: ' + error.message);
    else loadMantenimientos();
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Mantenimiento</h2>
          <p className="text-gray-500">Rastrea y gestiona las solicitudes de reparación de dispositivos.</p>
        </div>
        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
          onClick={() => alert("Abrir formulario para Crear Nueva Solicitud")}
        >
          <FaPlus />
          Nueva Solicitud
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Historial de Trabajos</h3>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar por descripción..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispositivo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Técnico</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMantenimientos.map(m => (
                <tr key={m.Id_Mantenimiento} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{m.Id_Mantenimiento}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    {m.Tipo_Dispositivo_Afectado} ({m.Id_Sensor || m.Id_Camara})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs overflow-hidden truncate">{m.Descripcion_Problema}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {m.EMPLEADO?.Nombre || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(m.Fecha_Inicio).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <StatusBadge status={m.Estado_Mantenimiento} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                    {m.Estado_Mantenimiento !== 'Resuelto' && (
                        <button onClick={() => handleMarkResolved(m.Id_Mantenimiento)} title="Marcar Resuelto" className="text-green-600 hover:text-green-800"><FaCheck /></button>
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

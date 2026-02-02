

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaMicrochip, FaEdit, FaTools } from 'react-icons/fa';

export default function Sensores() {
  const [sensores, setSensores] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    loadSensores();
  }, []);

  const loadSensores = async () => {
    
    const { data } = await supabase
      .from('SENSOR')
      .select(`
        Id_Sensor,
        Estado_Operativo,
        MODELO_EQUIPO (Modelo, Tipo),
        PLAZA (Numero_Plaza)
      `)
      .order('Id_Sensor', { ascending: true });

    setSensores(data || []);
  };
  
  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    switch (status.toLowerCase()) {
      case 'activo':
        classes += 'bg-green-100 text-green-800';
        break;
      case 'inactivo':
        classes += 'bg-gray-100 text-gray-800';
        break;
      case 'fallo':
        classes += 'bg-red-100 text-red-800';
        break;
      default:
        classes += 'bg-yellow-100 text-yellow-800';
    }
    return <span className={classes}>{status}</span>;
  };

  const filteredSensores = sensores.filter(s =>
    String(s.Id_Sensor).includes(searchTerm) ||
    s.PLAZA?.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.Estado_Operativo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Monitoreo de Sensores</h2>
        <p className="text-gray-500">Verifica el estado operativo y la ubicación de todos los sensores.</p>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Inventario de Sensores</h3>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar por ID o plaza..." 
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Sensor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo / Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plaza Asignada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Operativo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSensores.map(s => (
                <tr key={s.Id_Sensor} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.Id_Sensor}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {s.MODELO_EQUIPO?.Modelo} ({s.MODELO_EQUIPO?.Tipo})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{s.PLAZA?.Numero_Plaza || 'No Asignada'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <StatusBadge status={s.Estado_Operativo} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                    <button title="Detalles" className="text-blue-600 hover:text-blue-800"><FaEdit /></button>
                    <button title="Reportar Mantenimiento" className="text-yellow-600 hover:text-yellow-800"><FaTools /></button>
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
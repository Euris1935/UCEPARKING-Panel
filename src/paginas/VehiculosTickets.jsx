

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Layout from '../componentes/Layout'
import { FaSearch, FaPlus, FaCalendarAlt } from 'react-icons/fa'

export default function VehiculosTickets() {
  const [registros, setRegistros] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    loadRegistros()
  }, [])

  const loadRegistros = async () => {
   
    const { data, error } = await supabase 
      .from('REGISTRO_ACCESO')
      .select(`
        Id_Registro,
        Fecha_Hora_Entrada,
        Fecha_Hora_Salida,
        VEHICULO (Placa),
        PLAZA (Numero_Plaza),
        TICKET_PARQUEO (Id_Ticket, Estado)
      `)
      .order('Fecha_Hora_Entrada', { ascending: false });

    if (error) {
        console.error("Error al cargar registros:", error.message);
        setRegistros([]); 
        return;
    }
    
    
    if (!data) {
        setRegistros([]);
        return;
    }

    
    const dataFormateada = data.map(r => ({
    
      ticketId: r.TICKET_PARQUEO?.Id_Ticket || `ACC-${r.Id_Registro}`,
      placa: r.VEHICULO?.Placa || 'N/A',
      entrada: r.Fecha_Hora_Entrada,
      plaza: r.PLAZA?.Numero_Plaza || 'N/A',
      estado: r.TICKET_PARQUEO?.Estado || (r.Fecha_Hora_Salida ? 'Pagado' : 'Activo')
    }));

    setRegistros(dataFormateada);
  }

 
  const StatusBadge = ({ status }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full capitalize ";
    switch (status.toLowerCase()) {
      case 'activo':
      case 'active':
        classes += 'bg-green-100 text-green-800';
        break;
      case 'pagado':
      case 'paid':
        classes += 'bg-blue-100 text-blue-800';
        break;
      case 'expirado':
      case 'expired':
        classes += 'bg-red-100 text-red-800';
        break;
      default:
        classes += 'bg-gray-100 text-gray-800';
    }
    return <span className={classes}>{status}</span>;
  };
  
  
  const filteredRegistros = registros
    .filter(r => statusFilter === 'All' || r.estado.toLowerCase() === statusFilter.toLowerCase())
    .filter(r => r.placa.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Layout>
      
      <header className="mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Vehículos y Tickets</h2>
          <p className="text-gray-500">Rastrea vehículos, gestiona tickets y revisa el historial de parqueo.</p>
        </div>
      </header>

      
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        
        
        <div className="flex items-center space-x-4">
          
          
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar por placa..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>

          
          <select
            className="py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Todos los Estados</option>
            <option value="Activo">Activo</option>
            <option value="Pagado">Pagado</option>
            <option value="Expirado">Expirado</option>
          </select>
          
          
          <div className="relative">
            <input 
              type="text" 
              placeholder="mm/dd/yyyy" 
              className="pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
            />
            <FaCalendarAlt className="absolute right-3 top-3 text-gray-400" />
          </div>
        </div>

        
        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
          onClick={() => alert("Abrir modal para emitir Nuevo Ticket")}
        >
          <FaPlus />
          Nuevo Ticket
        </button>
      </div>

     
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Ticket</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora Entrada</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plaza</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
             
              {filteredRegistros.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">
                    No se encontraron registros de vehículos o tickets.
                  </td>
                </tr>
              ) : (
                filteredRegistros.map(r => (
                  <tr key={r.ticketId} className="hover:bg-gray-50 transition duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.ticketId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{r.placa}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(r.entrada).toLocaleString('es-DO', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.plaza}</td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <StatusBadge status={r.estado} />
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium">
                      <button onClick={() => alert(`Ver detalles de ${r.ticketId}`)} className="hover:underline">
                          Ver Detalles
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          
          <div className="flex justify-between items-center mt-6">
            <p className="text-sm text-gray-600">
              Mostrando 1 a {Math.min(5, filteredRegistros.length)} de {filteredRegistros.length} Entradas
            </p>
            <div className="flex space-x-1">
              <button className="py-2 px-3 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">Anterior</button>
              <button className="py-2 px-3 text-sm text-white bg-primary border border-primary rounded-lg">1</button>
              <button className="py-2 px-3 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">2</button>
              <button className="py-2 px-3 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">3</button>
              <button className="py-2 px-3 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
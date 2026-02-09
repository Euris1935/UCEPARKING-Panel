

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaPlus, FaFilter, FaTrash, FaClock, FaExclamationTriangle } from 'react-icons/fa';

export default function Ocupacion() {
  // Estados de datos
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [estadosCatalogo, setEstadosCatalogo] = useState([]); // Nueva lista para estado_plaza
  
  // Estados de filtros y UI
  const [filterZona, setFilterZona] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  
  const [showModal, setShowModal] = useState(false);
  const [newPlaza, setNewPlaza] = useState({ Numero_Plaza: '', Id_Zona: '' });

  useEffect(() => {
    loadData();

    
    const channel = supabase
      .channel('cambios_plazas')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plazas' }, () => {
          loadData(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        
        const { data: estData, error: estError } = await supabase.from('estado_plaza').select('*');
        if (estError) throw estError;
        setEstadosCatalogo(estData || []);

        
        const { data: zonasData, error: zonasError } = await supabase.from('zonas_estacionamiento').select('*');
        if (zonasError) throw zonasError;
        setZonas(zonasData || []);

        // cargar plazas
        const { data: plazasData, error: plazasError } = await supabase
            .from('plazas')
            .select('*')
            .order('Id_Plaza', { ascending: true });
        
        if (plazasError) throw plazasError;

        
        const plazasCompletas = (plazasData || []).map(p => {
            // Buscamos el nombre de la zona
            const zona = zonasData.find(z => z.Id_Zona === p.Id_Zona);
            
           
            const estadoObj = estData.find(e => e.id_estado === p.id_estado);
            
            // Normalizamos el nombre del estado (Ej: "LIBRE", "OCUPADA")
            const nombreEstado = estadoObj ? estadoObj.nombre_estado.toUpperCase() : (p.Estado_Actual?.toUpperCase() || 'LIBRE');

            return {
                ...p,
                Nombre_Zona_Rel: zona ? zona.Nombre_Zona : 'Zona Desconocida',
                Nombre_Estado_Rel: nombreEstado, 
                id_estado_actual: p.id_estado 
            };
        });

        setPlazas(plazasCompletas);

    } catch (error) {
        console.error("Error cargando datos:", error.message);
    } finally {
        setLoading(false);
    }
  };

  
  const getEstadoId = (nombre) => {
      const estado = estadosCatalogo.find(e => e.nombre_estado.toUpperCase() === nombre.toUpperCase());
      return estado ? estado.id_estado : null;
  };

  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);

    if (!idNuevoEstado) {
        Swal.fire('Error de Configuración', `El estado '${nombreNuevoEstado}' no existe en la tabla 'estado_plaza'.`, 'error');
        return;
    }

    
    setPlazas(prev => prev.map(p => p.Id_Plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado } : p));

    
    const { error } = await supabase
      .from('plazas')
      .update({ 
          id_estado: idNuevoEstado,        
          Estado_Actual: nombreNuevoEstado 
      }) 
      .eq('Id_Plaza', idPlaza);

    if (error) {
      Swal.fire('Error', 'Fallo al actualizar estado: ' + error.message, 'error');
      loadData(); 
    }
  };

  const toggleOccupancy = (plaza) => {
    const estadoActual = plaza.Nombre_Estado_Rel;

    
    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'RESERVADA'].includes(estadoActual)) {
        Swal.fire({
            title: '¿Liberar plaza?',
            text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then((result) => {
            if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE');
        });
        return;
    }

    const nuevo = estadoActual === 'LIBRE' ? 'OCUPADA' : 'LIBRE';
    changeStatus(plaza.Id_Plaza, nuevo);
  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation(); 
    const estadoActual = plaza.Nombre_Estado_Rel;
   
    const nuevoEstado = estadoActual === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newPlaza.Numero_Plaza || !newPlaza.Id_Zona) return Swal.fire('Faltan datos', 'Completa los campos', 'warning');

    // Por defecto, una plaza nueva LIBRE
    const idLibre = getEstadoId('LIBRE');

    try {
        const { error } = await supabase.from('plazas').insert([{
            Numero_Plaza: newPlaza.Numero_Plaza,
            Id_Zona: parseInt(newPlaza.Id_Zona),
            id_estado: idLibre,       
            Estado_Actual: 'LIBRE',  
            Amplitud: 2.50,
            Longitud: 5.00
        }]);

        if (error) throw error;

        Swal.fire('Creada', "Plaza registrada correctamente", 'success');
        setShowModal(false);
        setNewPlaza({ Numero_Plaza: '', Id_Zona: '' });
        loadData();

    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    }
  };
  
  const handleDelete = async (id) => {
    const result = await Swal.fire({
        title: '¿Eliminar plaza?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Eliminar'
    });

    if(result.isConfirmed) {
        const { error } = await supabase.from('plazas').delete().eq('Id_Plaza', id);
        if(!error) {
            Swal.fire('Eliminada', '', 'success');
            loadData();
        } else {
            Swal.fire('Error', error.message, 'error');
        }
    }
  };

  // estilos
  const getCardColor = (estado) => {
      switch(estado) {
          case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400';
          case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400';
          case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400';
          
          case 'MANTENIMIENTO': 
          case 'FUERA_DE_SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400';
          default: return 'bg-gray-50 border-gray-200';
      }
  };

  const getBadgeColor = (estado) => {
    switch(estado) {
        case 'LIBRE': return 'text-green-700 bg-green-200';
        case 'OCUPADA': return 'text-red-700 bg-red-200';
        case 'RESERVADA': return 'text-yellow-800 bg-yellow-200';
        case 'MANTENIMIENTO': 
        case 'FUERA_DE_SERVICIO': return 'text-orange-800 bg-orange-200';
        default: return 'text-gray-700 bg-gray-200';
    }
  };

  // filtros
  const filteredPlazas = plazas.filter(p => {
    const matchesZona = filterZona ? p.Id_Zona === parseInt(filterZona) : true;
    const matchesSearch = p.Numero_Plaza 
        ? p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()) 
        : false;
    return matchesZona && matchesSearch;
  });

  const stats = {
      libres: filteredPlazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE').length,
      ocupadas: filteredPlazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA').length,
      reservadas: filteredPlazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
      mantenimiento: filteredPlazas.filter(p => ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(p.Nombre_Estado_Rel)).length
  };

  return (
    <Layout>
      <header className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Mapa de Ocupación</h2>
          <p className="text-gray-500">Gestión de plazas vinculada a sensores.</p>
        </div>
        <button 
            onClick={() => setShowModal(true)}
            className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow transition"
        >
            <FaPlus /> Añadir Plaza
        </button>
      </header>

      {/* barra de datos */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col xl:flex-row gap-4 items-center justify-between">
        <div className="flex gap-4 w-full xl:w-auto">
            <div className="relative w-full xl:w-64">
                <input 
                    type="text" placeholder="Buscar plaza..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400"/>
            </div>
            <div className="relative w-full xl:w-64">
                <select 
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary appearance-none bg-white"
                    value={filterZona} onChange={e => setFilterZona(e.target.value)}
                >
                    <option value="">Todas las Zonas</option>
                    {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                </select>
                <FaFilter className="absolute left-3 top-3 text-gray-400"/>
            </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm font-semibold justify-center">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Libres: {stats.libres}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Ocupadas: {stats.ocupadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400"></div> Reservadas: {stats.reservadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mant.: {stats.mantenimiento}</span>
        </div>
      </div>

    
      {loading ? <p className="text-center py-10 text-gray-500">Cargando...</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredPlazas.length === 0 && (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded border border-dashed text-gray-400">
                   No se encontraron plazas.
                </div>
            )}
            
            {filteredPlazas.map(plaza => (
                <div 
                    key={plaza.Id_Plaza}
                    className={`
                        relative group p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 shadow-sm
                        flex flex-col items-center justify-center text-center h-48
                        ${getCardColor(plaza.Nombre_Estado_Rel)}
                    `}
                    onClick={() => toggleOccupancy(plaza)}
                >
                    <h3 className="font-bold text-2xl text-gray-800">{plaza.Numero_Plaza}</h3>
                    <p className="text-sm text-gray-600 mt-2 mb-3 font-medium">
                        {plaza.Nombre_Zona_Rel}
                    </p>
                    
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wide ${getBadgeColor(plaza.Nombre_Estado_Rel)}`}>
                        {plaza.Nombre_Estado_Rel}
                    </span>

                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => handleSpecialState(e, plaza, 'RESERVADA')}
                            className="p-2 bg-white text-yellow-600 hover:bg-yellow-50 rounded-full shadow transition"
                            title="Reservar"
                        >
                            <FaClock />
                        </button>

                        <button 
                            onClick={(e) => handleSpecialState(e, plaza, 'FUERA_DE_SERVICIO')}
                            className="p-2 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow transition"
                            title="Mantenimiento"
                        >
                            <FaExclamationTriangle />
                        </button>

                        <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(plaza.Id_Plaza); }}
                            className="p-2 bg-white rounded-full shadow hover:bg-red-100 text-red-600"
                            title="Eliminar"
                        >
                            <FaTrash />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Añadir Plaza</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1 font-medium">Código</label>
                        <input className="w-full border p-2 rounded focus:ring-primary" placeholder="Ej: A-01" 
                            value={newPlaza.Numero_Plaza} onChange={e => setNewPlaza({...newPlaza, Numero_Plaza: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-sm mb-1 font-medium">Zona</label>
                        <select className="w-full border p-2 rounded focus:ring-primary" 
                            value={newPlaza.Id_Zona} onChange={e => setNewPlaza({...newPlaza, Id_Zona: e.target.value})} required>
                            <option value="">Seleccionar...</option>
                            {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 rounded text-gray-600 hover:bg-gray-200">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}
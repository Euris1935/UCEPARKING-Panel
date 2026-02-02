


import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaPlus, FaFilter, FaTrash, FaClock, FaExclamationTriangle } from 'react-icons/fa';

export default function Ocupacion() {
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [filterZona, setFilterZona] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Estado para modal de Nueva Plaza
  const [showModal, setShowModal] = useState(false);
  const [newPlaza, setNewPlaza] = useState({ Numero_Plaza: '', Id_Zona: '', Estado_Actual: 'Libre' });

  useEffect(() => {
    loadData();

    
    const channel = supabase
      .channel('cambios_plazas')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'PLAZA' }, (payload) => {
          setPlazas(currentPlazas => 
            currentPlazas.map(p => p.Id_Plaza === payload.new.Id_Plaza ? { ...p, ...payload.new } : p)
          );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // cargar las zonas
    const { data: zonasData, error: zonasError } = await supabase.from('ZONA_ESTACIONAMIENTO').select('*');
    if (zonasError) {
        if (zonasError.message.includes("JWT")) {
            await supabase.auth.signOut();
            window.location.href = "/login";
            return;
        }
    }
    setZonas(zonasData || []);

    // Plazas
    const { data: plazasData, error: plazasError } = await supabase
      .from('PLAZA')
      .select('*, ZONA_ESTACIONAMIENTO(Nombre_Zona)')
      .order('Id_Plaza', { ascending: true });
    
    if (plazasError) {
        console.error("Error plazas:", plazasError);
    }
    
    setPlazas(plazasData || []);
    setLoading(false);
  };

  const changeStatus = async (id, nuevoEstado) => {
    
    setPlazas(prev => prev.map(p => p.Id_Plaza === id ? { ...p, Estado_Actual: nuevoEstado } : p));

    const { error } = await supabase
      .from('PLAZA')
      .update({ Estado_Actual: nuevoEstado })
      .eq('Id_Plaza', id);

    if (error) {
      alert('Error al actualizar: ' + error.message);
      loadData();
    }
  };

  const toggleOccupancy = (plaza) => {
    
    if (plaza.Estado_Actual === 'Mantenimiento' || plaza.Estado_Actual === 'Reservada') return;
    const nuevo = plaza.Estado_Actual === 'Libre' ? 'Ocupado' : 'Libre';
    changeStatus(plaza.Id_Plaza, nuevo);
  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation(); 
    const nuevoEstado = plaza.Estado_Actual === estadoDeseado ? 'Libre' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newPlaza.Numero_Plaza || !newPlaza.Id_Zona) return alert("Faltan datos");

    const { error } = await supabase.from('PLAZA').insert([{
        Numero_Plaza: newPlaza.Numero_Plaza,
        Id_Zona: parseInt(newPlaza.Id_Zona),
        Estado_Actual: newPlaza.Estado_Actual,
        Amplitud: 2.5,
        Longitud: 5.0
    }]);

    if (error) alert(error.message);
    else {
        alert("Plaza creada");
        setShowModal(false);
        setNewPlaza({ Numero_Plaza: '', Id_Zona: '', Estado_Actual: 'Libre' });
        loadData();
    }
  };
  
   const handleDelete = async (id) => {
    if(window.confirm("¿Eliminar esta plaza permanentemente?")) {
        const { error } = await supabase.from('PLAZA').delete().eq('Id_Plaza', id);
        if(!error) loadData();
    }
  };

  
  const getCardColor = (estado) => {
      switch(estado) {
          case 'Libre': return 'bg-green-50 border-green-200 hover:border-green-400';
          case 'Ocupado': return 'bg-red-50 border-red-200 hover:border-red-400';
          case 'Reservada': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400';
          case 'Mantenimiento': return 'bg-orange-50 border-orange-200 hover:border-orange-400';
          default: return 'bg-gray-50 border-gray-200';
      }
  };

  const getBadgeColor = (estado) => {
    switch(estado) {
        case 'Libre': return 'text-green-700 bg-green-200';
        case 'Ocupado': return 'text-red-700 bg-red-200';
        case 'Reservada': return 'text-yellow-800 bg-yellow-200';
        case 'Mantenimiento': return 'text-orange-800 bg-orange-200';
        default: return 'text-gray-700 bg-gray-200';
    }
  };

 
  const filteredPlazas = plazas.filter(p => {
    const matchesZona = filterZona ? p.Id_Zona === parseInt(filterZona) : true;
    const matchesSearch = p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesZona && matchesSearch;
  });

  const stats = {
      libres: filteredPlazas.filter(p => p.Estado_Actual === 'Libre').length,
      ocupadas: filteredPlazas.filter(p => p.Estado_Actual === 'Ocupado').length,
      reservadas: filteredPlazas.filter(p => p.Estado_Actual === 'Reservada').length,
      mantenimiento: filteredPlazas.filter(p => p.Estado_Actual === 'Mantenimiento').length
  };

  return (
    <Layout>
      <header className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Mapa de Ocupación</h2>
          <p className="text-gray-500">Gestión de 9 plazas (Simulación Sensores).</p>
        </div>
        <button 
            onClick={() => setShowModal(true)}
            className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow"
        >
            <FaPlus /> Añadir Plaza
        </button>
      </header>

      
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
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary appearance-none"
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
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mantenimiento: {stats.mantenimiento}</span>
        </div>
      </div>

      
      {loading ? <p className="text-center py-10">Cargando...</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredPlazas.length === 0 && (
                <div className="col-span-full text-center py-10 text-gray-500">
                   No hay plazas disponibles.
                </div>
            )}
            
            {filteredPlazas.map(plaza => (
                <div 
                    key={plaza.Id_Plaza}
                    className={`
                        relative group p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 shadow-sm
                        flex flex-col items-center justify-center text-center h-48
                        ${getCardColor(plaza.Estado_Actual)}
                    `}
                    onClick={() => toggleOccupancy(plaza)}
                >
                    <h3 className="font-bold text-2xl text-gray-800">{plaza.Numero_Plaza}</h3>
                    <p className="text-sm text-gray-600 mt-2 mb-3 font-medium">
                        {plaza.ZONA_ESTACIONAMIENTO?.Nombre_Zona || 'Sin Zona'}
                    </p>
                    
                    <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wide ${getBadgeColor(plaza.Estado_Actual)}`}>
                        {plaza.Estado_Actual}
                    </span>

                   
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => handleSpecialState(e, plaza, 'Reservada')}
                            className={`p-2 rounded-full shadow transition ${plaza.Estado_Actual === 'Reservada' ? 'bg-yellow-500 text-white' : 'bg-white text-yellow-600 hover:bg-yellow-50'}`}
                            title="Reservar"
                        >
                            <FaClock />
                        </button>

                        <button 
                            onClick={(e) => handleSpecialState(e, plaza, 'Mantenimiento')}
                            className={`p-2 rounded-full shadow transition ${plaza.Estado_Actual === 'Mantenimiento' ? 'bg-orange-500 text-white' : 'bg-white text-orange-600 hover:bg-orange-50'}`}
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
                <h3 className="text-xl font-bold mb-4">Añadir Plaza</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm mb-1">Código</label>
                        <input className="w-full border p-2 rounded" placeholder="Ej: A-01" 
                            value={newPlaza.Numero_Plaza} onChange={e => setNewPlaza({...newPlaza, Numero_Plaza: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Zona</label>
                        <select className="w-full border p-2 rounded" 
                            value={newPlaza.Id_Zona} onChange={e => setNewPlaza({...newPlaza, Id_Zona: e.target.value})} required>
                            <option value="">Seleccionar...</option>
                            {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}
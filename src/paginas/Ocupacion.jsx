/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaClock, FaExclamationTriangle, FaMapMarkerAlt, FaSync } from 'react-icons/fa';

export default function Ocupacion() {
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [estadosCatalogo, setEstadosCatalogo] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Suscripción a cambios en tiempo real
    const channel = supabase.channel('realtime_plazas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    try {
        const { data: estData } = await supabase.from('estado_plaza').select('*');
        setEstadosCatalogo(estData || []);

        const { data: zonasData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zonasData || []);

        const { data: plazasData } = await supabase.from('plazas').select('*').order('Numero_Plaza');
        
        // Mapeo de estados
        const plazasCompletas = (plazasData || []).map(p => {
            const estadoObj = (estData || []).find(e => e.id_estado === p.id_estado);
            return {
                ...p,
                Nombre_Estado_Rel: estadoObj ? estadoObj.nombre_estado.toUpperCase() : (p.Estado_Actual?.toUpperCase() || 'LIBRE')
            };
        });
        setPlazas(plazasCompletas);
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); }
  };

  const getEstadoId = (nombre) => estadosCatalogo.find(e => e.nombre_estado.toUpperCase() === nombre.toUpperCase())?.id_estado;

  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);
    if (!idNuevoEstado) return;

    
    setPlazas(prev => prev.map(p => p.Id_Plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado } : p));

    const { error } = await supabase.from('plazas').update({ id_estado: idNuevoEstado, Estado_Actual: nombreNuevoEstado }).eq('Id_Plaza', idPlaza);
    if (error) { Swal.fire('Error', error.message, 'error'); loadData(); }
  };

  const toggleOccupancy = (plaza) => {
    const estadoActual = plaza.Nombre_Estado_Rel;
    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'RESERVADA'].includes(estadoActual)) {
        Swal.fire({
            title: '¿Liberar plaza?',
            text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then((result) => { if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); });
        return;
    }
    const nuevo = estadoActual === 'LIBRE' ? 'OCUPADA' : 'LIBRE';
    changeStatus(plaza.Id_Plaza, nuevo);
  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation(); 
    const nuevoEstado = plaza.Nombre_Estado_Rel === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };


  const getCardColor = (estado) => {
      switch(estado) {
          case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
          case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
          case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
          case 'MANTENIMIENTO': 
          case 'FUERA_DE_SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
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

  const stats = {
      libres: plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE').length,
      ocupadas: plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA').length,
      reservadas: plazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
      mantenimiento: plazas.filter(p => ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(p.Nombre_Estado_Rel)).length
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Control de Ocupación</h2>
        <p className="text-gray-500">Vista operativa en tiempo real.</p>
      </header>

     
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col xl:flex-row gap-4 items-center justify-between sticky top-0 z-10">
        <div className="relative w-full xl:w-96">
            <input type="text" placeholder="Buscar plaza..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <FaSearch className="absolute left-3 top-3 text-gray-400"/>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold justify-center">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Libres: {stats.libres}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Ocupadas: {stats.ocupadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400"></div> Reservadas: {stats.reservadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mant.: {stats.mantenimiento}</span>
            <button onClick={loadData} className="ml-2 text-primary hover:bg-blue-50 p-2 rounded-full"><FaSync /></button>
        </div>
      </div>

      {loading ? <p className="text-center py-10">Cargando...</p> : (
        <div className="space-y-8">
            {zonas.map(zona => {
                const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona && p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()));
                if (searchTerm && plazasDeZona.length === 0) return null;

                return (
                    <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 border-b pb-2">
                            <FaMapMarkerAlt className="text-primary text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">{zona.Nombre_Zona}</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                            {plazasDeZona.map(plaza => (
                                <div 
                                    key={plaza.Id_Plaza}
                                    className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel)}`}
                                    onClick={() => toggleOccupancy(plaza)}
                                >
                                    <h4 className="font-bold text-xl text-gray-800">{plaza.Numero_Plaza}</h4>
                                    <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel)}`}>
                                        {plaza.Nombre_Estado_Rel}
                                    </span>
                                    
                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'RESERVADA')} className="p-1.5 bg-white text-yellow-600 hover:bg-yellow-50 rounded-full shadow" title="Reservar"><FaClock size={12} /></button>
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'FUERA_DE_SERVICIO')} className="p-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow" title="Mantenimiento"><FaExclamationTriangle size={12} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
      )}
    </Layout>
  );
}

*/

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaClock, FaExclamationTriangle, FaMapMarkerAlt, FaSync } from 'react-icons/fa';

export default function Ocupacion() {
  const [plazas, setPlazas] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [estadosCatalogo, setEstadosCatalogo] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const channel = supabase.channel('realtime_plazas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, () => loadData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const loadData = async () => {
    try {
        const { data: estData } = await supabase.from('estado_plaza').select('*');
        setEstadosCatalogo(estData || []);

        const { data: zonasData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zonasData || []);

        const { data: plazasData } = await supabase.from('plazas').select('*').order('Numero_Plaza');
        
        const plazasCompletas = (plazasData || []).map(p => {
            const estadoObj = (estData || []).find(e => e.id_estado === p.id_estado);
            return {
                ...p,
                Nombre_Estado_Rel: estadoObj ? estadoObj.nombre_estado.toUpperCase() : (p.Estado_Actual?.toUpperCase() || 'LIBRE')
            };
        });
        setPlazas(plazasCompletas);
    } catch (error) { console.error("Error cargando datos:", error); } finally { setLoading(false); }
  };

  const getEstadoId = (nombre) => {
    return estadosCatalogo.find(e => e.nombre_estado.trim().toUpperCase() === nombre.toUpperCase())?.id_estado;
  };

  const changeStatus = async (idPlaza, nombreNuevoEstado) => {
    const idNuevoEstado = getEstadoId(nombreNuevoEstado);
    if (!idNuevoEstado) {
        console.error("Estado no encontrado en catálogo:", nombreNuevoEstado);
        return;
    }

    // Actualización optimista en UI
    setPlazas(prev => prev.map(p => p.Id_Plaza === idPlaza ? { ...p, Nombre_Estado_Rel: nombreNuevoEstado.toUpperCase(), id_estado: idNuevoEstado } : p));

    // CORRECCIÓN: Actualizamos ambos campos para sincronía total
    const { error } = await supabase
        .from('plazas')
        .update({ 
            id_estado: idNuevoEstado, 
            Estado_Actual: nombreNuevoEstado.toUpperCase() 
        })
        .eq('Id_Plaza', idPlaza);

    if (error) { 
        Swal.fire('Error', error.message, 'error'); 
        loadData(); 
    } else {
        // Forzamos recarga para asegurar que el Dashboard reciba el cambio
        loadData();
    }
  };

  const toggleOccupancy = (plaza) => {
    const estadoActual = plaza.Nombre_Estado_Rel;
    if (['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'RESERVADA'].includes(estadoActual)) {
        Swal.fire({
            title: '¿Liberar plaza?',
            text: `Estado actual: ${estadoActual}. ¿Deseas liberarla?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, liberar'
        }).then((result) => { if (result.isConfirmed) changeStatus(plaza.Id_Plaza, 'LIBRE'); });
        return;
    }
    const nuevo = estadoActual === 'LIBRE' ? 'OCUPADA' : 'LIBRE';
    changeStatus(plaza.Id_Plaza, nuevo);
  };

  const handleSpecialState = (e, plaza, estadoDeseado) => {
    e.stopPropagation(); 
    const nuevoEstado = plaza.Nombre_Estado_Rel === estadoDeseado ? 'LIBRE' : estadoDeseado;
    changeStatus(plaza.Id_Plaza, nuevoEstado);
  };

  const getCardColor = (estado) => {
      switch(estado) {
          case 'LIBRE': return 'bg-green-50 border-green-200 hover:border-green-400 shadow-sm';
          case 'OCUPADA': return 'bg-red-50 border-red-200 hover:border-red-400 shadow-sm';
          case 'RESERVADA': return 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 shadow-sm';
          case 'MANTENIMIENTO': 
          case 'FUERA_DE_SERVICIO': return 'bg-orange-50 border-orange-200 hover:border-orange-400 shadow-sm';
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

  const stats = {
      libres: plazas.filter(p => p.Nombre_Estado_Rel === 'LIBRE').length,
      ocupadas: plazas.filter(p => p.Nombre_Estado_Rel === 'OCUPADA').length,
      reservadas: plazas.filter(p => p.Nombre_Estado_Rel === 'RESERVADA').length,
      mantenimiento: plazas.filter(p => ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(p.Nombre_Estado_Rel)).length
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Control de Ocupación</h2>
        <p className="text-gray-500">Vista operativa en tiempo real.</p>
      </header>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col xl:flex-row gap-4 items-center justify-between sticky top-0 z-10">
        <div className="relative w-full xl:w-96">
            <input type="text" placeholder="Buscar plaza..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <FaSearch className="absolute left-3 top-3 text-gray-400"/>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold justify-center">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Libres: {stats.libres}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Ocupadas: {stats.ocupadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400"></div> Reservadas: {stats.reservadas}</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Mant.: {stats.mantenimiento}</span>
            <button onClick={loadData} className="ml-2 text-primary hover:bg-blue-50 p-2 rounded-full"><FaSync /></button>
        </div>
      </div>

      {loading ? <p className="text-center py-10">Cargando...</p> : (
        <div className="space-y-8">
            {zonas.map(zona => {
                const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona && p.Numero_Plaza.toLowerCase().includes(searchTerm.toLowerCase()));
                if (searchTerm && plazasDeZona.length === 0) return null;

                return (
                    <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 border-b pb-2">
                            <FaMapMarkerAlt className="text-primary text-xl" />
                            <h3 className="text-xl font-bold text-gray-800">{zona.Nombre_Zona}</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                            {plazasDeZona.map(plaza => (
                                <div 
                                    key={plaza.Id_Plaza}
                                    className={`relative group p-4 rounded-lg border-2 cursor-pointer transition-all h-32 flex flex-col items-center justify-center text-center ${getCardColor(plaza.Nombre_Estado_Rel)}`}
                                    onClick={() => toggleOccupancy(plaza)}
                                >
                                    <h4 className="font-bold text-xl text-gray-800">{plaza.Numero_Plaza}</h4>
                                    <span className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeColor(plaza.Nombre_Estado_Rel)}`}>
                                        {plaza.Nombre_Estado_Rel}
                                    </span>
                                    
                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'RESERVADA')} className="p-1.5 bg-white text-yellow-600 hover:bg-yellow-50 rounded-full shadow" title="Reservar"><FaClock size={12} /></button>
                                        <button onClick={(e) => handleSpecialState(e, plaza, 'FUERA_DE_SERVICIO')} className="p-1.5 bg-white text-orange-600 hover:bg-orange-50 rounded-full shadow" title="Mantenimiento"><FaExclamationTriangle size={12} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
      )}
    </Layout>
  );
}
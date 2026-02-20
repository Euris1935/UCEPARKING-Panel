/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave } from 'react-icons/fa'; 

export default function ZonasParqueo() {

  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);

  // --- ESTADOS DE PLAZAS ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
        const { data: zData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zData || []);

        const { data: pData } = await supabase.from('plazas').select(`*, estado_plaza(nombre_estado)`).order('Numero_Plaza');
        setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    if (parseInt(zoneForm.Capacidad_Total) <= 0) return Swal.fire('Error', "Capacidad debe ser > 0.", 'warning');

    const payload = { Nombre_Zona: zoneForm.Nombre_Zona, Capacidad_Total: parseInt(zoneForm.Capacidad_Total) };
    
    try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        let error;
        if (editingZone) {
           ({ error } = await supabase.from('zonas_estacionamiento').update(payload).eq('Id_Zona', editingZone.Id_Zona));
        } else {
           ({ error } = await supabase.from('zonas_estacionamiento').insert([payload]));
        }
        if (error) throw error;

        Swal.fire('Éxito', "Zona guardada.", 'success');
        setZoneForm(initialZoneState);
        setEditingZone(null); 
        loadData(); 
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ Nombre_Zona: zone.Nombre_Zona, Capacidad_Total: zone.Capacidad_Total });
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleDeleteZone = async (zoneId) => {
    const result = await Swal.fire({
        title: '¿Eliminar zona?',
        text: "Se borrarán TODAS las plazas de esta zona.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar todo'
    });

    if (result.isConfirmed) {
     
      await supabase.from('plazas').delete().eq('Id_Zona', zoneId);
      await supabase.from('zonas_estacionamiento').delete().eq('Id_Zona', zoneId);
      Swal.fire('Eliminado', 'Zona y plazas eliminadas.', 'success');
      loadData(); 
    }
  };


  const openPlazaModal = (plaza = null) => {
      if (plaza) {
          
          setEditingPlaza(plaza);
          setPlazaForm({ Numero_Plaza: plaza.Numero_Plaza, Id_Zona: plaza.Id_Zona });
      } else {
         
          setEditingPlaza(null);
          setPlazaForm(initialPlazaState);
      }
      setShowPlazaModal(true);
  };

  const handleSubmitPlaza = async (e) => {
      e.preventDefault();
      if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

      try {
          if (editingPlaza) {
              
              const { error } = await supabase.from('plazas')
                .update({ 
                    Numero_Plaza: plazaForm.Numero_Plaza, 
                    Id_Zona: parseInt(plazaForm.Id_Zona) 
                })
                .eq('Id_Plaza', editingPlaza.Id_Plaza);
              if (error) throw error;
              Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
          } else {
             
              const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Libre').maybeSingle();
              const idLibre = est?.id_estado || 1;

              const { error } = await supabase.from('plazas').insert([{
                  Numero_Plaza: plazaForm.Numero_Plaza,
                  Id_Zona: parseInt(plazaForm.Id_Zona),
                  id_estado: idLibre,
                  Estado_Actual: 'LIBRE'
              }]);
              if (error) throw error;
              Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
          }

          setShowPlazaModal(false);
          loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDeletePlaza = async (id) => {
      const result = await Swal.fire({
          title: '¿Borrar plaza?',
          text: "Esta acción es irreversible.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Borrar'
      });

      if (result.isConfirmed) {
          await supabase.from('plazas').delete().eq('Id_Plaza', id);
          loadData();
          Swal.fire('Eliminada', '', 'success');
      }
  };

  
  const filteredZonas = zonas.filter(z => z.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de Parqueo</h2>
          <p className="text-gray-500">Gestión estructural de zonas y plazas.</p>
        </div>
       
        <button 
            onClick={() => openPlazaModal(null)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition"
        >
            <FaPlus /> NUEVA PLAZA
        </button>
      </header>

      
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        
      
        <section className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Zonas Registradas</h3>
              <div className="relative w-64">
                <input type="text" placeholder="Buscar zona..." className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
              </div>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Capacidad</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                <tr key={z.Id_Zona} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900"><FaParking className='inline mr-2 text-primary'/> {z.Nombre_Zona}</td>
                    <td className="px-6 py-3 text-gray-500">{z.Capacidad_Total}</td>
                    <td className="px-6 py-3 flex gap-2 justify-center">
                        <button onClick={() => handleEditZone(z)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><FaEdit /></button>
                        <button onClick={() => handleDeleteZone(z.Id_Zona)} className="text-red-500 hover:bg-red-50 p-2 rounded"><FaTrash /></button>
                    </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

       
        <section className="bg-gray-50 p-6 rounded-lg border border-gray-200 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{editingZone ? "Editar Zona" : "Crear Zona"}</h3>
          <form className="space-y-4" onSubmit={handleSubmitZone}>
            <input type="text" className="w-full border p-2 rounded" placeholder="Nombre (Ej: Sótano 1)"
                value={zoneForm.Nombre_Zona} onChange={(e) => setZoneForm({...zoneForm, Nombre_Zona: e.target.value})} />
            <input type="number" className="w-full border p-2 rounded" placeholder="Capacidad Total"
                value={zoneForm.Capacidad_Total} onChange={(e) => setZoneForm({...zoneForm, Capacidad_Total: e.target.value})} />
            <div className="flex justify-end gap-2 pt-2">
              {editingZone && <button type="button" onClick={() => { setEditingZone(null); setZoneForm(initialZoneState); }} className="text-gray-500 text-sm">Cancelar</button>}
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded shadow text-sm font-bold">{editingZone ? "Actualizar" : "Guardar"}</button>
            </div>
          </form>
        </section>
      </div>

      
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">Mapa de Plazas (Edición)</h3>
        {filteredZonas.map(zona => {
            const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona);
            return (
                <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b pb-2">
                        <FaMapMarkerAlt className="text-gray-400" />
                        <h3 className="text-lg font-bold text-gray-700">{zona.Nombre_Zona}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 ml-auto">{plazasDeZona.length} plazas</span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-3">
                        {plazasDeZona.map(plaza => (
                            <div key={plaza.Id_Plaza} className="group relative p-3 rounded border bg-gray-50 hover:border-blue-400 transition-all cursor-pointer h-24 flex flex-col items-center justify-center">
                                <span className="font-bold text-lg text-gray-800">{plaza.Numero_Plaza}</span>
                                <span className="text-[10px] text-gray-400">{plaza.estado_plaza?.nombre_estado || 'N/A'}</span>
                                
                               
                                <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded transition-all">
                                    <button onClick={() => openPlazaModal(plaza)} className="text-blue-600 bg-blue-100 p-2 rounded-full hover:bg-blue-200" title="Editar"><FaEdit /></button>
                                    <button onClick={() => handleDeletePlaza(plaza.Id_Plaza)} className="text-red-600 bg-red-100 p-2 rounded-full hover:bg-red-200" title="Borrar"><FaTrash /></button>
                                </div>
                            </div>
                        ))}
                        {plazasDeZona.length === 0 && <p className="col-span-full text-center text-sm text-gray-400 py-4">Zona vacía.</p>}
                    </div>
                </section>
            );
        })}
      </div>

      
      {showPlazaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">{editingPlaza ? 'Editar Plaza' : 'Nueva Plaza'}</h3>
                <form onSubmit={handleSubmitPlaza} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Número / Código</label>
                        <input className="w-full border p-2 rounded focus:ring-primary" placeholder="Ej: A-01" 
                            value={plazaForm.Numero_Plaza} onChange={e => setPlazaForm({...plazaForm, Numero_Plaza: e.target.value})} required autoFocus />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Zona</label>
                        <select className="w-full border p-2 rounded focus:ring-primary" 
                            value={plazaForm.Id_Zona} onChange={e => setPlazaForm({...plazaForm, Id_Zona: e.target.value})} required>
                            <option value="">-- Seleccionar Zona --</option>
                            {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                        <button type="button" onClick={() => setShowPlazaModal(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow flex items-center gap-2">
                            <FaSave /> {editingPlaza ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}
  
*/

/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave } from 'react-icons/fa'; 

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);

  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
        const { data: zData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zData || []);

        // Traemos las plazas con el nombre de su estado desde 'estado_plaza'
        const { data: pData } = await supabase
          .from('plazas')
          .select(`*, estado_plaza(nombre_estado)`)
          .order('Numero_Plaza');
        setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    
    const payload = { Nombre_Zona: zoneForm.Nombre_Zona, Capacidad_Total: parseInt(zoneForm.Capacidad_Total) };
    
    try {
        let error;
        if (editingZone) {
           ({ error } = await supabase.from('zonas_estacionamiento').update(payload).eq('Id_Zona', editingZone.Id_Zona));
        } else {
           ({ error } = await supabase.from('zonas_estacionamiento').insert([payload]));
        }
        if (error) throw error;

        Swal.fire('Éxito', "Zona guardada.", 'success');
        setZoneForm(initialZoneState);
        setEditingZone(null); 
        loadData(); 
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const openPlazaModal = (plaza = null) => {
      if (plaza) {
          setEditingPlaza(plaza);
          setPlazaForm({ Numero_Plaza: plaza.Numero_Plaza, Id_Zona: plaza.Id_Zona });
      } else {
          setEditingPlaza(null);
          setPlazaForm(initialPlazaState);
      }
      setShowPlazaModal(true);
  };

  const handleSubmitPlaza = async (e) => {
      e.preventDefault();
      if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

      try {
          if (editingPlaza) {
              const { error } = await supabase.from('plazas')
                .update({ 
                    Numero_Plaza: plazaForm.Numero_Plaza, 
                    Id_Zona: parseInt(plazaForm.Id_Zona) 
                })
                .eq('Id_Plaza', editingPlaza.Id_Plaza);
              if (error) throw error;
              Swal.fire('Actualizada', `Plaza actualizada.`, 'success');
          } else {
              // BUSCAMOS EL ESTADO EN LA TABLA 'estado_plaza'
              const { data: est } = await supabase
                .from('estado_plaza')
                .select('id_estado')
                .ilike('nombre_estado', 'LIBRE')
                .maybeSingle();

              // Si por alguna razón no lo encuentra, usamos el ID 1 por defecto (LIBRE)
              const idLibrePlaza = est?.id_estado || 1;

              const { error } = await supabase.from('plazas').insert([{
                  Numero_Plaza: plazaForm.Numero_Plaza,
                  Id_Zona: parseInt(plazaForm.Id_Zona),
                  id_estado: idLibrePlaza, // FK a estado_plaza
                  Estado_Actual: 'LIBRE'
              }]);

              if (error) throw error;
              Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
          }

          setShowPlazaModal(false);
          loadData();
      } catch (error) { 
          // Manejo detallado del error de RLS
          const errorMsg = error.message.includes('row-level security')
            ? "Error de Permisos: Debes habilitar la política de inserción (INSERT) para la tabla 'plazas' en el dashboard de Supabase."
            : error.message;
          Swal.fire('Error', errorMsg, 'error'); 
      }
  };

  // ... (Resto de funciones handleDeleteZone, handleDeletePlaza permanecen igual)

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ Nombre_Zona: zone.Nombre_Zona, Capacidad_Total: zone.Capacidad_Total });
  };

  const handleDeleteZone = async (zoneId) => {
    const result = await Swal.fire({
        title: '¿Eliminar zona?',
        text: "Se borrarán TODAS las plazas de esta zona.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar todo'
    });
    if (result.isConfirmed) {
      await supabase.from('plazas').delete().eq('Id_Zona', zoneId);
      await supabase.from('zonas_estacionamiento').delete().eq('Id_Zona', zoneId);
      loadData(); 
    }
  };

  const handleDeletePlaza = async (id) => {
    const result = await Swal.fire({
        title: '¿Borrar plaza?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Borrar'
    });
    if (result.isConfirmed) {
        await supabase.from('plazas').delete().eq('Id_Plaza', id);
        loadData();
    }
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Configuración de Parqueo</h2>
          <p className="text-gray-500">Gestión de zonas y plazas utilizando la tabla estado_plaza.</p>
        </div>
        <button onClick={() => openPlazaModal(null)} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:bg-green-700">
          <FaPlus /> NUEVA PLAZA
        </button>
      </header>

      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow border">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Zonas Registradas</h3>
                <input type="text" placeholder="Buscar zona..." className="border p-2 rounded w-64" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                        <th className="p-3">Nombre</th>
                        <th className="p-3 text-center">Capacidad</th>
                        <th className="p-3 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {zonas.filter(z => z.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase())).map(z => (
                        <tr key={z.Id_Zona} className="border-t hover:bg-gray-50">
                            <td className="p-3"><FaParking className="inline mr-2 text-blue-600"/> {z.Nombre_Zona}</td>
                            <td className="p-3 text-center">{z.Capacidad_Total}</td>
                            <td className="p-3 text-center">
                                <button onClick={() => handleEditZone(z)} className="text-blue-500 mx-2"><FaEdit /></button>
                                <button onClick={() => handleDeleteZone(z.Id_Zona)} className="text-red-500"><FaTrash /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h3 className="font-bold mb-4">{editingZone ? 'Editar Zona' : 'Crear Nueva Zona'}</h3>
            <form onSubmit={handleSubmitZone} className="space-y-4">
                <input type="text" className="w-full border p-2 rounded" placeholder="Nombre (Ej: Piso 1)" value={zoneForm.Nombre_Zona} onChange={e => setZoneForm({...zoneForm, Nombre_Zona: e.target.value})} required />
                <input type="number" className="w-full border p-2 rounded" placeholder="Capacidad" value={zoneForm.Capacidad_Total} onChange={e => setZoneForm({...zoneForm, Capacidad_Total: e.target.value})} required />
                <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded font-bold">{editingZone ? 'Actualizar' : 'Guardar'}</button>
            </form>
        </div>
      </div>

    
      <div className="space-y-8">
        {zonas.map(zona => {
            const plazasZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona);
            return (
                <div key={zona.Id_Zona} className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="text-lg font-bold mb-4 text-gray-700 flex items-center gap-2">
                        <FaMapMarkerAlt className="text-red-500"/> {zona.Nombre_Zona}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-10 gap-3">
                        {plazasZona.map(p => (
                            <div key={p.Id_Plaza} className="group relative border p-3 rounded-lg flex flex-col items-center justify-center bg-gray-50 hover:border-blue-500">
                                <span className="text-xl font-black text-gray-800">{p.Numero_Plaza}</span>
                                <span className="text-[10px] uppercase font-bold text-blue-500">{p.estado_plaza?.nombre_estado || 'LIBRE'}</span>
                                <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded-lg">
                                    <button onClick={() => openPlazaModal(p)} className="text-blue-600"><FaEdit /></button>
                                    <button onClick={() => handleDeletePlaza(p.Id_Plaza)} className="text-red-500"><FaTrash /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
      </div>

      
      {showPlazaModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm">
                  <h3 className="text-2xl font-bold mb-6">{editingPlaza ? 'Editar Plaza' : 'Añadir Plaza'}</h3>
                  <form onSubmit={handleSubmitPlaza} className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-gray-600 mb-1">Número de Plaza</label>
                          <input type="text" className="w-full border p-3 rounded-lg" value={plazaForm.Numero_Plaza} onChange={e => setPlazaForm({...plazaForm, Numero_Plaza: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-gray-600 mb-1">Zona Asignada</label>
                          <select className="w-full border p-3 rounded-lg" value={plazaForm.Id_Zona} onChange={e => setPlazaForm({...plazaForm, Id_Zona: e.target.value})} required>
                              <option value="">-- Seleccionar --</option>
                              {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                          </select>
                      </div>
                      <div className="flex gap-2 pt-4">
                          <button type="button" onClick={() => setShowPlazaModal(false)} className="flex-1 bg-gray-100 p-3 rounded-lg font-bold text-gray-500">Cancelar</button>
                          <button type="submit" className="flex-1 bg-green-600 p-3 rounded-lg font-bold text-white shadow-lg hover:bg-green-700">
                             <FaSave className="inline mr-1"/> {editingPlaza ? 'Actualizar' : 'Guardar'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </Layout>
  );
}

*/

/*

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2'; 
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave, FaArrowsAltH, FaArrowsAltV } from 'react-icons/fa'; 

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);

  // --- ESTADOS DE PLAZAS ACTUALIZADO ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  
  // Incluimos Amplitud y Longitud con valores por defecto
  const initialPlazaState = { 
    Numero_Plaza: '', 
    Id_Zona: '', 
    Amplitud: '2.50', 
    Longitud: '5.00' 
  };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
        const { data: zData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zData || []);

        const { data: pData } = await supabase.from('plazas').select(`*, estado_plaza(nombre_estado)`).order('Numero_Plaza');
        setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  // --- GESTIÓN DE MODAL ---
  const openPlazaModal = (plaza = null) => {
      if (plaza) {
          setEditingPlaza(plaza);
          setPlazaForm({ 
            Numero_Plaza: plaza.Numero_Plaza, 
            Id_Zona: plaza.Id_Zona,
            Amplitud: plaza.Amplitud || '2.50',
            Longitud: plaza.Longitud || '5.00'
          });
      } else {
          setEditingPlaza(null);
          setPlazaForm(initialPlazaState);
      }
      setShowPlazaModal(true);
  };

  // --- SUBMIT DE PLAZA CON NUEVOS CAMPOS ---
  const handleSubmitPlaza = async (e) => {
      e.preventDefault();
      if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos obligatorios.', 'warning');

      try {
          const payload = {
              Numero_Plaza: plazaForm.Numero_Plaza,
              Id_Zona: parseInt(plazaForm.Id_Zona),
              Amplitud: parseFloat(plazaForm.Amplitud),
              Longitud: parseFloat(plazaForm.Longitud)
          };

          if (editingPlaza) {
              const { error } = await supabase.from('plazas')
                .update(payload)
                .eq('Id_Plaza', editingPlaza.Id_Plaza);
              if (error) throw error;
              Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
          } else {
              const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'LIBRE').maybeSingle();
              const idLibre = est?.id_estado || 1;

              const { error } = await supabase.from('plazas').insert([{
                  ...payload,
                  id_estado: idLibre,
                  Estado_Actual: 'LIBRE'
              }]);
              if (error) throw error;
              Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
          }

          setShowPlazaModal(false);
          loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  // ... (Funciones de Zonas y Delete se mantienen igual)
  const handleSubmitZone = async (e) => {
    e.preventDefault();
    const payload = { Nombre_Zona: zoneForm.Nombre_Zona, Capacidad_Total: parseInt(zoneForm.Capacidad_Total) };
    try {
        let error;
        if (editingZone) {
           ({ error } = await supabase.from('zonas_estacionamiento').update(payload).eq('Id_Zona', editingZone.Id_Zona));
        } else {
           ({ error } = await supabase.from('zonas_estacionamiento').insert([payload]));
        }
        if (error) throw error;
        setZoneForm(initialZoneState);
        setEditingZone(null); 
        loadData(); 
        Swal.fire('Éxito', "Zona guardada.", 'success');
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDeletePlaza = async (id) => {
    const result = await Swal.fire({ title: '¿Borrar plaza?', icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
        await supabase.from('plazas').delete().eq('Id_Plaza', id);
        loadData();
    }
  };

  const handleEditZone = (z) => {
    setEditingZone(z);
    setZoneForm({ Nombre_Zona: z.Nombre_Zona, Capacidad_Total: z.Capacidad_Total });
  };

  return (
    <Layout>
    
      <header className="mb-8 flex justify-between items-center">
        <h2 className="text-3xl font-bold">Configuración de Parqueo</h2>
        <button onClick={() => openPlazaModal(null)} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg"><FaPlus /> NUEVA PLAZA</button>
      </header>

     
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border">
              <h3 className="text-xl font-bold mb-4">Zonas Registradas</h3>
              <table className="w-full">
                  <thead className="bg-gray-50 uppercase text-xs font-bold text-gray-500">
                      <tr><th className="p-3 text-left">Nombre</th><th className="p-3 text-center">Capacidad</th><th className="p-3 text-center">Acciones</th></tr>
                  </thead>
                  <tbody>
                      {zonas.map(z => (
                          <tr key={z.Id_Zona} className="border-t">
                              <td className="p-3"><FaParking className="inline mr-2 text-primary"/> {z.Nombre_Zona}</td>
                              <td className="p-3 text-center">{z.Capacidad_Total}</td>
                              <td className="p-3 text-center">
                                  <button onClick={() => handleEditZone(z)} className="text-blue-500 mx-2"><FaEdit /></button>
                                  <button onClick={() => {}} className="text-red-500"><FaTrash /></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          <div className="bg-gray-50 p-6 rounded-xl border">
              <h3 className="font-bold mb-4">{editingZone ? 'Editar Zona' : 'Nueva Zona'}</h3>
              <form onSubmit={handleSubmitZone} className="space-y-4">
                  <input type="text" className="w-full border p-2 rounded" placeholder="Nombre" value={zoneForm.Nombre_Zona} onChange={e => setZoneForm({...zoneForm, Nombre_Zona: e.target.value})} required />
                  <input type="number" className="w-full border p-2 rounded" placeholder="Capacidad" value={zoneForm.Capacidad_Total} onChange={e => setZoneForm({...zoneForm, Capacidad_Total: e.target.value})} required />
                  <button type="submit" className="w-full bg-primary text-white p-2 rounded font-bold">Guardar Zona</button>
              </form>
          </div>
      </div>

  
      <div className="space-y-6">
        {zonas.map(zona => (
            <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><FaMapMarkerAlt className="text-gray-400"/> {zona.Nombre_Zona}</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {plazas.filter(p => p.Id_Zona === zona.Id_Zona).map(plaza => (
                        <div key={plaza.Id_Plaza} className="group relative p-3 rounded border bg-gray-50 flex flex-col items-center">
                            <span className="font-bold text-lg">{plaza.Numero_Plaza}</span>
                            <span className="text-[9px] text-gray-400">{plaza.Amplitud}m x {plaza.Longitud}m</span>
                            <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded">
                                <button onClick={() => openPlazaModal(plaza)} className="text-blue-600"><FaEdit /></button>
                                <button onClick={() => handleDeletePlaza(plaza.Id_Plaza)} className="text-red-600"><FaTrash /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        ))}
      </div>

     
      {showPlazaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">{editingPlaza ? 'Editar Plaza' : 'Nueva Plaza'}</h3>
                <form onSubmit={handleSubmitPlaza} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Número / Código</label>
                        <input className="w-full border p-2 rounded" placeholder="Ej: A-01" 
                            value={plazaForm.Numero_Plaza} onChange={e => setPlazaForm({...plazaForm, Numero_Plaza: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Zona</label>
                        <select className="w-full border p-2 rounded" 
                            value={plazaForm.Id_Zona} onChange={e => setPlazaForm({...plazaForm, Id_Zona: e.target.value})} required>
                            <option value="">-- Seleccionar --</option>
                            {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                        </select>
                    </div>

                   
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                                <FaArrowsAltH /> Amplitud (m)
                            </label>
                            <input type="number" step="0.01" className="w-full border p-2 rounded"
                                value={plazaForm.Amplitud} onChange={e => setPlazaForm({...plazaForm, Amplitud: e.target.value})} required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                                <FaArrowsAltV /> Longitud (m)
                            </label>
                            <input type="number" step="0.01" className="w-full border p-2 rounded"
                                value={plazaForm.Longitud} onChange={e => setPlazaForm({...plazaForm, Longitud: e.target.value})} required />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button type="button" onClick={() => setShowPlazaModal(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-primary text-white rounded font-bold flex items-center gap-2">
                            <FaSave /> {editingPlaza ? 'Actualizar' : 'Guardar Plaza'}
                        </button>
                    </div>
                </form>
            </div>
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
import { FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave, FaArrowsAltH, FaArrowsAltV } from 'react-icons/fa'; 

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  const initialZoneState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [zoneForm, setZoneForm] = useState(initialZoneState);

  // --- ESTADOS DE PLAZAS ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '', Amplitud: '2.50', Longitud: '5.00' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
        const { data: zData } = await supabase.from('zonas_estacionamiento').select('*').order('Id_Zona');
        setZonas(zData || []);

        const { data: pData } = await supabase.from('plazas').select(`*, estado_plaza(nombre_estado)`).order('Numero_Plaza');
        setPlazas(pData || []);
    } catch (error) { console.error(error); }
  };

  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    if (parseInt(zoneForm.Capacidad_Total) <= 0) return Swal.fire('Error', "Capacidad debe ser > 0.", 'warning');

    const payload = { Nombre_Zona: zoneForm.Nombre_Zona, Capacidad_Total: parseInt(zoneForm.Capacidad_Total) };
    
    try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        let error;
        if (editingZone) {
           ({ error } = await supabase.from('zonas_estacionamiento').update(payload).eq('Id_Zona', editingZone.Id_Zona));
        } else {
           ({ error } = await supabase.from('zonas_estacionamiento').insert([payload]));
        }
        if (error) throw error;

        Swal.fire('Éxito', "Zona guardada.", 'success');
        setZoneForm(initialZoneState);
        setEditingZone(null); 
        loadData(); 
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ Nombre_Zona: zone.Nombre_Zona, Capacidad_Total: zone.Capacidad_Total });
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleDeleteZone = async (zoneId) => {
    const result = await Swal.fire({
        title: '¿Eliminar zona?',
        text: "Se borrarán TODAS las plazas de esta zona.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar todo'
    });

    if (result.isConfirmed) {
      try {
        // Borrado manual en cascada para evitar errores de FK
        await supabase.from('plazas').delete().eq('Id_Zona', zoneId);
        await supabase.from('zonas_estacionamiento').delete().eq('Id_Zona', zoneId);
        Swal.fire('Eliminado', 'Zona y plazas eliminadas.', 'success');
        loadData(); 
      } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar la zona', 'error');
      }
    }
  };

  const openPlazaModal = (plaza = null) => {
      if (plaza) {
          setEditingPlaza(plaza);
          setPlazaForm({ 
            Numero_Plaza: plaza.Numero_Plaza, 
            Id_Zona: plaza.Id_Zona,
            Amplitud: plaza.Amplitud || '2.50',
            Longitud: plaza.Longitud || '5.00'
          });
      } else {
          setEditingPlaza(null);
          setPlazaForm(initialPlazaState);
      }
      setShowPlazaModal(true);
  };

  const handleSubmitPlaza = async (e) => {
      e.preventDefault();
      if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

      try {
          const payload = {
            Numero_Plaza: plazaForm.Numero_Plaza,
            Id_Zona: parseInt(plazaForm.Id_Zona),
            Amplitud: parseFloat(plazaForm.Amplitud),
            Longitud: parseFloat(plazaForm.Longitud)
          };

          if (editingPlaza) {
              const { error } = await supabase.from('plazas')
                .update(payload)
                .eq('Id_Plaza', editingPlaza.Id_Plaza);
              if (error) throw error;
              Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
          } else {
              const { data: est } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Libre').maybeSingle();
              const idLibre = est?.id_estado || 1;

              const { error } = await supabase.from('plazas').insert([{
                  ...payload,
                  id_estado: idLibre,
                  Estado_Actual: 'LIBRE'
              }]);
              if (error) throw error;
              Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
          }

          setShowPlazaModal(false);
          loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDeletePlaza = async (id) => {
      const result = await Swal.fire({
          title: '¿Borrar plaza?',
          text: "Esta acción es irreversible.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Borrar'
      });

      if (result.isConfirmed) {
          await supabase.from('plazas').delete().eq('Id_Plaza', id);
          loadData();
          Swal.fire('Eliminada', '', 'success');
      }
  };

  const filteredZonas = zonas.filter(z => z.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de Parqueo</h2>
          <p className="text-gray-500">Gestión estructural de zonas y plazas.</p>
        </div>
        <button 
            onClick={() => openPlazaModal(null)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition"
        >
            <FaPlus /> NUEVA PLAZA
        </button>
      </header>

      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <section className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Zonas Registradas</h3>
              <div className="relative w-64">
                <input type="text" placeholder="Buscar zona..." className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
              </div>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Capacidad</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                <tr key={z.Id_Zona} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900"><FaParking className='inline mr-2 text-primary'/> {z.Nombre_Zona}</td>
                    <td className="px-6 py-3 text-gray-500">{z.Capacidad_Total}</td>
                    <td className="px-6 py-3 flex gap-2 justify-center">
                        <button onClick={() => handleEditZone(z)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><FaEdit /></button>
                        <button onClick={() => handleDeleteZone(z.Id_Zona)} className="text-red-500 hover:bg-red-50 p-2 rounded"><FaTrash /></button>
                    </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-gray-50 p-6 rounded-lg border border-gray-200 h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{editingZone ? "Editar Zona" : "Crear Zona"}</h3>
          <form className="space-y-4" onSubmit={handleSubmitZone}>
            <input type="text" className="w-full border p-2 rounded" placeholder="Nombre (Ej: Sótano 1)"
                value={zoneForm.Nombre_Zona} onChange={(e) => setZoneForm({...zoneForm, Nombre_Zona: e.target.value})} />
            <input type="number" className="w-full border p-2 rounded" placeholder="Capacidad Total"
                value={zoneForm.Capacidad_Total} onChange={(e) => setZoneForm({...zoneForm, Capacidad_Total: e.target.value})} />
            <div className="flex justify-end gap-2 pt-2">
              {editingZone && <button type="button" onClick={() => { setEditingZone(null); setZoneForm(initialZoneState); }} className="text-gray-500 text-sm">Cancelar</button>}
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded shadow text-sm font-bold">{editingZone ? "Actualizar" : "Guardar"}</button>
            </div>
          </form>
        </section>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">Mapa de Plazas (Edición)</h3>
        {filteredZonas.map(zona => {
            const plazasDeZona = plazas.filter(p => p.Id_Zona === zona.Id_Zona);
            return (
                <section key={zona.Id_Zona} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b pb-2">
                        <FaMapMarkerAlt className="text-gray-400" />
                        <h3 className="text-lg font-bold text-gray-700">{zona.Nombre_Zona}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 ml-auto">{plazasDeZona.length} plazas</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-3">
                        {plazasDeZona.map(plaza => (
                            <div key={plaza.Id_Plaza} className="group relative p-3 rounded border bg-gray-50 hover:border-blue-400 transition-all cursor-pointer h-24 flex flex-col items-center justify-center">
                                <span className="font-bold text-lg text-gray-800">{plaza.Numero_Plaza}</span>
                                <span className="text-[10px] text-gray-400">{plaza.Amplitud}m x {plaza.Longitud}m</span>
                                <div className="absolute inset-0 bg-white/90 hidden group-hover:flex items-center justify-center gap-2 rounded transition-all">
                                    <button onClick={() => openPlazaModal(plaza)} className="text-blue-600 bg-blue-100 p-2 rounded-full hover:bg-blue-200" title="Editar"><FaEdit /></button>
                                    <button onClick={() => handleDeletePlaza(plaza.Id_Plaza)} className="text-red-600 bg-red-100 p-2 rounded-full hover:bg-red-200" title="Borrar"><FaTrash /></button>
                                </div>
                            </div>
                        ))}
                        {plazasDeZona.length === 0 && <p className="col-span-full text-center text-sm text-gray-400 py-4">Zona vacía.</p>}
                    </div>
                </section>
            );
        })}
      </div>

      {showPlazaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4 text-gray-800">{editingPlaza ? 'Editar Plaza' : 'Nueva Plaza'}</h3>
                <form onSubmit={handleSubmitPlaza} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Número / Código</label>
                        <input className="w-full border p-2 rounded focus:ring-primary" placeholder="Ej: A-01" 
                            value={plazaForm.Numero_Plaza} onChange={e => setPlazaForm({...plazaForm, Numero_Plaza: e.target.value})} required autoFocus />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Zona</label>
                        <select className="w-full border p-2 rounded focus:ring-primary" 
                            value={plazaForm.Id_Zona} onChange={e => setPlazaForm({...plazaForm, Id_Zona: e.target.value})} required>
                            <option value="">-- Seleccionar Zona --</option>
                            {zonas.map(z => <option key={z.Id_Zona} value={z.Id_Zona}>{z.Nombre_Zona}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><FaArrowsAltH /> Amplitud (m)</label>
                            <input type="number" step="0.01" className="w-full border p-2 rounded" value={plazaForm.Amplitud} onChange={e => setPlazaForm({...plazaForm, Amplitud: e.target.value})} required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><FaArrowsAltV /> Longitud (m)</label>
                            <input type="number" step="0.01" className="w-full border p-2 rounded" value={plazaForm.Longitud} onChange={e => setPlazaForm({...plazaForm, Longitud: e.target.value})} required />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                        <button type="button" onClick={() => setShowPlazaModal(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 shadow flex items-center gap-2">
                            <FaSave /> {editingPlaza ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </Layout>
  );
}


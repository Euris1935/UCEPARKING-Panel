

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaPlus, FaParking } from 'react-icons/fa';

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  
  
  const initialFormState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    loadZonas();
  }, []);

  const loadZonas = async () => {
   
    const { data, error } = await supabase
      .from('ZONA_ESTACIONAMIENTO')
      .select('*')
      .order('Id_Zona', { ascending: true });

    if (error) {
      console.error('Error al cargar zonas:', error.message);
      return;
    }
    setZonas(data || []);
  };

  const handleEdit = (zone) => {
    setEditingZone(zone);
    setFormData({
      Nombre_Zona: zone.Nombre_Zona,
      Capacidad_Total: zone.Capacidad_Total
    });
  };

  const handleDelete = async (zoneId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta zona?')) {
      const { error } = await supabase
        .from('ZONA_ESTACIONAMIENTO')
        .delete()
        .eq('Id_Zona', zoneId);

      if (error) alert('Error al eliminar zona: ' + error.message);
      else {
        alert('Zona eliminada con éxito.');
        loadZonas(); 
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validaciones
    if (!formData.Nombre_Zona.trim()) return alert("El nombre de la zona es obligatorio.");
    if (parseInt(formData.Capacidad_Total) <= 0) return alert("La capacidad debe ser mayor a 0.");

    const payload = {
        Nombre_Zona: formData.Nombre_Zona,
        Capacidad_Total: parseInt(formData.Capacidad_Total)
    };
    
    let error;
    if (editingZone) {
       ({ error } = await supabase.from('ZONA_ESTACIONAMIENTO').update(payload).eq('Id_Zona', editingZone.Id_Zona));
    } else {
       ({ error } = await supabase.from('ZONA_ESTACIONAMIENTO').insert([payload]));
    }

    if (error) {
        alert("Error: " + error.message);
    } else {
        alert(editingZone ? "Zona actualizada." : "Zona creada.");
        setFormData(initialFormState);
        setEditingZone(null); 
        loadZonas(); 
    }
  };
  
  const filteredZonas = zonas.filter(zone =>
    zone.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Zonas</h2>
          <p className="text-gray-500">Administra las áreas de estacionamiento.</p>
        </div>
        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md"
          onClick={() => { setEditingZone(null); setFormData(initialFormState); }}
        >
          <FaPlus /> Agregar Nueva Zona
        </button>
      </header>

      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lista */}
        <section className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Zonas Registradas</h3>
          <div className="relative mb-6">
            <input 
              type="text" 
              placeholder="Buscar zona..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Nombre Zona</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Capacidad Total</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                  <tr key={z.Id_Zona} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <FaParking className='inline mr-2 text-blue-500'/> {z.Nombre_Zona}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{z.Capacidad_Total} vehículos</td>
                    <td className="px-6 py-4 flex gap-3 justify-center">
                      <button onClick={() => handleEdit(z)} className="text-blue-600"><FaEdit /></button>
                      <button onClick={() => handleDelete(z.Id_Zona)} className="text-red-600"><FaTrash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FORMULARIO */}
        <section className="lg:col-span-1 bg-gray-50 p-6 rounded-lg border border-gray-200 h-fit">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">{editingZone ? "Editar Zona" : "Crear Nueva Zona"}</h3>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Zona</label>
              <input 
                type="text" 
                value={formData.Nombre_Zona}
                onChange={(e) => setFormData({...formData, Nombre_Zona: e.target.value})}
                required
                className="w-full border p-2 rounded focus:ring-blue-500"
                placeholder="Ej: Sótano 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad Total</label>
              <input 
                type="number" 
                value={formData.Capacidad_Total}
                onChange={(e) => setFormData({...formData, Capacidad_Total: e.target.value})}
                required
                className="w-full border p-2 rounded focus:ring-blue-500"
                placeholder="Ej: 50"
              />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              {editingZone && (
                  <button type="button" onClick={() => { setEditingZone(null); setFormData(initialFormState); }} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Cancelar</button>
              )}
              <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 font-semibold">
                {editingZone ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Layout>
  );
}
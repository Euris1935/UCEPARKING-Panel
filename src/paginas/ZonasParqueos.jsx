
/*
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaPlus, FaParking } from 'react-icons/fa';

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  
  const initialFormState = { Nombre_Zona: '', Tipo_Vehiculo_Permitido: 'Carro' };

  useEffect(() => {
    loadZonas();
  }, []);

  const loadZonas = async () => {
    
    const { data, error } = await supabase
      .from('ZONA_PARQUEO')
      .select(`
        Id_Zona, 
        Nombre_Zona, 
        Tipo_Vehiculo_Permitido,
        PLAZA (Estado_Actual)
      `);

    if (error) {
      console.error('Error al cargar zonas:', error.message);
      return;
    }
    
   
    const zonasFormateadas = data.map(z => {
      const totalPlazas = z.PLAZA.length;
      const plazasOcupadas = z.PLAZA.filter(p => p.Estado_Actual === 'Ocupado').length;
      const plazasDisponibles = totalPlazas - plazasOcupadas;
      
      return {
        ...z,
        Total_Plazas: totalPlazas,
        Plazas_Disponibles: plazasDisponibles,
      };
    });

    setZonas(zonasFormateadas || []);
  };
  
  

  const handleEdit = (zone) => {
    setEditingZone({
      Id_Zona: zone.Id_Zona,
      Nombre_Zona: zone.Nombre_Zona,
      Tipo_Vehiculo_Permitido: zone.Tipo_Vehiculo_Permitido,
    });
  };

  const handleDelete = async (zoneId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta zona? Esto puede afectar a las plazas asociadas.')) {
      const { error } = await supabase
        .from('ZONA_PARQUEO')
        .delete()
        .eq('Id_Zona', zoneId);

      if (error) {
        alert('Error al eliminar zona: ' + error.message);
      } else {
        alert('Zona eliminada con éxito.');
        loadZonas(); 
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingZone) return;

    const isUpdating = !!editingZone.Id_Zona;
    const dataToSave = {
        Nombre_Zona: editingZone.Nombre_Zona,
        Tipo_Vehiculo_Permitido: editingZone.Tipo_Vehiculo_Permitido
    };
    
    let error;

    if (isUpdating) {
       
        ({ error } = await supabase
            .from('ZONA_PARQUEO')
            .update(dataToSave)
            .eq('Id_Zona', editingZone.Id_Zona));
    } else {
        
        ({ error } = await supabase
            .from('ZONA_PARQUEO')
            .insert([dataToSave]));
    }

    if (error) {
        alert(`Error al ${isUpdating ? 'actualizar' : 'crear'} la zona: ${error.message}`);
    } else {
        alert(`Zona ${isUpdating ? 'actualizada' : 'creada'} con éxito.`);
        setEditingZone(null); 
        loadZonas(); 
    }
  };
  
  const handleCancel = () => {
    setEditingZone(null);
  };
  
  const handleNewZone = () => {
    setEditingZone(initialFormState);
  };

  

  const filteredZonas = zonas.filter(zone =>
    zone.Nombre_Zona.toLowerCase().includes(searchTerm.toLowerCase()) ||
    zone.Tipo_Vehiculo_Permitido.toLowerCase().includes(searchTerm.toLowerCase())
  );

  
  
  const getFormTitle = () => editingZone?.Id_Zona ? "Actualizar Zona" : "Crear Nueva Zona";
  const getButtonLabel = () => editingZone?.Id_Zona ? "Guardar Cambios" : "Crear Zona";
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditingZone(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const AvailabilityBadge = ({ available, total }) => {
    let classes = "px-3 py-1 text-xs font-semibold rounded-full ";
    const percentage = (available / total) * 100;
    
    if (total === 0) {
      classes += 'bg-gray-100 text-gray-800';
    } else if (percentage > 50) {
      classes += 'bg-green-100 text-green-800';
    } else if (percentage > 10) {
      classes += 'bg-yellow-100 text-yellow-800';
    } else {
      classes += 'bg-red-100 text-red-800';
    }
    
    return <span className={classes}>{available}/{total} Disp.</span>;
  };


  return (
    <Layout>
      
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Zonas de Parqueo</h2>
          <p className="text-gray-500">Administra las áreas del parqueo, su capacidad y tipo de vehículo.</p>
        </div>

        

        <button 
          className="flex items-center gap-2 bg-primary hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg font-semibold shadow-md transition duration-150"
          onClick={handleNewZone}
        >
          <FaPlus />
          Agregar Nueva Zona
        </button>
      </header>

      
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        
        <section className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Todas las Zonas</h3>
          
          
          <div className="relative mb-6">
            <input 
              type="text" 
              placeholder="Buscar por nombre o tipo de vehículo..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
          </div>

         
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zona</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo de Vehículo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disponibilidad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredZonas.map(z => (
                  <tr key={z.Id_Zona} className="hover:bg-gray-50 transition duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <FaParking className='inline mr-2 text-blue-500'/> {z.Nombre_Zona}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {z.Tipo_Vehiculo_Permitido}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <AvailabilityBadge 
                        available={z.Plazas_Disponibles} 
                        total={z.Total_Plazas} 
                      />
                    </td>
                    
                   
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-3">
                      <button 
                        className="text-gray-600 hover:text-blue-600 transition duration-150"
                        title="Actualizar"
                        onClick={() => handleEdit(z)} 
                      >
                        <FaEdit />
                      </button>
                      <button 
                        className="text-gray-600 hover:text-red-600 transition duration-150"
                        title="Eliminar"
                        onClick={() => handleDelete(z.Id_Zona)} 
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        
        <section className="lg:col-span-1 bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">{getFormTitle()}</h3>
          
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!editingZone ? (
                <p className="text-gray-500 italic">Presione el botón "Agregar Nueva Zona" o seleccione una zona de la tabla para empezar.</p>
            ) : (
                <>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Zona</label>
                  <input 
                    type="text" 
                    name="Nombre_Zona"
                    value={editingZone.Nombre_Zona || ''}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary transition duration-150"
                  />
                </div>

                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Vehículo Permitido</label>
                  <select 
                    name="Tipo_Vehiculo_Permitido"
                    value={editingZone.Tipo_Vehiculo_Permitido || ''}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-primary focus:border-primary transition duration-150"
                  >
                    <option value="Carro">Carro</option>
                    <option value="Moto">Moto</option>
                    <option value="Discapacitado">Discapacitado</option>
                    <option value="Servicio">Servicio</option>
                  </select>
                </div>

                
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={handleCancel} className="py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100 transition duration-150">
                    Cancelar
                  </button>
                  <button type="submit" className="py-2 px-4 rounded-lg bg-primary hover:bg-blue-700 text-white font-semibold transition duration-150">
                    {getButtonLabel()}
                  </button>
                </div>
                </>
            )}
          </form>
        </section>
      </div>
    </Layout>
  );
}

*/

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaEdit, FaTrash, FaPlus, FaParking } from 'react-icons/fa';

export default function ZonasParqueo() {
  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null); 
  
  // Esquema de base de datos SQL: Nombre_Zona, Capacidad_Total
  const initialFormState = { Nombre_Zona: '', Capacidad_Total: '' };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    loadZonas();
  }, []);

  const loadZonas = async () => {
    // ⚠️ Corrección: Nombre de tabla ZONA_ESTACIONAMIENTO
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
    
    // --- VALIDACIONES DE NEGOCIO ---
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
        
        {/* LISTADO */}
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



/*

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
// CORREGIDO: FaPhone incluido
import { FaSearch, FaUserTie, FaTrash, FaPlus, FaArrowLeft, FaMapMarkerAlt, FaEnvelope, FaBuilding, FaIdBadge, FaPhone } from 'react-icons/fa';

export default function Empleados() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  
  // ESTADOS PARA LAS LISTAS DESPLEGABLES
  const [roles, setRoles] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [organizaciones, setOrganizaciones] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const initialForm = { 
      Nombre: '', 
      Apellido: '', 
      Email: '', 
      Telefono: '', 
      Sexo: 'M', 
      "fecha de nacimiento": '', 
      Direccion: '',
      Id_Rol: '',           
      Id_Departamento: '',  
      Id_Organizacion: ''   
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await loadEmpleados();
    await loadAuxiliarData();
  };

  const loadEmpleados = async () => {
    // Traemos los datos + los nombres de las tablas relacionadas
    const { data } = await supabase
      .from('EMPLEADO')
      .select(`
        *,
        ROL (Id_Rol, Nombre_Rol),
        DEPARTAMENTO (Id_Departamento, Nombre_Departamento),
        ORGANIZACION (Id_Organizacion, Nombre_Organizacion)
      `)
      .order('Id_Empleado', { ascending: true });
    setEmpleados(data || []);
  };

  const loadAuxiliarData = async () => {
    // 1. Cargar Roles
    const { data: rolesData } = await supabase.from('ROL').select('*');
    setRoles(rolesData || []);

    // 2. Cargar Departamentos
    const { data: deptData } = await supabase.from('DEPARTAMENTO').select('*');
    setDepartamentos(deptData || []);

    // 3. Cargar Organizaciones
    const { data: orgData } = await supabase.from('ORGANIZACION').select('*');
    setOrganizaciones(orgData || []);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.Id_Rol || !formData.Id_Departamento || !formData.Id_Organizacion) {
        alert("Por favor selecciona Rol, Departamento y Organización.");
        return;
    }

    const { error } = await supabase.from('EMPLEADO').insert([{
        ...formData,
        Id_Rol: parseInt(formData.Id_Rol),
        Id_Departamento: parseInt(formData.Id_Departamento),
        Id_Organizacion: parseInt(formData.Id_Organizacion)
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("Empleado registrado correctamente.");
        setShowModal(false);
        setFormData(initialForm);
        loadEmpleados();
    }
  };

  const handleDelete = async (id) => {
      if(window.confirm("¿Eliminar empleado permanentemente?")) {
          const { error } = await supabase.from('EMPLEADO').delete().eq('Id_Empleado', id);
          if(error) alert("Error: " + error.message);
          else loadEmpleados();
      }
  };

  const filteredEmpleados = empleados.filter(e => 
    e.Nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.Apellido?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Empleados</h2>
          <p className="text-gray-500">Personal administrativo y operativo.</p>
        </div>
        <div className="flex gap-3">
             <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium transition">
                <FaArrowLeft /> Volver a Usuarios
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow transition">
                <FaPlus /> Nuevo Empleado
            </button>
        </div>
      </header>

     
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-[700px] shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-purple-700 border-b pb-2">
                    <FaUserTie /> Registrar Empleado
                </h3>
                <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
                    
                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Información Personal</div>
                    
                    <div>
                        <label className="block text-xs mb-1">Nombre</label>
                        <input className="w-full border p-2 rounded" value={formData.Nombre} onChange={e => setFormData({...formData, Nombre: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-xs mb-1">Apellido</label>
                        <input className="w-full border p-2 rounded" value={formData.Apellido} onChange={e => setFormData({...formData, Apellido: e.target.value})} required />
                    </div>
                    
                    <div>
                        <label className="block text-xs mb-1">Sexo</label>
                        <select className="w-full border p-2 rounded" value={formData.Sexo} onChange={e => setFormData({...formData, Sexo: e.target.value})}>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-xs mb-1">Fecha Nacimiento</label>
                        <input className="w-full border p-2 rounded" type="date" value={formData["fecha de nacimiento"]} onChange={e => setFormData({...formData, "fecha de nacimiento": e.target.value})} />
                    </div>

                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Contacto</div>
                    
                    <input className="col-span-2 w-full border p-2 rounded" type="email" placeholder="Correo Electrónico (Email)" value={formData.Email} onChange={e => setFormData({...formData, Email: e.target.value})} required />
                    <input className="w-full border p-2 rounded" placeholder="Teléfono" value={formData.Telefono} onChange={e => setFormData({...formData, Telefono: e.target.value})} />
                    <input className="w-full border p-2 rounded" placeholder="Dirección" value={formData.Direccion} onChange={e => setFormData({...formData, Direccion: e.target.value})} />

                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Asignación (Selecciona de la lista)</div>
                    
                   
                    <div>
                        <label className="block text-xs mb-1 font-bold text-purple-700">Rol</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Rol} 
                            onChange={e => setFormData({...formData, Id_Rol: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Rol --</option>
                            {roles.map(rol => (
                                <option key={rol.Id_Rol} value={rol.Id_Rol}>{rol.Nombre_Rol}</option>
                            ))}
                        </select>
                    </div>

                   
                    <div>
                        <label className="block text-xs mb-1 font-bold text-purple-700">Departamento</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Departamento} 
                            onChange={e => setFormData({...formData, Id_Departamento: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Depto --</option>
                            {departamentos.map(dep => (
                                <option key={dep.Id_Departamento} value={dep.Id_Departamento}>{dep.Nombre_Departamento}</option>
                            ))}
                        </select>
                    </div>

                    
                    <div className="col-span-2">
                        <label className="block text-xs mb-1 font-bold text-purple-700">Organización</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Organizacion} 
                            onChange={e => setFormData({...formData, Id_Organizacion: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Organización --</option>
                            {organizaciones.map(org => (
                                <option key={org.Id_Organizacion} value={org.Id_Organizacion}>{org.Nombre_Organizacion}</option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-2 flex justify-end gap-2 mt-6 pt-4 border-t">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 rounded text-gray-600 hover:bg-gray-200">Cancelar</button>
                        <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 shadow">Guardar Empleado</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="p-4 border-b bg-gray-50">
            <div className="relative w-64">
                <input type="text" placeholder="Buscar empleado..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-purple-500" onChange={e => setSearchTerm(e.target.value)} />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
            </div>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Empleado</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Contacto</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Detalles</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Asignación</th>
                    <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmpleados.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay empleados registrados.</td></tr>
                ) : (
                    filteredEmpleados.map(e => (
                    <tr key={e.Id_Empleado} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 p-2 rounded-full text-purple-600"><FaUserTie /></div>
                                <div>
                                    <p className="font-bold text-gray-900">{e.Nombre} {e.Apellido}</p>
                                    <p className="text-xs text-gray-400">ID: {e.Id_Empleado}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                            <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-2"><FaEnvelope size={10}/> {e.Email}</span>
                                <span className="flex items-center gap-2"><FaPhone size={10}/> {e.Telefono}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                           <div className="flex flex-col gap-1 text-xs">
                                <span>Sexo: {e.Sexo === 'M' ? 'M' : 'F'}</span>
                                {e.Direccion && <span className="flex items-center gap-1"><FaMapMarkerAlt size={10}/> {e.Direccion}</span>}
                           </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                            <div className="flex flex-col gap-1">
                               

                                <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200 font-semibold">
                                    {e.ROL?.Nombre_Rol || 'Sin Rol'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <FaBuilding size={10}/> 
                                    {e.DEPARTAMENTO?.Nombre_Departamento || 'Sin Depto'}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    {e.ORGANIZACION?.Nombre_Organizacion}
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(e.Id_Empleado)} className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full transition" title="Eliminar"><FaTrash /></button>
                        </td>
                    </tr>
                )))}
            </tbody>
        </table>
      </div>
    </Layout>
  );
}
  */


import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { FaSearch, FaUserTie, FaTrash, FaPlus, FaArrowLeft, FaMapMarkerAlt, FaEnvelope, FaBuilding, FaPhone } from 'react-icons/fa';

export default function Empleados() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  
  // ESTADOS PARA LAS LISTAS
  const [roles, setRoles] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [organizaciones, setOrganizaciones] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const initialForm = { 
      Nombre: '', 
      Apellido: '', 
      Email: '', 
      Telefono: '', 
      Sexo: 'M', 
      "fecha de nacimiento": '', 
      Direccion: '',
      Id_Rol: '',           
      Id_Departamento: '',  
      Id_Organizacion: ''   
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await loadEmpleados();
    await loadAuxiliarData();
  };

  const loadEmpleados = async () => {
    const { data } = await supabase
      .from('EMPLEADO')
      .select(`
        *,
        ROL (Id_Rol, Nombre_Rol),
        DEPARTAMENTO (Id_Departamento, Nombre_Departamento),
        ORGANIZACION (Id_Organizacion, Nombre_Organizacion)
      `)
      .order('Id_Empleado', { ascending: true });
    setEmpleados(data || []);
  };

  const loadAuxiliarData = async () => {
    // 1. CARGAR SOLO EL ROL 'EMPLEADO'
    // Filtramos para que la lista solo tenga esa opción
    const { data: rolesData } = await supabase
        .from('ROL')
        .select('*')
        .eq('Nombre_Rol', 'Empleado'); // <--- FILTRO ESTRICTO
    
    setRoles(rolesData || []);

    // AUTO-SELECCIONAR EL ROL SI SOLO HAY UNO (Para ahorrar tiempo)
    if (rolesData && rolesData.length === 1) {
        setFormData(prev => ({ ...prev, Id_Rol: rolesData[0].Id_Rol }));
    }

    // 2. Cargar Departamentos
    const { data: deptData } = await supabase.from('DEPARTAMENTO').select('*');
    setDepartamentos(deptData || []);

    // 3. Cargar Organizaciones
    const { data: orgData } = await supabase.from('ORGANIZACION').select('*');
    setOrganizaciones(orgData || []);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // --- VALIDACIÓN DE EDAD (MAYOR DE 18 AÑOS) ---
    if (formData["fecha de nacimiento"]) {
        const hoy = new Date();
        const nacimiento = new Date(formData["fecha de nacimiento"]);
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();
        
        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
            edad--;
        }

        if (edad < 18) {
            alert("Error: El empleado debe ser mayor de 18 años.");
            return; 
        }
    } else {
        alert("La fecha de nacimiento es obligatoria.");
        return;
    }
    // ---------------------------------------------

    if (!formData.Id_Rol || !formData.Id_Departamento || !formData.Id_Organizacion) {
        alert("Por favor asegúrate de que Rol, Departamento y Organización estén seleccionados.");
        return;
    }

    const { error } = await supabase.from('EMPLEADO').insert([{
        ...formData,
        Id_Rol: parseInt(formData.Id_Rol),
        Id_Departamento: parseInt(formData.Id_Departamento),
        Id_Organizacion: parseInt(formData.Id_Organizacion)
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("Empleado registrado correctamente.");
        setShowModal(false);
        setFormData(initialForm);
        // Volver a cargar para asegurar que el rol se auto-seleccione de nuevo si es necesario
        loadData(); 
    }
  };

  const handleDelete = async (id) => {
      if(window.confirm("¿Eliminar empleado permanentemente?")) {
          const { error } = await supabase.from('EMPLEADO').delete().eq('Id_Empleado', id);
          if(error) alert("Error: " + error.message);
          else loadEmpleados();
      }
  };

  const filteredEmpleados = empleados.filter(e => 
    e.Nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.Apellido?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Gestión de Empleados</h2>
          <p className="text-gray-500">Personal administrativo y operativo.</p>
        </div>
        <div className="flex gap-3">
             <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium transition">
                <FaArrowLeft /> Volver a Usuarios
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow transition">
                <FaPlus /> Nuevo Empleado
            </button>
        </div>
      </header>

      {/* MODAL EMPLEADO */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-[700px] shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-purple-700 border-b pb-2">
                    <FaUserTie /> Registrar Empleado
                </h3>
                <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
                    
                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Información Personal</div>
                    
                    <div>
                        <label className="block text-xs mb-1">Nombre</label>
                        <input className="w-full border p-2 rounded" value={formData.Nombre} onChange={e => setFormData({...formData, Nombre: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-xs mb-1">Apellido</label>
                        <input className="w-full border p-2 rounded" value={formData.Apellido} onChange={e => setFormData({...formData, Apellido: e.target.value})} required />
                    </div>
                    
                    <div>
                        <label className="block text-xs mb-1">Sexo</label>
                        <select className="w-full border p-2 rounded" value={formData.Sexo} onChange={e => setFormData({...formData, Sexo: e.target.value})}>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-xs mb-1">Fecha Nacimiento</label>
                        <input className="w-full border p-2 rounded" type="date" value={formData["fecha de nacimiento"]} onChange={e => setFormData({...formData, "fecha de nacimiento": e.target.value})} required />
                    </div>

                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Contacto</div>
                    
                    <input className="col-span-2 w-full border p-2 rounded" type="email" placeholder="Correo Electrónico (Email)" value={formData.Email} onChange={e => setFormData({...formData, Email: e.target.value})} required />
                    <input className="w-full border p-2 rounded" placeholder="Teléfono" value={formData.Telefono} onChange={e => setFormData({...formData, Telefono: e.target.value})} />
                    <input className="w-full border p-2 rounded" placeholder="Dirección" value={formData.Direccion} onChange={e => setFormData({...formData, Direccion: e.target.value})} />

                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase mt-2">Asignación</div>
                    
                    {/* SELECTOR DE ROL (Solo mostrará 'Empleado') */}
                    <div>
                        <label className="block text-xs mb-1 font-bold text-purple-700">Rol</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Rol} 
                            onChange={e => setFormData({...formData, Id_Rol: e.target.value})}
                            required
                        >
                            {roles.length > 1 && <option value="">-- Seleccionar --</option>}
                            {roles.map(rol => (
                                <option key={rol.Id_Rol} value={rol.Id_Rol}>{rol.Nombre_Rol}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs mb-1 font-bold text-purple-700">Departamento</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Departamento} 
                            onChange={e => setFormData({...formData, Id_Departamento: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Depto --</option>
                            {departamentos.map(dep => (
                                <option key={dep.Id_Departamento} value={dep.Id_Departamento}>{dep.Nombre_Departamento}</option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-2">
                        <label className="block text-xs mb-1 font-bold text-purple-700">Organización</label>
                        <select 
                            className="w-full border p-2 rounded bg-gray-50" 
                            value={formData.Id_Organizacion} 
                            onChange={e => setFormData({...formData, Id_Organizacion: e.target.value})}
                            required
                        >
                            <option value="">-- Seleccionar Organización --</option>
                            {organizaciones.map(org => (
                                <option key={org.Id_Organizacion} value={org.Id_Organizacion}>{org.Nombre_Organizacion}</option>
                            ))}
                        </select>
                    </div>

                    <div className="col-span-2 flex justify-end gap-2 mt-6 pt-4 border-t">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-100 rounded text-gray-600 hover:bg-gray-200">Cancelar</button>
                        <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 shadow">Guardar Empleado</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* TABLA EMPLEADOS */}
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="p-4 border-b bg-gray-50">
            <div className="relative w-64">
                <input type="text" placeholder="Buscar empleado..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-purple-500" onChange={e => setSearchTerm(e.target.value)} />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
            </div>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Empleado</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Contacto</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Detalles</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-500 uppercase">Asignación</th>
                    <th className="px-6 py-3 text-right font-bold text-gray-500 uppercase">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmpleados.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay empleados registrados.</td></tr>
                ) : (
                    filteredEmpleados.map(e => (
                    <tr key={e.Id_Empleado} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 p-2 rounded-full text-purple-600"><FaUserTie /></div>
                                <div>
                                    <p className="font-bold text-gray-900">{e.Nombre} {e.Apellido}</p>
                                    {/* ID ELIMINADO */}
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                            <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-2"><FaEnvelope size={10}/> {e.Email}</span>
                                <span className="flex items-center gap-2"><FaPhone size={10}/> {e.Telefono}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                           <div className="flex flex-col gap-1 text-xs">
                                <span>Sexo: {e.Sexo === 'M' ? 'M' : 'F'}</span>
                                {e.Direccion && <span className="flex items-center gap-1"><FaMapMarkerAlt size={10}/> {e.Direccion}</span>}
                           </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                            <div className="flex flex-col gap-1">
                                <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-200 font-semibold">
                                    {e.ROL?.Nombre_Rol || 'Sin Rol'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <FaBuilding size={10}/> 
                                    {e.DEPARTAMENTO?.Nombre_Departamento || 'Sin Depto'}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                    {e.ORGANIZACION?.Nombre_Organizacion}
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete(e.Id_Empleado)} className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-full transition" title="Eliminar"><FaTrash /></button>
                        </td>
                    </tr>
                )))}
            </tbody>
        </table>
      </div>
    </Layout>
  );
}
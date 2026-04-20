import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaSearch, FaUserTie, FaSync, FaPlus, FaArrowLeft,
  FaBuilding, FaEdit, FaTimes, FaCheck, FaUserCheck,
  FaSitemap, FaUsers
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_USUARIO } from '../lib/constants';

export default function Empleados() {
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Personal', 'crear');
  const canEdit   = tienePermiso('Módulo Personal', 'editar');
  const canDelete = tienePermiso('Módulo Personal', 'eliminar');

  const navigate = useNavigate();

  const [empleados,           setEmpleados]           = useState([]);
  const [departamentos,       setDepartamentos]       = useState([]);
  const [catEstados,          setCatEstados]          = useState([]);
  const [usuariosSinEmpleo,   setUsuariosSinEmpleo]   = useState([]); 
  const [searchTerm,          setSearchTerm]          = useState('');
  const [loading,             setLoading]             = useState(false);
  const [currentPersonaId,    setCurrentPersonaId]    = useState(null);
  const [changingStatusFor,   setChangingStatusFor]   = useState(null);
  const [newStatusChoice,     setNewStatusChoice]     = useState('');

  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editingEmp,    setEditingEmp]    = useState(null);
  
  // Enriquecemos el formData con los campos detectados en Branch-b
  const [formData,      setFormData]      = useState({ 
    id_persona: '', 
    departamento_id: '',
    sexo: 'M',
    fecha_nacimiento: '',
    telefono: '',
    direccion: ''
  });

  const isUpdating = !!editingEmp;
  const { orgId, orgNombre } = useOrg();

  useEffect(() => { 
    if (orgId) loadData(); 
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data: deptData } = await supabase.from('departamento').select('*').eq('organizacion_id', orgId);
      setDepartamentos(deptData || []);

      const { data: estData } = await supabase.from('estado_usuario').select('*').order('id_estado');
      setCatEstados(estData || []);
      
      await cargarEmpleados(deptData || []);

      // Obtener persona_id del usuario actual para el log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
        setCurrentPersonaId(ud?.id_persona);
      }

    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarEmpleados = async (deptList) => {
    const { data: emps } = await supabase.from('empleado').select('*, estado:id_estado(nombre)').eq('organizacion_id', orgId).order('id_empleado');
    const { data: orgUsers } = await supabase.rpc('get_usuarios_org');
    
    // #RF05: Enriquecer con datos de persona
    const { data: pDatas } = await supabase.from('persona').select('*').eq('organizacion_id', orgId);
    const pMap = {}; (pDatas || []).forEach(p => pMap[p.id_persona] = p);

    const todosLosUsuarios = orgUsers || [];

    const lista = (emps || []).map(emp => {
      const uRow  = todosLosUsuarios.find(u => u.id_persona === emp.id_persona);
      const pRow  = pMap[emp.id_persona];
      const depto = deptList.find(d => d.id_departamento === emp.departamento_id);
      return {
        id_empleado:     emp.id_empleado,
        persona_id:      emp.id_persona,
        departamento_id: emp.departamento_id,
        organizacion_id: emp.organizacion_id,
        id_estado:       emp.id_estado,
        nombre_estado:   emp.estado?.nombre || 'Desconocido',
        nombre:          uRow?.nombre   || pRow?.nombre || 'Sin Nombre',
        apellido:        uRow?.apellido || pRow?.apellido || '',
        email:           uRow?.email    || pRow?.email || '',
        telefono:        pRow?.telefono || '',
        sexo:            pRow?.sexo || 'M',
        fecha_nacimiento: pRow?.fecha_nacimiento || '',
        direccion:       pRow?.direccion || '',
        nombre_depto:    depto?.nombre || 'Sin Depto',
      };
    });
    setEmpleados(lista);

    const empPersonaIds = new Set((emps || []).map(e => e.id_persona));
    const disponibles = todosLosUsuarios
      .filter(u => u.id_persona && !empPersonaIds.has(u.id_persona))
      .map(u => ({
        id_persona:     u.id_persona,
        nombreCompleto: `${u.nombre || ''} ${u.apellido || ''}`.trim(),
        email:          u.email || '',
      }))
      .filter(u => u.nombreCompleto);
    setUsuariosSinEmpleo(disponibles);
  };

  const abrirCrear = () => {
    setEditingEmp(null);
    setFormData({ id_persona: '', departamento_id: '', sexo: 'M', fecha_nacimiento: '', telefono: '', direccion: '' });
    setPanelOpen(true);
  };

  const abrirEditar = (emp) => {
    setEditingEmp(emp);
    setFormData({
      id_persona:      emp.persona_id,
      departamento_id: emp.departamento_id || '',
      sexo:            emp.sexo || 'M',
      fecha_nacimiento: emp.fecha_nacimiento || '',
      telefono:        emp.telefono || '',
      direccion:       emp.direccion || ''
    });
    setPanelOpen(true);
  };

  const cerrarPanel = () => {
    setPanelOpen(false);
    setEditingEmp(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { id_persona, departamento_id, fecha_nacimiento, sexo, telefono, direccion } = formData;

    if (!departamento_id) return Swal.fire('Atención', 'Selecciona un departamento.', 'warning');
    if (!isUpdating && !id_persona) return Swal.fire('Atención', 'Selecciona un usuario del sistema.', 'warning');

    // Validación de edad (Branch-b feature)
    if (fecha_nacimiento) {
      const hoy = new Date();
      const naci = new Date(fecha_nacimiento);
      let edad = hoy.getFullYear() - naci.getFullYear();
      const m = hoy.getMonth() - naci.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < naci.getDate())) edad--;
      if (edad < 18) return Swal.fire('Error', 'El empleado debe ser mayor de 18 años.', 'error');
    }

    try {
      Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      // Actualizar datos de persona primero (sexo, fn, tel, dir)
      const persona_id_target = isUpdating ? editingEmp.persona_id : id_persona;
      const { error: pErr } = await supabase.from('persona').update({
        sexo, fecha_nacimiento, telefono, direccion
      }).eq('id_persona', persona_id_target);
      if (pErr) throw pErr;

      const payload = {
        departamento_id: parseInt(departamento_id),
        organizacion_id: orgId,
      };

      if (isUpdating) {
        const { error } = await supabase.from('empleado').update(payload).eq('id_empleado', editingEmp.id_empleado);
        if (error) throw error;
        
        registrarLog({
          tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
          descripcion: `Datos de ${editingEmp.nombre} actualizados (Asignación laboral).`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Personal'
        });
        Swal.fire('Actualizado', 'Datos laborales y personales actualizados.', 'success');
      } else {
        const { error } = await supabase.from('empleado').insert([{ 
            id_persona, 
            id_estado: ESTADO_USUARIO.ACTIVO, 
            ...payload 
        }]);
        if (error) throw error;

        registrarLog({
          tipo_nombre: EVENT_TYPES.NUEVO_EMPLEADO || EVENT_TYPES.CAMBIO_ESTADO,
          descripcion: `Usuario ${id_persona} asignado como empleado.`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Personal'
        });
        Swal.fire('¡Asignado!', 'El usuario fue registrado como empleado.', 'success');
      }

      cerrarPanel();
      loadData();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message, 'error');
    }
  };

  const handleConfirmarCambioEstado = async (emp) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('empleado')
        .update({ id_estado: parseInt(newStatusChoice) })
        .eq('id_empleado', emp.id_empleado);
      
      if (error) throw error;
      
      const stName = catEstados.find(s => s.id_estado === parseInt(newStatusChoice))?.nombre || 'Desconocido';
      registrarLog({
        tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
        descripcion: `Empleado ${emp.nombre} ${emp.apellido} cambiado a estado ${stName}`,
        id_persona: currentPersonaId,
        organizacion_id: orgId,
        origen: 'Panel Web - Personal'
      });
      
      Swal.fire({ title: 'Estado Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
      setChangingStatusFor(null);
      loadData();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo cambiar el estado.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = empleados.filter(e =>
    `${e.nombre} ${e.apellido} ${e.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FaUsers className="text-purple-600" /> Gestión de Empleados
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Convierte usuarios en empleados, valida mayoría de edad y asigna departamentos.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/usuarios')} className="flex items-center gap-2 text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium transition">
            <FaArrowLeft /> Usuarios
          </button>
          {canCreate && (
            <button onClick={abrirCrear} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow transition font-semibold">
              <FaPlus /> Agregar Empleado
            </button>
          )}
        </div>
      </header>

      {orgNombre && (
        <div className="mb-5 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 w-fit">
          <FaBuilding className="text-purple-500" />
          <span className="text-sm font-semibold text-purple-700">Organización:</span>
          <span className="text-sm text-purple-900 font-bold">{orgNombre}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <div className="relative w-72">
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar empleado..."
                  className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <span className="text-xs text-gray-400 font-medium">{filtrados.length} empleado(s)</span>
            </div>

            {loading && !changingStatusFor ? (
              <div className="text-center py-16 text-gray-400">
                <div className="animate-spin inline-block w-6 h-6 border-4 border-purple-400 border-t-transparent rounded-full mb-3" />
                <p className="text-sm">Cargando...</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FaUserTie className="mx-auto text-4xl mb-3 opacity-20" />
                <p className="text-sm">No hay empleados registrados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-base">
                  <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-5 py-4 text-left">Empleado</th>
                      <th className="px-5 py-4 text-left">Departamento</th>
                      <th className="px-5 py-4 text-center">Estado</th>
                      <th className="px-5 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50 text-sm font-medium">
                    {filtrados.map(emp => (
                      <tr key={emp.id_empleado} className="hover:bg-purple-50/50 transition-all">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-purple-600 text-white w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-sm">
                              {emp.nombre.charAt(0)}{emp.apellido.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{emp.nombre} {emp.apellido}</p>
                              <p className="text-[10px] text-gray-400">{emp.email || 'Sin email'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500">
                           <span className="bg-gray-100 px-2 py-1 rounded-lg text-xs font-bold text-gray-600">{emp.nombre_depto}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                            {changingStatusFor === emp.id_empleado ? (
                                <div className="flex items-center justify-center gap-1">
                                    <select value={newStatusChoice} onChange={e => setNewStatusChoice(e.target.value)} className="border rounded px-2 py-1 text-xs">
                                        {catEstados.map(s => <option key={s.id_estado} value={s.id_estado}>{s.nombre}</option>)}
                                    </select>
                                    <button onClick={() => handleConfirmarCambioEstado(emp)} className="p-1 bg-green-500 text-white rounded"><FaCheck size={10}/></button>
                                    <button onClick={() => setChangingStatusFor(null)} className="p-1 bg-gray-300 text-gray-600 rounded"><FaTimes size={10}/></button>
                                </div>
                            ) : (
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${emp.nombre_estado.toLowerCase() === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {emp.nombre_estado}
                                </span>
                            )}
                        </td>
                        <td className="px-5 py-4 text-center flex justify-center gap-3">
                           {canEdit && <button onClick={() => abrirEditar(emp)} className="text-blue-500 hover:scale-110 transition"><FaEdit size={16}/></button>}
                           {canEdit && <button onClick={() => { setChangingStatusFor(emp.id_empleado); setNewStatusChoice(emp.id_estado.toString()); }} className="text-purple-500 hover:scale-110 transition"><FaSync size={16}/></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {panelOpen && (
          <aside className="w-full lg:w-[350px] flex-shrink-0 animate-in slide-in-from-right-4 fade-in">
            <div className="bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden sticky top-6">
              <div className="bg-purple-600 px-5 py-4 flex items-center justify-between text-white font-bold">
                <span className="flex items-center gap-2"><FaUserCheck /> {isUpdating ? 'Editar Ficha' : 'Nueva Asignación'}</span>
                <button onClick={cerrarPanel}><FaTimes /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {!isUpdating && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Usuario Sistema *</label>
                    <select className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" value={formData.id_persona} onChange={e => setFormData({...formData, id_persona: e.target.value})} required>
                      <option value="">— Elegir Usuario —</option>
                      {usuariosSinEmpleo.map(u => <option key={u.id_persona} value={u.id_persona}>{u.nombreCompleto}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Departamento *</label>
                  <select className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" value={formData.departamento_id} onChange={e => setFormData({...formData, departamento_id: e.target.value})} required>
                    <option value="">— Seleccionar —</option>
                    {departamentos.map(d => <option key={d.id_departamento} value={d.id_departamento}>{d.nombre}</option>)}
                  </select>
                </div>
                <hr className="border-gray-50"/>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Sexo</label>
                        <select className="w-full border rounded-xl p-2.5 text-sm outline-none" value={formData.sexo} onChange={e => setFormData({...formData, sexo: e.target.value})}>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Nacimiento (18+)</label>
                        <input type="date" className="w-full border rounded-xl p-2 text-sm" value={formData.fecha_nacimiento} onChange={e => setFormData({...formData, fecha_nacimiento: e.target.value})} />
                    </div>
                </div>
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Teléfono</label>
                   <input type="text" className="w-full border rounded-xl p-2.5 text-sm" placeholder="809-xxx-xxxx" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Dirección</label>
                   <textarea className="w-full border rounded-xl p-2.5 text-sm h-20 resize-none" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} />
                </div>
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition shadow-md">
                    {isUpdating ? 'ACTUALIZAR DATOS' : 'ASIGNAR COMO EMPLEADO'}
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </Layout>
  );
}
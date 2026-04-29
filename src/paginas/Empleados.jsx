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
import SearchableSelect from '../componentes/SearchableSelect';

export default function Empleados() {
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Personal', 'crear');
  const canEdit   = tienePermiso('Módulo Personal', 'editar');
  const canDelete = tienePermiso('Módulo Personal', 'eliminar');

  const navigate = useNavigate();

  // ── Datos generales ─────────────────────────────────────────────────────────
  const [empleados,           setEmpleados]           = useState([]);
  const [departamentos,       setDepartamentos]       = useState([]);
  const [cargos,              setCargos]              = useState([]);
  const [catEstados,          setCatEstados]          = useState([]);
  const [usuariosSinEmpleo,   setUsuariosSinEmpleo]   = useState([]); // usuarios no empleados aún
  const [adminOrgId,          setAdminOrgId]          = useState(null);
  const [adminOrgNombre,      setAdminOrgNombre]      = useState('');
  const [searchTerm,          setSearchTerm]          = useState('');
  const [loading,             setLoading]             = useState(false);
  const [currentPersonaId,    setCurrentPersonaId]    = useState(null);
  const [changingStatusFor,   setChangingStatusFor]   = useState(null);
  const [newStatusChoice,     setNewStatusChoice]     = useState('');

  // ── Panel lateral ───────────────────────────────────────────────────────────
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editingEmp,    setEditingEmp]    = useState(null);
  const [formData,      setFormData]      = useState({ id_persona: '', departamento_id: '', id_cargo: '' });

  const isUpdating = !!editingEmp;

  const { orgId } = useOrg();

  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => { 
    if (orgId) loadData(); 
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // 1. Catálogos + nombre de organización en paralelo
      const [
        { data: deptData },
        { data: estData },
        { data: cargoData },
        { data: orgData }
      ] = await Promise.all([
        supabase.from('departamento').select('*').eq('organizacion_id', orgId).order('nombre'),
        supabase.from('estado_usuario').select('*').order('id_estado'),
        supabase.from('cargo').select('*').order('nombre'), // Orden alfabético
        supabase.from('organizacion').select('id_organizacion, nombre').eq('id_organizacion', orgId).single()
      ]);

      setDepartamentos(deptData || []);
      setCatEstados(estData || []);
      setCargos(cargoData || []);

      if (orgData) {
        setAdminOrgId(orgData.id_organizacion);
        setAdminOrgNombre(orgData.nombre);
      }

      await cargarEmpleados(deptData || []);

    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── El log usa `registrarLog` global ──

  const cargarEmpleados = async (deptList) => {
    let emps = null;
    
    // Intentar con JOIN completo incluyendo tipo_persona
    const { data: empsData, error: empErr } = await supabase
      .from('empleado')
      .select(`
        *, 
        estado:id_estado(nombre),
        cargo:id_cargo(nombre, nivel_privilegio),
        persona:id_persona(nombre, apellido, email, id_tipo_persona)
      `)
      .eq('organizacion_id', orgId)
      .order('id_empleado');

    if (empErr) {
      console.error('Error cargando empleados:', empErr.message);
    }
    emps = empsData;

    // Traer tipos de persona por separado para evitar el error de FK duplicada
    const { data: tiposData } = await supabase.from('tipo_persona').select('id_tipo_persona, nombre');
    const tipoMap = Object.fromEntries((tiposData || []).map(t => [t.id_tipo_persona, t.nombre]));

    const { data: orgUsers, error: rpcErr } = await supabase.rpc('get_usuarios_org');
    if (rpcErr) console.warn('get_usuarios_org error:', rpcErr.message);
    const todosLosUsuarios = orgUsers || [];

    const lista = (emps || []).map(emp => {
      const depto = deptList.find(d => d.id_departamento === emp.departamento_id);
      return {
        id_empleado:     emp.id_empleado,
        persona_id:      emp.id_persona,
        departamento_id: emp.departamento_id,
        id_cargo:        emp.id_cargo,
        organizacion_id: emp.organizacion_id,
        id_estado:       emp.id_estado,
        nombre_estado:   emp.estado?.nombre || 'Desconocido',
        nombre:          emp.persona?.nombre   || 'Sin Nombre',
        apellido:        emp.persona?.apellido || '',
        email:           emp.persona?.email    || '',
        nombre_depto:    depto?.nombre || 'Sin Depto',
        nombre_cargo:    emp.cargo?.nombre || 'Sin Cargo',
        nivel_cargo:     emp.cargo?.nivel_privilegio || 1,
        nombre_tipo:     tipoMap[emp.persona?.id_tipo_persona] || 'N/A'
      };
    }).sort((a,b) => {
      const na = `${a.nombre} ${a.apellido}`.toLowerCase();
      const nb = `${b.nombre} ${b.apellido}`.toLowerCase();
      return na.localeCompare(nb);
    });
    setEmpleados(lista);

    const empPersonaIds = new Set((emps || []).map(e => e.id_persona));
    const disponibles = todosLosUsuarios
      .filter(u => u.id_persona && !empPersonaIds.has(u.id_persona))
      // Solo permitir empleados que sean Docentes (2) o Administrativos (3)
      .filter(u => [2, 3].includes(u.id_tipo_persona))
      .map(u => ({
        id_persona:     u.id_persona,
        nombreCompleto: `${u.nombre} ${u.apellido}`,
        email:          u.email || '',
      }))
      .sort((a,b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
    setUsuariosSinEmpleo(disponibles);
  };

  // ── Abrir panel para crear ──
  const abrirCrear = () => {
    setEditingEmp(null);
    setFormData({ id_persona: '', departamento_id: '', id_cargo: '' });
    setPanelOpen(true);
  };

  // ── Abrir panel para editar ──
  const abrirEditar = (emp) => {
    setEditingEmp(emp);
    setFormData({
      id_persona:      emp.persona_id,
      departamento_id: emp.departamento_id || '',
      id_cargo:        emp.id_cargo || '',
    });
    setPanelOpen(true);
  };

  const cerrarPanel = () => {
    setPanelOpen(false);
    setEditingEmp(null);
    setFormData({ id_persona: '', departamento_id: '' });
  };

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { id_persona, departamento_id, id_cargo } = formData;

    if (!departamento_id) {
      return Swal.fire('Atención', 'Selecciona un departamento.', 'warning');
    }
    if (!id_cargo) {
      return Swal.fire('Atención', 'Selecciona un cargo.', 'warning');
    }
    if (!isUpdating && !id_persona) {
      return Swal.fire('Atención', 'Selecciona un usuario del sistema.', 'warning');
    }

    if (!orgId) {
      return Swal.fire('Error', 'No se ha detectado su organización de administración. Por favor, recargue la página o verifique su perfil.', 'error');
    }

    try {
      Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      const payload = {
        departamento_id: parseInt(departamento_id),
        id_cargo: parseInt(id_cargo),
        organizacion_id: orgId,
      };

      if (isUpdating) {
        const { error } = await supabase
          .from('empleado')
          .update(payload)
          .eq('id_empleado', editingEmp.id_empleado);
        if (error) throw error;
        registrarLog({
          tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
          descripcion: `Datos de ${editingEmp.nombre} actualizados.`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: 'Panel Web - Personal'
        });
        Swal.fire('Actualizado', 'Datos laborales actualizados.', 'success');
      } else {
        const { error } = await supabase
          .from('empleado')
          .insert([{ id_persona, id_estado: ESTADO_USUARIO.ACTIVO, ...payload }]);
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
      await cargarEmpleados(departamentos);
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
      
      Swal.fire({
        title: 'Estado Actualizado',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      setChangingStatusFor(null);
      await cargarEmpleados(departamentos);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo cambiar el estado.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const filtrados = empleados.filter(e =>
    `${e.nombre} ${e.apellido} ${e.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <Layout>
      {/* ── Header ── */}
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FaUsers className="text-purple-600" /> Gestión de Empleados
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Convierte usuarios del sistema en empleados y asígnales rol y departamento.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/usuarios')}
            className="flex items-center gap-2 text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium transition"
          >
            <FaArrowLeft /> Usuarios
          </button>
          <button
            onClick={abrirCrear}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white py-2 px-4 rounded-lg shadow transition font-semibold"
          >
            <FaPlus /> Nuevo Empleado
          </button>
        </div>
      </header>

      {/* ── Barra organización del admin ── */}
      {adminOrgNombre && (
        <div className="mb-5 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 w-fit">
          <FaBuilding className="text-purple-500" />
          <span className="text-sm font-semibold text-purple-700">Organización activa:</span>
          <span className="text-sm text-purple-900 font-bold">{adminOrgNombre}</span>
          <span className="text-xs text-purple-400 ml-1">(los empleados se asignanaqui por defecto)</span>
        </div>
      )}

      {/* Contenedor principal con panel lateral */}
      <div className="flex gap-6">

        {/* ── Tabla de empleados ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
            {/* Barra de búsqueda */}
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
              <span className="text-xs text-gray-400 font-medium">
                {filtrados.length} empleado{filtrados.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div className="text-center py-16 text-gray-400">
                <div className="animate-spin inline-block w-6 h-6 border-4 border-purple-400 border-t-transparent rounded-full mb-3" />
                <p className="text-sm">Cargando empleados...</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FaUserTie className="mx-auto text-4xl mb-3 opacity-20" />
                <p className="text-sm">No hay empleados registrados.</p>
                <button onClick={abrirCrear} className="mt-4 text-purple-600 text-sm font-semibold hover:underline">
                  + Agregar el primer empleado
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-base">
                  <thead className="bg-gray-50 text-sm font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 text-left">Empleado</th>
                      <th className="px-5 py-3 text-left">Cargo / Nivel</th>
                      <th className="px-5 py-3 text-left">Departamento</th>
                      <th className="px-5 py-3 text-center">Estado</th>
                      <th className="px-5 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filtrados.map(emp => (
                      <tr
                        key={emp.id_empleado}
                        className={`hover:bg-purple-50 transition-all cursor-pointer ${editingEmp?.id_empleado === emp.id_empleado ? 'bg-purple-50 ring-1 ring-inset ring-purple-300' : ''} ${emp.nombre_estado.toLowerCase() !== 'activo' ? 'opacity-60 grayscale-[0.3]' : ''}`}
                        onClick={() => abrirEditar(emp)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shadow-sm">
                              {emp.nombre.charAt(0)}{emp.apellido.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm leading-tight">{emp.nombre} {emp.apellido}</p>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-black uppercase">{emp.nombre_tipo}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-bold text-gray-700">{emp.nombre_cargo}</p>
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <span key={i} className={`text-[10px] ${i < Math.ceil(emp.nivel_cargo / 2) ? 'text-amber-500' : 'text-gray-200'}`}>★</span>
                                ))}
                                <span className="text-[10px] font-bold text-gray-400 ml-1">Nv.{emp.nivel_cargo}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-600 text-sm">
                          <span className="flex items-center gap-1">
                            <FaSitemap size={12} className="text-gray-400" />
                            {emp.nombre_depto}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center" onClick={ev => ev.stopPropagation()}>
                           {changingStatusFor === emp.id_empleado ? (
                              <div className="flex items-center justify-center gap-1 animate-fadeIn">
                                <select
                                  value={newStatusChoice}
                                  onChange={(e) => setNewStatusChoice(e.target.value)}
                                  className="border border-purple-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-200 focus:border-purple-500 outline-none transition-all cursor-pointer bg-white"
                                >
                                  {catEstados.map(s => (
                                    <option key={s.id_estado} value={s.id_estado}>{s.nombre}</option>
                                  ))}
                                </select>
                                <button 
                                  onClick={() => handleConfirmarCambioEstado(emp)}
                                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition shadow-sm"
                                  title="Confirmar"
                                >
                                  {loading ? <FaSync size={12} className="animate-spin" /> : <FaCheck size={12} />}
                                </button>
                                <button 
                                  onClick={() => setChangingStatusFor(null)}
                                  className="p-2 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition"
                                  title="Cancelar"
                                >
                                  <FaTimes size={12} />
                                </button>
                              </div>
                           ) : (
                             <div
                                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                  emp.nombre_estado.toLowerCase() === 'activo' ? 'bg-green-100 text-green-700' :
                                  emp.nombre_estado.toLowerCase().includes('inactivo') ? 'bg-gray-100 text-gray-600' :
                                  'bg-red-100 text-red-700'
                                }`}
                             >
                                {emp.nombre_estado}
                             </div>
                           )}
                        </td>
                        <td className="px-5 py-4 text-center" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => abrirEditar(emp)}
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                              title="Editar asignación"
                            >
                              <FaEdit size={13} />
                            </button>
                            <button
                              onClick={() => {
                                setChangingStatusFor(emp.id_empleado);
                                setNewStatusChoice(emp.id_estado.toString());
                              }}
                              className="px-3 py-2 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 text-xs font-bold transition flex items-center gap-2"
                              title="Cambiar Estado"
                            >
                              <FaSync size={12} /> <span>Estado</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel lateral ── */}
        {panelOpen && (
          <aside className="w-[340px] flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
              {/* Cabecera del panel */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-800 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <FaUserCheck size={16} />
                  <h3 className="font-bold text-base">
                    {isUpdating ? 'Editar Asignación' : 'Nuevo Empleado'}
                  </h3>
                </div>
                <button onClick={cerrarPanel} className="text-purple-200 hover:text-white transition">
                  <FaTimes />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-5">

                {/* ── Selección de usuario (solo en modo crear) ── */}
                {!isUpdating ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                      👤 Usuario del sistema *
                    </label>
                    {usuariosSinEmpleo.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Todos los usuarios ya tienen ficha de empleado, o los datos no cargaron. Verifica las políticas RLS en Supabase.
                      </p>
                    ) : (
                      <SearchableSelect
                        options={usuariosSinEmpleo.map(u => ({
                          value: u.id_persona,
                          label: `${u.nombreCompleto}${u.email ? ` (${u.email})` : ''}`
                        }))}
                        value={formData.id_persona}
                        onChange={val => setFormData(f => ({ ...f, id_persona: val }))}
                        placeholder="Buscar usuario..."
                      />
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Solo se muestran usuarios que aún no están registrados como empleados.
                    </p>
                  </div>
                ) : (
                  /* Modo edición: mostrar nombre como badge */
                  <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="bg-purple-600 text-white w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm">
                      {editingEmp.nombre.charAt(0)}{editingEmp.apellido.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-purple-900 text-sm">{editingEmp.nombre} {editingEmp.apellido}</p>
                      <p className="text-xs text-purple-500">{editingEmp.email}</p>
                    </div>
                  </div>
                )}

                <hr className="border-dashed border-purple-100" />

                {/* ── Departamento y Cargo ── */}
                <div className="grid grid-cols-1 gap-4">
                  {/* Departamento */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                      🏢 Departamento *
                    </label>
                    <SearchableSelect
                      options={departamentos.map(d => ({ value: d.id_departamento.toString(), label: d.nombre }))}
                      value={formData.departamento_id.toString()}
                      onChange={val => setFormData(f => ({ ...f, departamento_id: val }))}
                      placeholder="Buscar departamento..."
                    />
                  </div>

                  {/* Cargo */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                      🎖️ Cargo Universitario *
                    </label>
                    <SearchableSelect
                      options={cargos.map(c => ({ value: c.id_cargo.toString(), label: `${c.nombre} (Nivel ${c.nivel_privilegio})` }))}
                      value={formData.id_cargo.toString()}
                      onChange={val => setFormData(f => ({ ...f, id_cargo: val }))}
                      placeholder="Buscar cargo..."
                    />
                  </div>
                </div>

                {/* ── Organización (solo lectura / auto) ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                    🌐 Organización
                  </label>
                  {adminOrgNombre ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                      <FaCheck className="text-green-500 flex-shrink-0" size={12} />
                      <span className="text-sm font-semibold text-green-800">{adminOrgNombre}</span>
                      <span className="text-[10px] text-green-500 ml-auto">Automático</span>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      ⚠️ No se detectó organización del administrador. Verifica tu ficha de empleado.
                    </p>
                  )}
                </div>

                {/* ── Botones ── */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cerrarPanel}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-semibold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow transition flex items-center justify-center gap-2"
                  >
                    <FaCheck size={12} />
                    {isUpdating ? 'Actualizar' : 'Asignar como Empleado'}
                  </button>
                </div>
              </form>
            </div>
          </aside>
        )}
      </div>
    </Layout>
  );
}
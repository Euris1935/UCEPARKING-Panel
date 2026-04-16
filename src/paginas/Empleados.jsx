import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaSearch, FaUserTie, FaTrash, FaPlus, FaArrowLeft,
  FaBuilding, FaEdit, FaTimes, FaCheck, FaUserCheck,
  FaSitemap, FaUsers
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

export default function Empleados() {
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Personal', 'crear');
  const canEdit   = tienePermiso('Módulo Personal', 'editar');
  const canDelete = tienePermiso('Módulo Personal', 'eliminar');

  const navigate = useNavigate();

  // ── Datos generales ─────────────────────────────────────────────────────────
  const [empleados,           setEmpleados]           = useState([]);
  const [departamentos,       setDepartamentos]       = useState([]);
  const [usuariosSinEmpleo,   setUsuariosSinEmpleo]   = useState([]); // usuarios no empleados aún
  const [adminOrgId,          setAdminOrgId]          = useState(null);
  const [adminOrgNombre,      setAdminOrgNombre]      = useState('');
  const [searchTerm,          setSearchTerm]          = useState('');
  const [loading,             setLoading]             = useState(false);
  const [currentPersonaId,    setCurrentPersonaId]    = useState(null);

  // ── Panel lateral ───────────────────────────────────────────────────────────
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editingEmp,    setEditingEmp]    = useState(null);
  const [formData,      setFormData]      = useState({ id_persona: '', departamento_id: '' });

  const isUpdating = !!editingEmp;

  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    try {
      // 1. Obtener org del admin activo
      const { data: { user } } = await supabase.auth.getUser();
      let orgId   = null;
      let orgNom  = '';

      if (user) {
        const { data: uRow } = await supabase
          .from('usuario').select('id_persona').eq('id', user.id).single();

        if (uRow?.id_persona) {
          setCurrentPersonaId(uRow.id_persona);
          const { data: empRow } = await supabase
            .from('empleado')
            .select('organizacion_id, organizacion(nombre)')
            .eq('id_persona', uRow.id_persona)
            .maybeSingle();

          orgId  = empRow?.organizacion_id   || null;
          orgNom = empRow?.organizacion?.nombre || '';
        }
      }

      setAdminOrgId(orgId);
      setAdminOrgNombre(orgNom);

      // 2. Catálogos
      const { data: deptData } = await supabase.from('departamento').select('*');
      setDepartamentos(deptData || []);

      // 3. Empleados + datos de persona
      await cargarEmpleados(deptData || []);

    } catch (err) {
      console.error('init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const registrarLog = async (tipo_nombre, descripcion) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Personal').maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id_tipo || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: adminOrgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const cargarEmpleados = async (deptList) => {
    const { data: emps } = await supabase.from('empleado').select('*').order('id_empleado');

    const { data: orgUsers, error: rpcErr } = await supabase.rpc('get_usuarios_org');
    if (rpcErr) console.warn('get_usuarios_org error:', rpcErr.message);
    const todosLosUsuarios = orgUsers || [];

    const lista = (emps || []).map(emp => {
      const uRow  = todosLosUsuarios.find(u => u.id_persona === emp.id_persona);
      const depto = deptList.find(d => d.id_departamento === emp.departamento_id);
      return {
        id_empleado:     emp.id_empleado,
        persona_id:      emp.id_persona,
        departamento_id: emp.departamento_id,
        organizacion_id: emp.organizacion_id,
        nombre:          uRow?.nombre   || 'Sin Nombre',
        apellido:        uRow?.apellido || '',
        email:           uRow?.email    || '',
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

  // ── Abrir panel para crear ──
  const abrirCrear = () => {
    setEditingEmp(null);
    setFormData({ id_persona: '', departamento_id: '' });
    setPanelOpen(true);
  };

  // ── Abrir panel para editar ──
  const abrirEditar = (emp) => {
    setEditingEmp(emp);
    setFormData({
      id_persona:      emp.persona_id,
      departamento_id: emp.departamento_id || '',
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
    const { id_persona, departamento_id } = formData;

    if (!departamento_id) {
      return Swal.fire('Atención', 'Selecciona un departamento.', 'warning');
    }
    if (!isUpdating && !id_persona) {
      return Swal.fire('Atención', 'Selecciona un usuario del sistema.', 'warning');
    }

    try {
      Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

      const payload = {
        departamento_id: parseInt(departamento_id),
        ...(adminOrgId ? { organizacion_id: adminOrgId } : {}),
      };

      if (isUpdating) {
        const { error } = await supabase
          .from('empleado')
          .update(payload)
          .eq('id_empleado', editingEmp.id_empleado);
        if (error) throw error;
        Swal.fire('Actualizado', 'Datos laborales actualizados.', 'success');
      } else {
        const { data: eeActivo } = await supabase.from('estado_empleado').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
        const { error } = await supabase
          .from('empleado')
          .insert([{ id_persona, id_estado: eeActivo?.id_estado || 1, ...payload }]);
        if (error) throw error;
        Swal.fire('¡Asignado!', 'El usuario fue registrado como empleado.', 'success');
      }

      cerrarPanel();
      await cargarEmpleados(departamentos);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message, 'error');
    }
  };

  // ── Eliminar ────────────────────────────────────────────────────────────────
  const handleDelete = async (emp) => {
    const r = await Swal.fire({
      title: '¿Quitar como empleado?',
      html: `<b>${emp.nombre} ${emp.apellido}</b><br><small class="text-gray-500">Se eliminará la ficha laboral. El usuario del sistema no se borra.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase.from('empleado').delete().eq('id_empleado', emp.id_empleado);
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.fire('Eliminado', 'Ficha de empleado eliminada. El usuario del sistema sigue activo.', 'success');
    await cargarEmpleados(departamentos);
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
          {canCreate && (
            <button
              onClick={abrirCrear}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow transition font-semibold"
            >
              <FaPlus /> Agregar Empleado
            </button>
          )}
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
                {canCreate && (
                  <button onClick={abrirCrear} className="mt-4 text-purple-600 text-sm font-semibold hover:underline">
                    + Agregar el primer empleado
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 text-left">Empleado</th>
                      <th className="px-5 py-3 text-left">Contacto</th>
                        <th className="px-5 py-3 text-left">Departamento</th>
                      <th className="px-5 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {filtrados.map(emp => (
                      <tr
                        key={emp.id_empleado}
                        className={`hover:bg-purple-50 transition-all cursor-pointer ${editingEmp?.id_empleado === emp.id_empleado ? 'bg-purple-50 ring-1 ring-inset ring-purple-300' : ''}`}
                        onClick={() => canEdit && abrirEditar(emp)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                              {emp.nombre.charAt(0)}{emp.apellido.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{emp.nombre} {emp.apellido}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-500 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span>{emp.email || '—'}</span>
                            <span>{emp.telefono || ''}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-600 text-xs">
                          <span className="flex items-center gap-1">
                            <FaSitemap size={10} className="text-gray-400" />
                            {emp.nombre_depto}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1.5 justify-center">
                            {canEdit && (
                              <button
                                onClick={() => abrirEditar(emp)}
                                className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                                title="Editar asignación"
                              >
                                <FaEdit size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(emp)}
                                className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition"
                                title="Quitar como empleado"
                              >
                                <FaTrash size={13} />
                              </button>
                            )}
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
                      <select
                        className="w-full border-2 border-purple-200 focus:border-purple-500 rounded-xl p-2.5 text-sm bg-white transition"
                        value={formData.id_persona}
                        onChange={e => setFormData(f => ({ ...f, id_persona: e.target.value }))}
                        required
                      >
                        <option value="">— Seleccionar usuario —</option>
                        {usuariosSinEmpleo.map(u => (
                          <option key={u.id_persona} value={u.id_persona}>
                            {u.nombreCompleto}{u.email ? ` (${u.email})` : ''}
                          </option>
                        ))}
                      </select>
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

                {/* ── Departamento ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">
                    🏢 Departamento *
                  </label>
                  <select
                    className="w-full border-2 border-gray-200 focus:border-purple-400 rounded-xl p-2.5 text-sm bg-white transition"
                    value={formData.departamento_id}
                    onChange={e => setFormData(f => ({ ...f, departamento_id: e.target.value }))}
                    required
                  >
                    <option value="">— Seleccionar departamento —</option>
                    {departamentos.map(d => (
                      <option key={d.id_departamento} value={d.id_departamento}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>
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
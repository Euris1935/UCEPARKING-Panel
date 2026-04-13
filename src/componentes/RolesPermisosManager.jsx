import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import { FaPlus, FaTrash, FaCheck, FaExclamationTriangle, FaShieldAlt, FaLock, FaUnlock } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

export default function RolesPermisosManager() {
  const { reloadRbac } = useRbac();
  const [roles, setRoles] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [permisosDelRol, setPermisosDelRol] = useState([]); // resultado de get_permisos_de_rol
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [selectedRoleName, setSelectedRoleName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPermisos, setLoadingPermisos] = useState(false);
  const [togglingId, setTogglingId] = useState(null); // permiso en proceso de cambio

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const [
        { data: rolesData, error: rolesErr },
        { data: modulosData, error: modulosErr }
      ] = await Promise.all([
        supabase.from('rol').select('*').order('id_rol'),
        supabase.from('modulo').select('*').order('id_modulo')
      ]);

      if (rolesErr) throw rolesErr;
      if (modulosErr) throw modulosErr;

      setRoles(rolesData || []);
      setModulos(modulosData || []);
    } catch (error) {
      console.error('Error cargando roles:', error);
      Swal.fire('Error', 'No se pudieron cargar los roles.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPermisosDeRol = useCallback(async (rolId) => {
    setLoadingPermisos(true);
    try {
      const { data, error } = await supabase.rpc('get_permisos_de_rol', { p_id_rol: rolId });
      if (error) throw error;
      setPermisosDelRol(data || []);
    } catch (error) {
      console.error('Error cargando permisos del rol:', error);
      Swal.fire('Error', 'No se pudieron cargar los permisos del rol.', 'error');
    } finally {
      setLoadingPermisos(false);
    }
  }, []);

  const handleSelectRole = (rol) => {
    setSelectedRoleId(rol.id_rol);
    setSelectedRoleName(rol.nombre);
    loadPermisosDeRol(rol.id_rol);
  };

  const handleTogglePermiso = async (permiso) => {
    if (!selectedRoleId || togglingId === permiso.id_permiso) return;

    setTogglingId(permiso.id_permiso);
    const estaAsignado = permiso.asignado;

    // Actualización optimista en UI
    setPermisosDelRol(prev =>
      prev.map(p => p.id_permiso === permiso.id_permiso ? { ...p, asignado: !estaAsignado } : p)
    );

    try {
      const rpcName = estaAsignado ? 'quitar_permiso' : 'asignar_permiso';
      const { error } = await supabase.rpc(rpcName, {
        p_id_rol: selectedRoleId,
        p_id_permiso: permiso.id_permiso
      });

      if (error) throw error;

      // Recargar RBAC del usuario actual para que tenga efecto inmediato
      reloadRbac();
    } catch (error) {
      // Revertir optimismo si falló
      setPermisosDelRol(prev =>
        prev.map(p => p.id_permiso === permiso.id_permiso ? { ...p, asignado: estaAsignado } : p)
      );
      console.error('Error actualizando permiso:', error);
      Swal.fire('Error', error.message || 'No se pudo actualizar el permiso.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreateRole = async () => {
    const { value: nombreRol } = await Swal.fire({
      title: 'Crear Nuevo Rol',
      input: 'text',
      inputLabel: 'Nombre del Rol',
      inputPlaceholder: 'Ej. Supervisor de Turno',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value?.trim()) return '¡Necesitas escribir un nombre!';
      }
    });

    if (nombreRol?.trim()) {
      try {
        const { data, error } = await supabase
          .from('rol')
          .insert([{ nombre: nombreRol.trim() }])
          .select()
          .single();

        if (error) throw error;
        setRoles(prev => [...prev, data]);
        handleSelectRole(data);
        Swal.fire('Creado', `El rol "${nombreRol.trim()}" ha sido creado sin permisos. Configúralo ahora.`, 'success');
      } catch (error) {
        Swal.fire('Error', 'No se pudo crear el rol: ' + error.message, 'error');
      }
    }
  };

  const handleDeleteRole = async (roleId, roleName) => {
    if (['Administrador', 'Visitante', 'Usuario Regular'].includes(roleName)) {
      return Swal.fire('Bloqueado', 'No puedes eliminar los roles del sistema base.', 'warning');
    }

    const confirm = await Swal.fire({
      title: '¿Eliminar Rol?',
      text: `Se eliminará "${roleName}" y todos sus permisos. Los usuarios asignados podrían perder acceso.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
      try {
        // Primero borrar sus permisos
        await supabase.from('rol_permiso').delete().eq('id_rol', roleId);
        const { error } = await supabase.from('rol').delete().eq('id_rol', roleId);
        if (error) throw error;

        setRoles(prev => prev.filter(r => r.id_rol !== roleId));
        if (selectedRoleId === roleId) {
          setSelectedRoleId(null);
          setSelectedRoleName('');
          setPermisosDelRol([]);
        }
        Swal.fire('Eliminado', 'Rol eliminado correctamente.', 'success');
      } catch (error) {
        Swal.fire('Error al eliminar', error.message, 'error');
      }
    }
  };

  // Agrupar permisos de manera robusta
  const permisosAgrupadosPorModulo = [];
  const groupsObj = {};

  permisosDelRol.forEach(p => {
    // Buscar la propiedad correcta del nombre del módulo (puede venir como nombre_modulo, modulo, o extraemos de la ruta)
    let modName = p.nombre_modulo || p.modulo;
    if (!modName && p.ruta) {
      modName = p.ruta.replace('/', '');
    }
    modName = modName || 'Global';

    if (!groupsObj[modName]) {
      groupsObj[modName] = [];
    }
    groupsObj[modName].push(p);
  });

  // Convertir a array y ordenar alfabeticamente
  for (const [modName, perms] of Object.entries(groupsObj)) {
    permisosAgrupadosPorModulo.push({ modulo: { nombre: modName }, permisos: perms });
  }
  permisosAgrupadosPorModulo.sort((a, b) => a.modulo.nombre.localeCompare(b.modulo.nombre));

  const totalAsignados = permisosDelRol.filter(p => p.asignado).length;
  const totalDisponibles = permisosDelRol.length;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4" />
      <p className="font-medium">Cargando esquema de seguridad...</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[500px]">
      {/* ─── Panel izquierdo: Lista de Roles ─── */}
      <div className="md:col-span-1 bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <FaShieldAlt className="text-green-600" /> Roles
          </h3>
          <button
            onClick={handleCreateRole}
            className="p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition"
            title="Crear Rol"
          >
            <FaPlus size={12} />
          </button>
        </div>

        <div className="space-y-2 flex-grow overflow-y-auto">
          {roles.map(r => (
            <div
              key={r.id_rol}
              onClick={() => handleSelectRole(r)}
              className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-all border ${
                selectedRoleId === r.id_rol
                  ? 'bg-green-600 text-white border-green-700 shadow-md'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              <span className="font-medium truncate pr-2 text-sm">{r.nombre}</span>
              {selectedRoleId === r.id_rol && !['Administrador', 'Visitante'].includes(r.nombre) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id_rol, r.nombre); }}
                  className="text-red-300 hover:text-red-100 transition shrink-0"
                  title="Eliminar Rol"
                >
                  <FaTrash size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Panel derecho: Matriz de Permisos ─── */}
      <div className="md:col-span-3 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {!selectedRoleId ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-300 py-16">
            <FaCheck className="text-5xl mb-4" />
            <p className="text-gray-400 font-medium">Selecciona un Rol para configurar sus accesos</p>
            <p className="text-gray-300 text-sm mt-1">Los cambios se aplican de forma inmediata</p>
          </div>
        ) : (
          <div>
            {/* Cabecera del rol seleccionado */}
            <div className="mb-6 pb-4 border-b border-gray-100 flex justify-between items-start gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Permisos de: <span className="text-green-600">{selectedRoleName}</span>
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Los cambios se guardan automáticamente al activar/desactivar cada permiso.
                </p>
              </div>
              {!loadingPermisos && (
                <div className="shrink-0 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
                  <span className="text-2xl font-black text-green-700">{totalAsignados}</span>
                  <span className="text-green-500 text-sm font-medium">/{totalDisponibles}</span>
                  <p className="text-xs text-green-600 font-medium">activos</p>
                </div>
              )}
            </div>

            {/* Advertencia para Administrador */}
            {selectedRoleName === 'Administrador' && (
              <div className="mb-5 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg flex items-start gap-2 border border-amber-200">
                <FaExclamationTriangle className="mt-0.5 shrink-0 text-amber-500" />
                <p><strong>Cuidado:</strong> Estás editando el Rol de Administrador. Quitar módulos críticos podría bloquearte el acceso al sistema.</p>
              </div>
            )}

            {loadingPermisos ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mr-3" />
                <span>Cargando permisos...</span>
              </div>
            ) : permisosAgrupadosPorModulo.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>Este rol no tiene permisos disponibles para configurar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {permisosAgrupadosPorModulo.map(({ modulo, permisos }) => (
                  <div key={modulo.nombre} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                      <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider">{modulo.nombre}</h4>
                    </div>
                    <div className="p-4 space-y-3">
                      {permisos.map(permiso => {
                        const isToggling = togglingId === permiso.id_permiso;
                        return (
                          <label
                            key={permiso.id_permiso}
                            className={`flex items-center gap-3 cursor-pointer group transition-opacity ${isToggling ? 'opacity-60' : ''}`}
                            onClick={(e) => { e.preventDefault(); handleTogglePermiso(permiso); }}
                          >
                            <div className={`relative w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                              permiso.asignado
                                ? 'bg-green-500 border-green-500'
                                : 'bg-white border-gray-300 group-hover:border-green-400'
                            }`}>
                              {isToggling ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : permiso.asignado ? (
                                <FaCheck className="text-white" size={10} />
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {permiso.asignado
                                ? <FaUnlock size={10} className="text-green-500 shrink-0" />
                                : <FaLock size={10} className="text-gray-300 shrink-0 group-hover:text-gray-400" />
                              }
                              <span className={`text-sm capitalize transition-colors truncate ${
                                permiso.asignado ? 'text-gray-900 font-semibold' : 'text-gray-400 group-hover:text-gray-600'
                              }`}>
                                {permiso.accion}
                                {permiso.ruta && <span className="text-xs text-gray-300 ml-1 font-normal non-capitalize">· {permiso.ruta}</span>}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

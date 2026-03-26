import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Swal from 'sweetalert2';
import { FaPlus, FaTrash, FaCheck, FaExclamationTriangle, FaSave } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

export default function RolesPermisosManager() {
  const { reloadRbac } = useRbac();
  const [roles, setRoles] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [permisosGlobales, setPermisosGlobales] = useState([]);
  
  const [initialRolesPermisos, setInitialRolesPermisos] = useState([]);
  const [rolesPermisos, setRolesPermisos] = useState([]);
  const [savingSync, setSavingSync] = useState(false);
  
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // 1. Cargar Roles
      const { data: rolesData, error: rolesErr } = await supabase.from('roles').select('*').order('Id_Rol');
      if (rolesErr) throw rolesErr;
      setRoles(rolesData || []);

      // 2. Cargar Módulos
      const { data: modulosData, error: modulosErr } = await supabase.from('modulos').select('*').order('orden');
      if (modulosErr) throw modulosErr;
      setModulos(modulosData || []);

      // 3. Cargar Permisos base disponibles en el sistema
      const { data: permisosData, error: permisosErr } = await supabase.from('permisos').select('*');
      if (permisosErr) throw permisosErr;
      setPermisosGlobales(permisosData || []);

      // 4. Cargar la relación Roles -> Permisos
      const { data: rpData, error: rpErr } = await supabase.from('roles_permisos').select('*');
      if (rpErr) throw rpErr;
      setRolesPermisos(rpData || []);
      setInitialRolesPermisos(rpData || []);

    } catch (error) {
      console.error("Error cargando RBAC:", error);
      Swal.fire("Error", "No se pudieron cargar los roles y permisos.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async () => {
    const { value: nombreRol } = await Swal.fire({
      title: 'Crear Nuevo Rol',
      input: 'text',
      inputLabel: 'Nombre del Rol',
      inputPlaceholder: 'Ej. Administrador Secundario',
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) return '¡Necesitas escribir un nombre!';
      }
    });

    if (nombreRol) {
      try {
        const { data, error } = await supabase
          .from('roles')
          .insert([{ Nombre_Rol: nombreRol }])
          .select()
          .single();

        if (error) throw error;
        setRoles([...roles, data]);
        setSelectedRoleId(data.Id_Rol);
        Swal.fire('Creado', 'El rol ha sido creado', 'success');
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
      text: `Se eliminará el rol "${roleName}". Los usuarios con este rol podrían perder acceso.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar'
    });

    if (confirm.isConfirmed) {
      try {
        // Primero borrar sus permisos
        await supabase.from('roles_permisos').delete().eq('id_rol', roleId);
        // Borrar rol
        const { error } = await supabase.from('roles').delete().eq('Id_Rol', roleId);
        if (error) throw error;

        setRoles(roles.filter(r => r.Id_Rol !== roleId));
        if (selectedRoleId === roleId) setSelectedRoleId(null);
        Swal.fire('Eliminado', 'Rol eliminado correctamente.', 'success');
      } catch (error) {
        Swal.fire('Error al eliminar', error.message, 'error');
      }
    }
  };

  const togglePermission = (permisoId, accionado) => {
    if (!selectedRoleId) return;
    
    if (accionado) {
      setRolesPermisos([...rolesPermisos, { id_rol: selectedRoleId, id_permiso: permisoId }]);
    } else {
      setRolesPermisos(rolesPermisos.filter(rp => !(rp.id_rol === selectedRoleId && rp.id_permiso === permisoId)));
    }
  };

  const savePermissions = async () => {
    setSavingSync(true);
    try {
      const toDelete = initialRolesPermisos.filter(i => !rolesPermisos.some(c => c.id_rol === i.id_rol && c.id_permiso === i.id_permiso));
      const toInsert = rolesPermisos.filter(c => !initialRolesPermisos.some(i => i.id_rol === c.id_rol && i.id_permiso === c.id_permiso));
      
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map(d => 
          supabase.from('roles_permisos').delete().match({ id_rol: d.id_rol, id_permiso: d.id_permiso })
        ));
      }
      
      if (toInsert.length > 0) {
        await supabase.from('roles_permisos').insert(toInsert);
      }
      
      setInitialRolesPermisos([...rolesPermisos]);
      reloadRbac();
      Swal.fire('Guardado', 'Todos los permisos han sido actualizados en la base de datos y se encuentran vigentes.', 'success');
    } catch (error) {
       Swal.fire('Error', 'No se pudieron guardar los cambios: ' + error.message, 'error');
    } finally {
       setSavingSync(false);
    }
  };

  const hasUnsavedChanges = initialRolesPermisos.length !== rolesPermisos.length || 
        initialRolesPermisos.some(i => !rolesPermisos.some(c => c.id_rol === i.id_rol && c.id_permiso === i.id_permiso)) ||
        rolesPermisos.some(c => !initialRolesPermisos.some(i => i.id_rol === c.id_rol && i.id_permiso === c.id_permiso));

  if (loading) return <div className="text-center py-10 text-gray-500 font-medium">Cargando esquema de seguridad...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[500px]">
      {/* Panel Izquierdo: Lista de Roles */}
      <div className="md:col-span-1 bg-gray-50 border rounded-lg p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-700">Roles</h3>
          <button onClick={handleCreateRole} className="p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition" title="Crear Rol">
            <FaPlus />
          </button>
        </div>
        
        <div className="space-y-2 flex-grow overflow-y-auto">
          {roles.map(r => (
            <div 
              key={r.Id_Rol}
              onClick={() => setSelectedRoleId(r.Id_Rol)}
              className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors border ${selectedRoleId === r.Id_Rol ? 'bg-green-600 text-white border-green-700 shadow-md' : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'}`}
            >
              <span className="font-medium truncate pr-2">{r.Nombre_Rol}</span>
              {selectedRoleId === r.Id_Rol && !['Administrador', 'Visitante'].includes(r.Nombre_Rol) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.Id_Rol, r.Nombre_Rol); }}
                  className="text-red-300 hover:text-red-100 transition"
                  title="Eliminar Rol"
                >
                  <FaTrash size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Panel Derecho: Matriz de Permisos */}
      <div className="md:col-span-3 bg-white border rounded-lg p-6 shadow-sm">
        {!selectedRoleId ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <FaCheck className="text-4xl mb-3 text-gray-200" />
            <p>Selecciona un Rol a la izquierda para configurar sus accesos</p>
          </div>
        ) : (
          <div>
            <div className="mb-6 pb-4 border-b flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">
                  Permisos del Rol: <span className="text-green-600">{roles.find(r => r.Id_Rol === selectedRoleId)?.Nombre_Rol}</span>
                </h3>
                <p className="text-sm text-gray-500 mt-1">Activa o desactiva las capacidades que tendrán los usuarios asignados a este perfil.</p>
              </div>
              
              {hasUnsavedChanges && (
                <button 
                  onClick={savePermissions}
                  disabled={savingSync}
                  className="bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-bold flex items-center gap-2 transition animate-bounce-short"
                >
                  <FaSave /> {savingSync ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              )}
            </div>

              {roles.find(r => r.Id_Rol === selectedRoleId)?.Nombre_Rol === 'Administrador' && (
                <div className="mt-3 p-3 bg-yellow-50 text-yellow-800 text-sm rounded-md flex items-start gap-2 border border-yellow-200">
                  <FaExclamationTriangle className="mt-0.5 shrink-0" />
                  <p><strong>Cuidado:</strong> Estás editando el Rol de Administrador. Quitar módulos críticos de este rol podría bloquearte el acceso al propio sistema.</p>
                </div>
              )}

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
              {modulos.filter(m => m.activo).map(modulo => {
                const permisosModulo = permisosGlobales.filter(p => p.id_modulo === modulo.id_modulo);
                
                if (permisosModulo.length === 0) return null; // No renderizar módulos sin permisos registrados

                return (
                  <div key={modulo.id_modulo} className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                    <div className="bg-gray-200 px-4 py-2 border-b border-gray-300">
                      <h4 className="font-bold text-gray-800 capitalize text-sm">{modulo.nombre}</h4>
                    </div>
                    <div className="p-4 space-y-3">
                      {permisosModulo.map(permiso => {
                        const hasPermission = rolesPermisos.some(rp => rp.id_rol === selectedRoleId && rp.id_permiso === permiso.id_permiso);
                        return (
                          <label key={permiso.id_permiso} className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                              <input 
                                type="checkbox" 
                                className="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500 transition-colors cursor-pointer"
                                checked={hasPermission}
                                onChange={(e) => togglePermission(permiso.id_permiso, e.target.checked)}
                              />
                            </div>
                            <span className={`text-sm capitalize transition-colors ${hasPermission ? 'text-gray-900 font-medium' : 'text-gray-500 group-hover:text-gray-700'}`}>
                              {permiso.accion}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

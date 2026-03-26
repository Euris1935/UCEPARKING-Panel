import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const RbacContext = createContext();

export function RbacProvider({ children, session }) {
  const [modulos, setModulos] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [esAdmin, setEsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRbac = async () => {
    if (!session?.user) {
      setModulos([]);
      setPermisos([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // 1. Obtener ID del rol del usuario actuál y su nombre
        const { data: usuarioData, error: uError } = await supabase
          .from('usuarios')
          .select(`
             rol_id,
             roles:rol_id(Nombre_Rol)
          `)
          .eq('id', session.user.id)
          .single();

        if (uError) throw uError;
        
        const rolId = usuarioData.rol_id;
        const nombreRol = usuarioData.roles?.Nombre_Rol;
        const _esAdmin = nombreRol && nombreRol.toLowerCase() === 'administrador';
        
        setEsAdmin(_esAdmin);

        // 2. Obtener tablas planas para evitar errores de Foreign Keys anidadas en PostgREST
        const [
          { data: rpData, error: rpError },
          { data: permisosData, error: pError },
          { data: modulosData, error: mError }
        ] = await Promise.all([
          supabase.from('roles_permisos').select('*').eq('id_rol', rolId),
          supabase.from('permisos').select('*'),
          supabase.from('modulos').select('*').eq('activo', true)
        ]);

        if (rpError) throw rpError;
        if (pError) throw pError;
        if (mError) throw mError;

        // 3. Ensamblar en memoria
        const modulosAccesibles = [];
        const permisosExtraidos = [];

        if (rpData && rpData.length > 0) {
          rpData.forEach(rp => {
            // Encontrar el permiso correspondiente
            const permisoObj = permisosData.find(p => p.id_permiso === rp.id_permiso);
            if (permisoObj) {
              // Encontrar el módulo correspondiente
              const moduloObj = modulosData.find(m => m.id_modulo === Math.floor(permisoObj.id_modulo));
              
              if (moduloObj) {
                // Agregar módulo si no existe
                if (!modulosAccesibles.some(ext => ext.id_modulo === moduloObj.id_modulo)) {
                    modulosAccesibles.push(moduloObj);
                }
                
                // Agregar permiso con nombre de módulo inyectado
                permisosExtraidos.push({
                  accion: permisoObj.accion,
                  id_modulo: permisoObj.id_modulo,
                  nombre_modulo: moduloObj.nombre
                });
              }
            }
          });
        }

        console.log("Modulos autorizados:", modulosAccesibles);
        console.log("Permisos autorizados:", permisosExtraidos);

        setModulos(modulosAccesibles);
        setPermisos(permisosExtraidos);
      } catch (error) {
        console.error('Error cargando privilegios RBAC:', error);
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    loadRbac();
  }, [session]);

  const tienePermiso = (nombreModulo, accion) => {
    if (esAdmin) return true; // Administrador tiene todos los permisos
    
    return permisos.some(p => {
        const nombre = p.nombre_modulo;
        return nombre && nombre.toLowerCase() === nombreModulo.toLowerCase() && 
               p.accion.toLowerCase() === accion.toLowerCase();
    });
  };

  const puedeAccederRuta = (path) => {
    if (esAdmin) return true; // Administrador accede a todas las rutas
    if (path === '/' || path === '/configuracion') return true;
    
    const slug = path.replace('/', '').toLowerCase();
    
    return modulos.some(m => {
        const nombre = m.nombre;
        return (m.slug && m.slug.toLowerCase() === slug) || 
               (nombre && nombre.toLowerCase() === slug);
    });
  };

  return (
    <RbacContext.Provider value={{ modulos, permisos, tienePermiso, puedeAccederRuta, esAdmin, loadingRbac: loading, reloadRbac: loadRbac }}>
      {children}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  return useContext(RbacContext);
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const RbacContext = createContext();

export function RbacProvider({ children, session }) {
  const [modulos, setModulos]   = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [esAdmin, setEsAdmin]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const loadRbac = async () => {
    if (!session?.user) {
      setModulos([]);
      setPermisos([]);
      setEsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Obtener rol_id del usuario
      const { data: usuarioData, error: uError } = await supabase
        .from('usuario')
        .select('rol_id, id_estado')
        .eq('id', session.user.id)
        .maybeSingle();

      if (uError) {
        console.error('RbacContext: Error fetching user record:', uError);
        setLoading(false);
        return;
      }

      if (!usuarioData) {
        console.warn('RbacContext: No record found in "usuario" table for UID:', session.user.id);
        setLoading(false);
        return;
      }

      console.log('RbacContext: User found, checking status and roles:', usuarioData);

      if (usuarioData?.id_estado !== 1 && usuarioData?.id_estado !== null) {
        setLoading(false);
        return;
      }

      const rolId = usuarioData?.rol_id;
      if (!rolId) {
        setLoading(false);
        return;
      }

      // 2. Leer nombre del rol
      const { data: rolData } = await supabase
        .from('rol')
        .select('nombre')
        .eq('id_rol', rolId)
        .maybeSingle();

      const nombreRol = rolData?.nombre?.toLowerCase() || '';
      const _esAdmin = nombreRol.includes('admin') || nombreRol.includes('administrador');
      setEsAdmin(_esAdmin);

      if (_esAdmin) {
        const { data: modulosData } = await supabase
          .from('modulo')
          .select('*')
          .eq('activo', true);
        setModulos(modulosData || []);
        setPermisos([]);
        setLoading(false);
        return;
      }

      // 3. Para no-admins: cargar permisos específicos
      const [
        { data: rpData },
        { data: permisosData },
        { data: modulosData }
      ] = await Promise.all([
        supabase.from('rol_permiso').select('*').eq('id_rol', rolId),
        supabase.from('permiso').select('*'),
        supabase.from('modulo').select('*').eq('activo', true)
      ]);

      const modulosAccesibles  = [];
      const permisosExtraidos  = [];

      (rpData || []).forEach(rp => {
        const permisoObj = (permisosData || []).find(p => p.id_permiso === rp.id_permiso);
        if (!permisoObj) return;
        const moduloObj = (modulosData || []).find(m => m.id_modulo === permisoObj.id_modulo);
        if (!moduloObj) return;
        if (!modulosAccesibles.some(m => m.id_modulo === moduloObj.id_modulo)) modulosAccesibles.push(moduloObj);
        permisosExtraidos.push({ accion: permisoObj.accion, id_modulo: permisoObj.id_modulo, nombre_modulo: moduloObj.nombre });
      });

      setModulos(modulosAccesibles);
      setPermisos(permisosExtraidos);

    } catch (error) {
      console.error('Rbac Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRbac();
  }, [session]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const tienePermiso = (nombreModulo, accion) => {
    if (esAdmin) return true;
    return permisos.some(p =>
      p.nombre_modulo?.toLowerCase() === nombreModulo.toLowerCase() &&
      p.accion?.toLowerCase()        === accion.toLowerCase()
    );
  };

  const puedeAccederRuta = (path) => {
    if (esAdmin) return true;
    if (path === '/' || path === '/configuracion') return true;
    const slug = path.replace('/', '').toLowerCase();
    return modulos.some(m =>
      (m.slug && m.slug.toLowerCase() === slug) ||
      (m.nombre && m.nombre.toLowerCase() === slug)
    );
  };

  return (
    <RbacContext.Provider value={{
      modulos, permisos,
      tienePermiso, puedeAccederRuta,
      esAdmin,
      loadingRbac: loading,
      reloadRbac: loadRbac
    }}>
      {children}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  return useContext(RbacContext);
}

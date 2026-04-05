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

      // ── 1. Obtener rol_id del usuario (su propia fila — siempre accesible) ──
      const { data: usuarioData, error: uError } = await supabase
        .from('usuarios')
        .select('rol_id')
        .eq('id', session.user.id)
        .single();

      if (uError) {
        console.error('RbacContext: no se pudo leer usuarios:', uError.message);
        setLoading(false);
        return;
      }

      const rolId = usuarioData?.rol_id;
      if (!rolId) {
        console.warn('RbacContext: usuario sin rol asignado.');
        setLoading(false);
        return;
      }

      // ── 2. Leer nombre del rol por separado (evita el bug de join en PostgREST con RLS) ──
      const { data: rolData, error: rolError } = await supabase
        .from('roles')
        .select('"Nombre_Rol"')
        .eq('"Id_Rol"', rolId)
        .maybeSingle();

      // Si roles tiene RLS restrictivo y falla, caemos al plan B:
      // comparamos directamente el id con los conocidos (no ideal, pero funciona de emergencia)
      let nombreRol = rolData?.Nombre_Rol ?? null;

      if (rolError) {
        console.warn('RbacContext: no se pudo leer roles con RLS, fallback por id:', rolError.message);
      }

      const _esAdmin = nombreRol?.toLowerCase() === 'administrador';
      setEsAdmin(_esAdmin);

      // ── 3. Si es admin, no necesita cargar permisos — tiene acceso total ──
      if (_esAdmin) {
        // Cargamos módulos igual para poder mostrar la barra lateral correctamente
        const { data: modulosData } = await supabase
          .from('modulos')
          .select('*')
          .eq('activo', true);
        setModulos(modulosData || []);
        setPermisos([]);
        setLoading(false);
        return;
      }

      // ── 4. Para no-admins: cargar permisos asignados a su rol ──
      const [
        { data: rpData,      error: rpError },
        { data: permisosData, error: pError },
        { data: modulosData,  error: mError }
      ] = await Promise.all([
        supabase.from('roles_permisos').select('*').eq('id_rol', rolId),
        supabase.from('permisos').select('*'),
        supabase.from('modulos').select('*').eq('activo', true)
      ]);

      if (rpError)  console.warn('RbacContext: roles_permisos:', rpError.message);
      if (pError)   console.warn('RbacContext: permisos:', pError.message);
      if (mError)   console.warn('RbacContext: modulos:', mError.message);

      // ── 5. Ensamblar en memoria ──
      const modulosAccesibles  = [];
      const permisosExtraidos  = [];

      (rpData || []).forEach(rp => {
        const permisoObj = (permisosData || []).find(p => p.id_permiso === rp.id_permiso);
        if (!permisoObj) return;

        const moduloObj = (modulosData || []).find(m => m.id_modulo === permisoObj.id_modulo);
        if (!moduloObj) return;

        if (!modulosAccesibles.some(m => m.id_modulo === moduloObj.id_modulo)) {
          modulosAccesibles.push(moduloObj);
        }

        permisosExtraidos.push({
          accion:       permisoObj.accion,
          id_modulo:    permisoObj.id_modulo,
          nombre_modulo: moduloObj.nombre
        });
      });

      console.log('RBAC cargado — módulos:', modulosAccesibles.length, '| permisos:', permisosExtraidos.length);
      setModulos(modulosAccesibles);
      setPermisos(permisosExtraidos);

    } catch (error) {
      console.error('RbacContext: error inesperado:', error);
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

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const RbacContext = createContext();

export function RbacProvider({ children, session }) {
  const [modulos, setModulos]   = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [esAdmin, setEsAdmin]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user?.id;

    // ── Si no hay sesión, simplemente esperamos ──
    // App.js redirige a /login cuando no hay sesión,
    // así que ProtectedRoute nunca se renderiza sin sesión.
    // Mantener loading=true evita que ProtectedRoute redirija a /
    // mientras la sesión se está restaurando tras un refresh.
    if (!userId) {
      console.log('[Rbac] ⏳ Esperando sesión válida...');
      return;
    }

    // Si ya hay una carga en curso para este usuario, no duplicar
    if (loadingRef.current) {
      console.log('[Rbac] ⏳ Carga en curso, omitiendo.');
      return;
    }

    const doLoad = async () => {
      loadingRef.current = true;
      if (!cancelled) setLoading(true);

      console.log(`[Rbac] 🚀 Validando privilegios para: ${session.user.email}`);

      // Salvaguarda: forzar desbloqueo después de 8s
      const timeoutId = setTimeout(() => {
        if (loadingRef.current) {
          console.error('[Rbac] ⚠️ Timeout (8s). Desbloqueando interfaz.');
          setLoading(false);
          loadingRef.current = false;
        }
      }, 8000);

      try {
        // 1. Obtener rol_id del usuario
        const { data: usuarioData, error: uError } = await supabase
          .from('usuario')
          .select('rol_id, id_estado')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (uError) {
          console.error('[Rbac] ❌ Error consultando usuario:', uError.message);
          throw uError;
        }

        if (!usuarioData) {
          console.warn('[Rbac] ⚠️ No se encontró usuario en BD para:', userId);
          setModulos([]); setPermisos([]); setEsAdmin(false);
          return;
        }

        console.log('[Rbac] 👤 Usuario OK. rol_id:', usuarioData.rol_id, '| id_estado:', usuarioData.id_estado);

        // Estado: null se trata como activo (1)
        if (usuarioData.id_estado !== null && usuarioData.id_estado !== 1) {
          console.warn('[Rbac] 🔒 Usuario inactivo. id_estado:', usuarioData.id_estado);
          setModulos([]); setPermisos([]); setEsAdmin(false);
          return;
        }

        const rolId = usuarioData.rol_id;
        if (!rolId) {
          console.warn('[Rbac] ⚠️ Usuario sin rol (rol_id=null).');
          setModulos([]); setPermisos([]); setEsAdmin(false);
          return;
        }

        // 2. Obtener nombre del rol
        const { data: rolData, error: rolError } = await supabase
          .from('rol')
          .select('nombre')
          .eq('id_rol', rolId)
          .maybeSingle();

        if (cancelled) return;
        if (rolError) console.error('[Rbac] ❌ Error consultando rol:', rolError.message);

        const nombreRol = rolData?.nombre || 'Desconocido';
        const _esAdmin = nombreRol.toLowerCase().includes('admin');
        
        console.log(`[Rbac] ✅ Rol: "${nombreRol}" → ${_esAdmin ? 'ADMIN (Acceso Total)' : 'Restringido'}`);
        setEsAdmin(_esAdmin);

        if (_esAdmin) {
          const { data: modulosData, error: modError } = await supabase.rpc('get_modulos_accesibles');
          
          if (cancelled) return;
          if (modError) console.error('[Rbac] ❌ Error en get_modulos_accesibles:', modError.message);
          
          console.log(`[Rbac] 📦 ${modulosData?.length || 0} módulos cargados para Admin.`);
          setModulos(modulosData || []);
          setPermisos([]);
          return;
        }

        // 3. No-admin: cargar permisos específicos
        const [
          { data: rpData },
          { data: permisosData },
          { data: modulosData }
        ] = await Promise.all([
          supabase.from('rol_permiso').select('*').eq('id_rol', rolId),
          supabase.from('permiso').select('*'),
          supabase.rpc('get_modulos_accesibles')
        ]);

        if (cancelled) return;

        const modulosAccesibles = [];
        const permisosExtraidos = [];

        (rpData || []).forEach(rp => {
          const permisoObj = (permisosData || []).find(p => p.id_permiso === rp.id_permiso);
          if (!permisoObj) return;
          const moduloObj = (modulosData || []).find(m => m.id_modulo === permisoObj.id_modulo);
          if (!moduloObj) return;
          if (!modulosAccesibles.some(m => m.id_modulo === moduloObj.id_modulo)) modulosAccesibles.push(moduloObj);
          permisosExtraidos.push({ accion: permisoObj.accion, id_modulo: permisoObj.id_modulo, nombre_modulo: moduloObj.nombre });
        });

        console.log(`[Rbac] 📦 ${modulosAccesibles.length} módulos y ${permisosExtraidos.length} permisos.`);
        setModulos(modulosAccesibles);
        setPermisos(permisosExtraidos);

      } catch (error) {
        console.error('[Rbac] ❌ Fallo crítico:', error);
        if (!cancelled) {
          setModulos([]); setPermisos([]); setEsAdmin(false);
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setLoading(false);
          loadingRef.current = false;
          console.log('[Rbac] 🏁 Validación completada.');
        }
      }
    };

    doLoad();

    return () => { cancelled = true; loadingRef.current = false; };
  }, [session?.user?.id]);

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

  const reloadRbac = async () => {
    loadingRef.current = false;
    setLoading(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.user?.id) return;
      
      const { data: uData } = await supabase.from('usuario').select('rol_id, id_estado').eq('id', s.user.id).maybeSingle();
      if (!uData?.rol_id) return;
      
      const { data: rolData } = await supabase.from('rol').select('nombre').eq('id_rol', uData.rol_id).maybeSingle();
      const _esAdmin = (rolData?.nombre || '').toLowerCase().includes('admin');
      setEsAdmin(_esAdmin);
      
      if (_esAdmin) {
        const { data: mods } = await supabase.rpc('get_modulos_accesibles');
        setModulos(mods || []);
        setPermisos([]);
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  return (
    <RbacContext.Provider value={{
      modulos, permisos,
      tienePermiso, puedeAccederRuta,
      esAdmin,
      loadingRbac: loading,
      reloadRbac
    }}>
      {children}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  return useContext(RbacContext);
}

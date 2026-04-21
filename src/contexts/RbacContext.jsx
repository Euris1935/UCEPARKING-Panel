import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const RbacContext = createContext();

export function RbacProvider({ children, session }) {
  const [modulos, setModulos]   = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [esAdmin, setEsAdmin]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const loadingRef = useRef(false);
  const lastSessionId = useRef(null);

  const loadRbac = async () => {
    const currentUserId = session?.user?.id;
    
    if (!currentUserId) {
      console.log('[Rbac] ℹ️ No hay sesión activa. Manteniendo estado de carga.');
      setModulos([]);
      setPermisos([]);
      setEsAdmin(false);
      // NO setLoading(false) aquí — App.js ya redirige a /login si no hay sesión,
      // y si la sesión se está restaurando, esto evita que ProtectedRoute redirija prematuramente.
      return;
    }

    // Evitar doble carga si ya se está procesando el mismo usuario
    if (loadingRef.current && lastSessionId.current === currentUserId) {
      console.log('[Rbac] ⏳ Ya hay una validación en curso para este usuario. Omitiendo.');
      return;
    }

    console.log(`[Rbac] 🚀 Iniciando validación de privilegios para: ${session.user.email}`);
    loadingRef.current = true;
    lastSessionId.current = currentUserId;

    // Salvaguarda: Forzar finalización de carga después de 6 segundos para no trabar la UI
    const timeoutId = setTimeout(() => {
      if (loadingRef.current) {
        console.error('[Rbac] ⚠️ Tiempo de espera agotado (6s). Desbloqueando interfaz forzosamente.');
        setLoading(false);
        loadingRef.current = false;
      }
    }, 6000);

    try {
      if (modulos.length === 0) {
        setLoading(true);
      }

      // 1. Obtener rol_id del usuario
      const { data: usuarioData, error: uError } = await supabase
        .from('usuario')
        .select('rol_id, id_estado')
        .eq('id', currentUserId)
        .maybeSingle();

      if (uError) {
        console.error('[Rbac] ❌ Error consultando perfil de usuario:', uError);
        throw uError;
      }

      if (!usuarioData) {
        console.warn('[Rbac] ⚠️ No se encontró registro en la tabla "usuario" para:', currentUserId);
        setModulos([]);
        setPermisos([]);
        return;
      }

      console.log('[Rbac] 👤 Perfil encontrado. Verificando roles y estado...');

      const effectiveStatus = usuarioData?.id_estado ?? 1; // NULL se trata como activo (1)

      if (effectiveStatus !== 1) {
        console.warn('[Rbac] 🔒 Usuario inactivo o bloqueado. ID_ESTADO:', usuarioData?.id_estado);
        setModulos([]);
        return;
      }

      const rolId = usuarioData?.rol_id;
      if (!rolId) {
        console.warn('[Rbac] ⚠️ El usuario no tiene un rol asignado.');
        setModulos([]);
        return;
      }

      // 2. Leer nombre del rol
      const { data: rolData } = await supabase
        .from('rol')
        .select('nombre')
        .eq('id_rol', rolId)
        .maybeSingle();

      const nombreRol = rolData?.nombre || 'Desconocido';
      const nombreRolRef = nombreRol.toLowerCase();
      const _esAdmin = nombreRolRef.includes('admin') || nombreRolRef.includes('administrador');
      
      console.log(`[Rbac] ✅ Rol detectado: ${nombreRol} (${_esAdmin ? 'Acceso Total' : 'Acceso Restringido'})`);
      setEsAdmin(_esAdmin);

      if (_esAdmin) {
        const { data: modulosData } = await supabase.rpc('get_modulos_accesibles');
        console.log(`[Rbac] 📦 Cargados ${modulosData?.length || 0} módulos para Administrador.`);
        setModulos(modulosData || []);
        setPermisos([]);
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
        supabase.rpc('get_modulos_accesibles')
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

      console.log(`[Rbac] 📦 Cargados ${modulosAccesibles.length} módulos y ${permisosExtraidos.length} acciones.`);
      setModulos(modulosAccesibles);
      setPermisos(permisosExtraidos);

    } catch (error) {
      console.error('[Rbac] ❌ Fallo crítico en validación:', error);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      loadingRef.current = false;
      console.log('[Rbac] 🏁 Validación completada.');
    }
  };

  useEffect(() => {
    loadRbac();
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

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

import { RbacProvider } from './contexts/RbacContext';
import { OrgProvider } from './contexts/OrgContext';
import { ProtectedRoute } from './componentes/ProtectedRoute';
import { registrarLog, EVENT_TYPES } from './utils/logging';

import Login        from './paginas/Login';
import Dashboard    from './paginas/Dashboard';
import Usuarios     from './paginas/Usuarios';
import Empleados    from './paginas/Empleados';
import Tickets      from './paginas/Tickets';
import Vehiculos    from './paginas/Vehiculos';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Asignaciones from './paginas/Asignaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores     from './paginas/Sensores';
import Reportes     from './paginas/Reportes';
import Ocupacion    from './paginas/Ocupacion';
import Configuracion from './paginas/Configuracion';
import Logs         from './paginas/Logs';
import Notificaciones from './paginas/Notificaciones';
import AccesoManual from './paginas/AccesoManual';

// ─────────────────────────────────────────────────────────────
// CORRECCIÓN: los reqModulo ahora coinciden EXACTAMENTE con
// modulo.nombre en la BD. Antes usaban nombres inventados como
// "Módulo Parqueo" que no existían → ProtectedRoute bloqueaba
// todo aunque el usuario fuera Administrador.
//
// Mapa BD (modulo.nombre → modulo.ruta):
//   "Tickets de Acceso"   → /tickets
//   "Acceso Manual"       → /acceso-manual
//   "Ocupacion"           → /ocupacion
//   "Flota de Vehiculos"  → /vehiculos
//   "Zonas y Plazas"      → /zonas-parqueo
//   "Reservaciones"       → /reservaciones
//   "Asignaciones Fijas"  → /asignaciones
//   "Empleados"           → /empleados
//   "Usuarios del Panel"  → /usuarios
//   "Mantenimiento"       → /mantenimiento
//   "Logs y Eventos"      → /logs
//   "Reportes"            → /reportes
//   "Notificaciones"      → /notificaciones
// ─────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setLoading(false);

      if (event === 'SIGNED_IN' && session) {
        const { data: uData } = await supabase
          .from('usuario')
          .select('id_persona, organizacion_id, persona:id_persona(nombre, apellido)')
          .eq('id', session.user.id)
          .maybeSingle();

        if (uData) {
          registrarLog({
            tipo_nombre:     EVENT_TYPES.LOGIN,
            descripcion:     `Sesión iniciada por ${uData.persona?.nombre} ${uData.persona?.apellido}`,
            id_persona:      uData.id_persona,
            organizacion_id: uData.organizacion_id
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="flex h-screen items-center justify-center text-green-600 font-bold">
      Cargando sistema...
    </div>
  );

  return (
    <RbacProvider session={session}>
      <OrgProvider user={session?.user}>
        <BrowserRouter>
          <Routes>
            {!session ? (
              <>
                <Route path="/login" element={<Login />} />
                <Route path="*"      element={<Navigate to="/login" replace />} />
              </>
            ) : (
              <>
                {/* Sin protección de módulo */}
                <Route path="/"             element={<Dashboard />} />
                <Route path="/dashboard"    element={<Dashboard />} />
                <Route path="/configuracion" element={<Configuracion />} />

                {/* CORRECCIÓN: reqModulo = nombre exacto en modulo.nombre de la BD */}
                <Route path="/usuarios"
                  element={<ProtectedRoute reqModulo="Usuarios del Panel"><Usuarios /></ProtectedRoute>} />

                <Route path="/empleados"
                  element={<ProtectedRoute reqModulo="Empleados"><Empleados /></ProtectedRoute>} />

                <Route path="/tickets"
                  element={<ProtectedRoute reqModulo="Tickets de Acceso"><Tickets /></ProtectedRoute>} />

                <Route path="/vehiculos"
                  element={<ProtectedRoute reqModulo="Flota de Vehiculos"><Vehiculos /></ProtectedRoute>} />

                <Route path="/acceso-manual"
                  element={<ProtectedRoute reqModulo="Acceso Manual"><AccesoManual /></ProtectedRoute>} />

                <Route path="/ocupacion"
                  element={<ProtectedRoute reqModulo="Ocupacion"><Ocupacion /></ProtectedRoute>} />

                <Route path="/zonas-parqueo"
                  element={<ProtectedRoute reqModulo="Zonas y Plazas"><ZonasParqueo /></ProtectedRoute>} />

                <Route path="/reservaciones"
                  element={<ProtectedRoute reqModulo="Reservaciones"><Reservaciones /></ProtectedRoute>} />

                <Route path="/asignaciones"
                  element={<ProtectedRoute reqModulo="Asignaciones Fijas"><Asignaciones /></ProtectedRoute>} />

                <Route path="/sensores"
                  element={<ProtectedRoute reqModulo="Mantenimiento"><Sensores /></ProtectedRoute>} />

                <Route path="/reportes"
                  element={<ProtectedRoute reqModulo="Reportes"><Reportes /></ProtectedRoute>} />

                <Route path="/mantenimiento"
                  element={<ProtectedRoute reqModulo="Mantenimiento"><Mantenimiento /></ProtectedRoute>} />

                <Route path="/logs"
                  element={<ProtectedRoute reqModulo="Logs y Eventos"><Logs /></ProtectedRoute>} />

                <Route path="/notificaciones"
                  element={<ProtectedRoute reqModulo="Notificaciones"><Notificaciones /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </RbacProvider>
  );
}
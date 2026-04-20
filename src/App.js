

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

import { RbacProvider } from './contexts/RbacContext';
import { OrgProvider } from './contexts/OrgContext';
import { ProtectedRoute } from './componentes/ProtectedRoute';
import { registrarLog, EVENT_TYPES } from './utils/logging';

import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import Empleados from './paginas/Empleados';
import Tickets from './paginas/Tickets';
import Vehiculos from './paginas/Vehiculos';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Asignaciones from './paginas/Asignaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';
import Configuracion from './paginas/Configuracion';
import Logs from './paginas/Logs';
import Notificaciones from './paginas/Notificaciones';
import AccesoManual from './paginas/AccesoManual';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[App] 🔑 Sesión recuperada de Supabase:', session?.user?.email || 'Ninguna');
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[App] 🔄 Evento de autenticación: ${event}`);
      setSession(session);
      setLoading(false);

      if (event === 'SIGNED_IN' && session) {
        // Obtenemos los datos del perfil para el log
        const { data: uData } = await supabase
          .from('usuario')
          .select('id_persona, organizacion_id, persona(nombre, apellido)')
          .eq('id', session.user.id)
          .single();

        if (uData) {
          registrarLog({
            tipo_nombre: EVENT_TYPES.LOGIN,
            descripcion: `Sesión iniciada correctamente por ${uData.persona?.nombre} ${uData.persona?.apellido}`,
            id_persona: uData.id_persona,
            organizacion_id: uData.organizacion_id
          });
        }
      }

      if (event === 'SIGNED_OUT') {
        // En Logout ya no hay sesión activa, así que solemos buscar el último log activo si hiciese falta,
        // pero por ahora grabaremos un evento general si tenemos los datos previos o simplemente marcamos el fin.
        console.log('Sesión cerrada por el usuario');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-green-600 font-bold">Cargando sistema...</div>;

  return (
    <RbacProvider session={session}>
      <OrgProvider user={session?.user}>
        <BrowserRouter>
          <Routes>
          {!session ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              {/* Rutas sin protección estricta de módulo */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/configuracion" element={<Configuracion />} />

              {/* Rutas protegidas */}
              <Route path="/usuarios" element={<ProtectedRoute reqModulo="Módulo Usuarios"><Usuarios /></ProtectedRoute>} />
              <Route path="/empleados" element={<ProtectedRoute reqModulo="Módulo Personal"><Empleados /></ProtectedRoute>} />

              <Route path="/tickets" element={<ProtectedRoute reqModulo="Módulo Parqueo"><Tickets /></ProtectedRoute>} />
              <Route path="/vehiculos" element={<ProtectedRoute reqModulo="Módulo Vehículos"><Vehiculos /></ProtectedRoute>} />
              <Route path="/acceso-manual" element={<ProtectedRoute reqModulo="Acceso Manual"><AccesoManual /></ProtectedRoute>} />
              <Route path="/ocupacion" element={<ProtectedRoute reqModulo="Ocupación"><Ocupacion /></ProtectedRoute>} />
              <Route path="/zonas-parqueo" element={<ProtectedRoute reqModulo="Zonas de Parqueo"><ZonasParqueo /></ProtectedRoute>} />

              <Route path="/reservaciones" element={<ProtectedRoute reqModulo="Reservas"><Reservaciones /></ProtectedRoute>} />
              <Route path="/asignaciones" element={<ProtectedRoute reqModulo="Asignaciones"><Asignaciones /></ProtectedRoute>} />

              <Route path="/sensores" element={<ProtectedRoute reqModulo="Dispositivos"><Sensores /></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedRoute reqModulo="Reportes"><Reportes /></ProtectedRoute>} />
              <Route path="/mantenimiento" element={<ProtectedRoute reqModulo="Mantenimiento"><Mantenimiento /></ProtectedRoute>} />
              <Route path="/logs" element={<ProtectedRoute reqModulo="Logs"><Logs /></ProtectedRoute>} />
              <Route path="/notificaciones" element={<ProtectedRoute reqModulo="Notificaciones"><Notificaciones /></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
        </BrowserRouter>
      </OrgProvider>
    </RbacProvider>
  );
}
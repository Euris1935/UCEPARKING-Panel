
/*

import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Dashboard from './paginas/Dashboard'
import Usuarios from './paginas/Usuarios'
import Reservaciones from './paginas/Reservaciones'
import Ocupacion from './paginas/Ocupacion'
import Mantenimiento from './paginas/Mantenimiento'
import Reportes from './paginas/Reportes'
import Sensores from './paginas/Sensores'
import VehiculosTickets from './paginas/VehiculosTickets' 
import ZonasParqueo from './paginas/ZonasParqueos' 


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
        <Route path="/usuarios" element={<Usuarios />} />
        
        <Route path="/reservaciones" element={<Reservaciones />} />
        <Route path="/ocupacion" element={<Ocupacion />} />
        <Route path="/mantenimiento" element={<Mantenimiento />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/sensores" element={<Sensores />} />
        <Route path="/zonas-parqueo" element={<ZonasParqueo />} /> 
      </Routes>
    </BrowserRouter>
  )
}

*/



/*


import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importación de páginas
import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import VehiculosTickets from './paginas/VehiculosTickets';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Verificamos si ya hay una sesión activa al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Escuchamos cambios (Iniciar sesión o Cerrar sesión)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-uce font-bold text-xl">Cargando UCE Parking...</div>;

  return (
    <BrowserRouter>
      {!session ? (
        // 🔒 SI NO HAY SESIÓN: Forzamos a mostrar SOLO el Login
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        // 🔓 SI HAY SESIÓN: Mostramos el Dashboard y el resto de la app
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
          <Route path="/ocupacion" element={<Ocupacion />} />
          <Route path="/zonas-parqueo" element={<ZonasParqueo />} />
          <Route path="/reservaciones" element={<Reservaciones />} />
          <Route path="/sensores" element={<Sensores />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/mantenimiento" element={<Mantenimiento />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}


*/


/*

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Páginas
import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import VehiculosTickets from './paginas/VehiculosTickets';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión al inicio
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Escuchar cambios (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center font-bold text-uce">Cargando sistema...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          // SI NO HAY SESIÓN -> LOGIN
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          // SI HAY SESIÓN -> DASHBOARD Y RUTAS PROTEGIDAS
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
            <Route path="/ocupacion" element={<Ocupacion />} />
            <Route path="/zonas-parqueo" element={<ZonasParqueo />} />
            <Route path="/reservaciones" element={<Reservaciones />} />
            <Route path="/sensores" element={<Sensores />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/mantenimiento" element={<Mantenimiento />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

*/

/*

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importa tus páginas
import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import VehiculosTickets from './paginas/VehiculosTickets';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión al cargar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Escuchar eventos de Login/Logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-green-600 font-bold">Cargando sistema...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          // 🔒 RUTAS PÚBLICAS (Solo Login)
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          // 🔓 RUTAS PRIVADAS (Panel Administrativo)
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
            <Route path="/ocupacion" element={<Ocupacion />} />
            <Route path="/zonas-parqueo" element={<ZonasParqueo />} />
            <Route path="/reservaciones" element={<Reservaciones />} />
            <Route path="/sensores" element={<Sensores />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/mantenimiento" element={<Mantenimiento />} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

*/


/*

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importa tus páginas
import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios'; // <--- Esta página ahora contiene las pestañas de Clientes y Empleados
import VehiculosTickets from './paginas/VehiculosTickets';
import ZonasParqueo from './paginas/ZonasParqueos'; // Asegúrate que el nombre del archivo coincida (singular o plural)
import Reservaciones from './paginas/Reservaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Verificar sesión al cargar la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Escuchar eventos de Login/Logout en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-green-600 font-bold text-xl">
        Cargando sistema UCE Parking...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          // 🔒 RUTAS PÚBLICAS (Solo Login)
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          // 🔓 RUTAS PRIVADAS (Panel Administrativo)
          <>
            <Route path="/" element={<Dashboard />} />
            
           
            <Route path="/usuarios" element={<Usuarios />} />
            
            <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
            <Route path="/ocupacion" element={<Ocupacion />} />
            <Route path="/zonas-parqueo" element={<ZonasParqueo />} />
            <Route path="/reservaciones" element={<Reservaciones />} />
            <Route path="/sensores" element={<Sensores />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/mantenimiento" element={<Mantenimiento />} />
            
          
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

*/

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// PÁGINAS
import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import Empleados from './paginas/Empleados'; // <--- ASEGÚRATE DE IMPORTAR ESTO
import VehiculosTickets from './paginas/VehiculosTickets';
import ZonasParqueo from './paginas/ZonasParqueos';
import Reservaciones from './paginas/Reservaciones';
import Mantenimiento from './paginas/Mantenimiento';
import Sensores from './paginas/Sensores';
import Reportes from './paginas/Reportes';
import Ocupacion from './paginas/Ocupacion';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-green-600 font-bold">Cargando sistema...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Dashboard />} />
            
            <Route path="/usuarios" element={<Usuarios />} />
            
            {/* --- ESTA LÍNEA HACE QUE FUNCIONE EL BOTÓN MORADO --- */}
            <Route path="/empleados" element={<Empleados />} />
            {/* -------------------------------------------------- */}
            
            <Route path="/vehiculos-tickets" element={<VehiculosTickets />} />
            <Route path="/ocupacion" element={<Ocupacion />} />
            <Route path="/zonas-parqueo" element={<ZonasParqueo />} />
            <Route path="/reservaciones" element={<Reservaciones />} />
            <Route path="/sensores" element={<Sensores />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/mantenimiento" element={<Mantenimiento />} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
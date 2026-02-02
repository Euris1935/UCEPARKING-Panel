

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';


import Login from './paginas/Login';
import Dashboard from './paginas/Dashboard';
import Usuarios from './paginas/Usuarios';
import Empleados from './paginas/Empleados'; 
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
            
            
            <Route path="/empleados" element={<Empleados />} />
            
            
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
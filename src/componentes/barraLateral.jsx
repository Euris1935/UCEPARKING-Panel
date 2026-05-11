

import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useEffect, useState } from 'react';
import { useRbac } from '../contexts/RbacContext';
import { useUI } from '../contexts/UIContext';
import {
  FaTachometerAlt, FaCar, FaClipboardList, FaUsers,
  FaMicrochip, FaChartBar, FaWrench, FaCog, FaSignOutAlt,
  FaParking, FaTicketAlt, FaSuitcase, FaHistory, FaBell, FaHandPaper, FaCarSide
} from 'react-icons/fa';

const navItems = [
  { to: '/', icon: FaTachometerAlt, label: 'Dashboard', moduloReq: null },
  { to: '/tickets', icon: FaTicketAlt, label: 'Tickets de Acceso', moduloReq: 'Módulo Parqueo' },
  { to: '/vehiculos', icon: FaCarSide, label: 'Flota de Vehículos', moduloReq: 'Módulo Vehículos' },
  { to: '/acceso-manual', icon: FaHandPaper, label: 'Acceso Manual', moduloReq: 'Acceso Manual' },
  { to: '/ocupacion', icon: FaCar, label: 'Ocupación', moduloReq: 'Ocupación' },
  { to: '/zonas-parqueo', icon: FaParking, label: 'Zonas de Parqueo', moduloReq: 'Zonas de Parqueo' },
  { to: '/reservaciones', icon: FaClipboardList, label: 'Reservaciones', moduloReq: 'Reservas' },
  { to: '/asignaciones', icon: FaSuitcase, label: 'Asignaciones', moduloReq: 'Asignaciones' },
  { to: '/usuarios', icon: FaUsers, label: 'Usuarios', moduloReq: 'Módulo Usuarios' },
  { to: '/sensores', icon: FaMicrochip, label: 'Dispositivos', moduloReq: 'Dispositivos' },
  { to: '/reportes', icon: FaChartBar, label: 'Reportes', moduloReq: 'Reportes' },
  { to: '/mantenimiento', icon: FaWrench, label: 'Mantenimiento', moduloReq: 'Mantenimiento' },
  { to: '/logs', icon: FaHistory, label: 'Logs de Eventos', moduloReq: 'Logs' },
];

export default function BarraLateral() {
  const location = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const { modulos, esAdmin } = useRbac();
  const { isSidebarFixed, setIsSidebarHovered } = useUI();

  useEffect(() => {
    const fetchNoLeidas = async () => {
      const { count } = await supabase
        .from('notificacion')
        .select('*', { count: 'exact', head: true })
        .eq('leida', false);
      setNoLeidas(count || 0);
    };
    fetchNoLeidas();
    const ch = supabase.channel('notif_badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacion' }, fetchNoLeidas)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // Resetear hover al navegar a otra página
  useEffect(() => {
    setIsSidebarHovered(false);
  }, [location.pathname]);


  const getLinkClasses = (path) => {
    const isActive = location.pathname === path;
    const baseClasses = "flex items-center gap-3 px-4 py-2 rounded transition-colors duration-150 w-full text-left";

    return isActive
      ? `${baseClasses} bg-green-50 text-green-700 font-bold border-r-4 border-green-600`
      : `${baseClasses} text-gray-600 hover:bg-gray-100`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div
      className={`fixed left-0 top-0 h-screen z-[100] group ${isSidebarFixed ? 'w-64' : 'w-4 hover:w-64'}`}
      onMouseEnter={() => { if (!isSidebarFixed) setIsSidebarHovered(true); }}
      onMouseLeave={() => { if (!isSidebarFixed) setIsSidebarHovered(false); }}
    >
      <aside className={`w-64 h-full bg-white flex flex-col p-4 border-r border-gray-200 transition-transform duration-300 overflow-hidden ${isSidebarFixed ? 'translate-x-0' : '-translate-x-full group-hover:translate-x-0 shadow-2xl'}`}>


      <Link to="/" className="flex items-center gap-2 mb-8 px-2 h-16 shrink-0 hover:opacity-80 transition-opacity">
        <FaParking className="text-green-600 text-4xl" />
        <h1 className="text-2xl font-extrabold text-green-700 tracking-wide">UCE PARKING</h1>
      </Link>


      <nav className="flex-grow space-y-1 overflow-y-auto custom-scrollbar">
        {navItems
          .filter(item => {
            if (!item.moduloReq || esAdmin) return true;
            return modulos.some(m => {
              const nombre = m.nombre;
              return nombre && nombre.toLowerCase() === item.moduloReq.toLowerCase();
            });
          })
          .map((item) => (
            <Link key={item.to} to={item.to} className={getLinkClasses(item.to)}>
              <item.icon className="text-xl" />
              <span>{item.label}</span>
            </Link>
        ))}
      </nav>


      <div className="pt-4 border-t border-gray-200 space-y-2 mt-auto shrink-0 bg-white">

        {/* Notificaciones con badge */}
        <Link to="/notificaciones" className={getLinkClasses('/notificaciones')}>
          <div className="relative">
            <FaBell className="text-xl" />
            {noLeidas > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </div>
          <span>Notificaciones</span>
        </Link>

        <Link
          to="/configuracion"
          className={getLinkClasses('/configuracion')}
        >
          <FaCog className="text-xl" />
          <span>Configuración</span>
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 rounded text-red-600 hover:bg-red-50 font-medium transition-colors"
        >
          <FaSignOutAlt className="text-xl" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
    </div>
  );
}


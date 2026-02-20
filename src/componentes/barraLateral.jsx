

import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient'; 
import { 
  FaTachometerAlt, FaCar, FaClipboardList, FaUsers, 
  FaMicrochip, FaChartBar, FaWrench, FaCog, FaSignOutAlt,
  FaParking, FaTicketAlt, FaSuitcase 
} from 'react-icons/fa';

const navItems = [
  { to: '/', icon: FaTachometerAlt, label: 'Dashboard' },
  { to: '/vehiculos-tickets', icon: FaTicketAlt, label: 'Vehículos y Tickets' }, 
  { to: '/ocupacion', icon: FaCar, label: 'Ocupación' }, 
  { to: '/zonas-parqueo', icon: FaParking, label: 'Zonas de Parqueo' }, 
  { to: '/reservaciones', icon: FaClipboardList, label: 'Reservaciones' },
  { to: '/asignaciones', icon: FaSuitcase, label: 'Asignaciones' }, 
  { to: '/usuarios', icon: FaUsers, label: 'Usuarios' },
  { to: '/sensores', icon: FaMicrochip, label: 'Dispositivos' },
  { to: '/reportes', icon: FaChartBar, label: 'Reportes' },
  { to: '/mantenimiento', icon: FaWrench, label: 'Mantenimiento' },
];

export default function BarraLateral() {
  const location = useLocation();

  
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
    <aside className="w-64 h-screen bg-white flex flex-col p-4 border-r border-gray-200 fixed left-0 top-0 z-50 overflow-hidden">
      
      
      <div className="flex items-center gap-2 mb-8 px-2 h-16 shrink-0">
        <FaParking className="text-green-600 text-4xl" /> 
        <h1 className="text-2xl font-extrabold text-green-700 tracking-wide">UCE PARKING</h1>
      </div>
      
      
      <nav className="flex-grow space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className={getLinkClasses(item.to)}>
            <item.icon className="text-xl" /> 
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      
      <div className="pt-4 border-t border-gray-200 space-y-2 mt-auto shrink-0 bg-white">
        
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
  );
}
  

import { Navigate } from 'react-router-dom';
import { useRbac } from '../contexts/RbacContext';

export function ProtectedRoute({ children, reqModulo }) {
  const { modulos, loadingRbac, esAdmin } = useRbac();

  if (loadingRbac) {
    return (
      <div className="flex h-screen items-center justify-center text-green-600 font-bold">
        Validando privilegios de acceso...
      </div>
    );
  }

  // Si es administrador, pasamos sin preguntar.
  if (esAdmin) {
    return children;
  }

  // Si no se requiere módulo (ej. Dashboard base), pasamos.
  if (!reqModulo) {
    return children;
  }

  // Verifica si el módulo requerido está entre los accesibles
  const tieneAcceso = modulos?.some(m => {
      const nombre = m.nombre;
      return nombre && nombre.toLowerCase() === reqModulo.toLowerCase();
  });

  if (!tieneAcceso) {
    return (
      <Navigate to="/" replace />
    );
  }

  return children;
}

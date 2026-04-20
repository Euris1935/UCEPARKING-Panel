/**
 * Utilidades para validar el horario laboral de la organización.
 */

/**
 * Comprueba si la organización está en horario de operación.
 * @param {Array} horarios - Lista de objetos de horario (dia_semana, hora_apertura, hora_cierre, activo).
 * @param {Boolean} bypass - Si es true, ignora la validación (útil para desarrollo/admin).
 * @returns {Object} { isOpen: boolean, message: string }
 */
export const validarHorario = (horarios, bypass = false) => {
    if (bypass) {
        return { isOpen: true, message: 'Acceso concedido (Modo Desarrollo/Admin)' };
    }

    if (!horarios || horarios.length === 0) {
        return { isOpen: true, message: 'No hay horarios configurados' };
    }

    const ahora = new Date();
    // getDay() devuelve 0 para Domingo, 1 para Lunes, etc.
    const diaActual = ahora.getDay();
    const horaActual = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');

    const hoy = horarios.find(h => h.dia_semana === diaActual);

    if (!hoy || !hoy.activo) {
        return { 
            isOpen: false, 
            message: 'El sistema se encuentra cerrado el día de hoy según el horario establecido.' 
        };
    }

    const apertura = hoy.hora_apertura.substring(0, 5); // Asegurar formato HH:mm
    const cierre = hoy.hora_cierre.substring(0, 5);

    if (horaActual < apertura) {
        return { 
            isOpen: false, 
            message: `El sistema aún no ha abierto. El horario de hoy inicia a las ${apertura}.` 
        };
    }

    if (horaActual > cierre) {
        return { 
            isOpen: false, 
            message: `El sistema ya ha cerrado. El horario de hoy finalizó a las ${cierre}.` 
        };
    }

    return { isOpen: true, message: 'Sistema operativo' };
};

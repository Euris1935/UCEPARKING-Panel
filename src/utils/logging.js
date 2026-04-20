import { supabase } from '../supabaseClient';

/**
 * Diccionario de tipos de eventos oficiales
 */
export const EVENT_TYPES = {
    ENTRADA: 'Entrada',
    SALIDA: 'Salida',
    ALERTA: 'Alerta',
    RESERVA_CREADA: 'Reserva Creada',
    RESERVA_CANCELADA: 'Reserva Cancelada',
    TICKET_EMITIDO: 'Ticket Emitido',
    TICKET_CERRADO: 'Ticket Cerrado',
    TICKET_VENCIDO: 'Ticket Vencido',
    MANTENIMIENTO_INICIADO: 'Mantenimiento Iniciado',
    MANTENIMIENTO_COMPLETADO: 'Mantenimiento Completado',
    ACCESO_DENEGADO: 'Acceso Denegado',
    DISPOSITIVO_OFFLINE: 'Dispositivo Offline',
    DISPOSITIVO_ONLINE: 'Dispositivo Online',
    ENTRADA_LPR_AUTORIZADA: 'Entrada LPR Autorizada',
    ENTRADA_LPR_DENEGADA: 'Entrada LPR Denegada',
    SALIDA_LPR: 'Salida LPR',
    PLACA_NO_RECONOCIDA: 'Placa No Reconocida',
    VEHICULO_REGISTRADO: 'Vehículo Registrado',
    VEHICULO_ELIMINADO: 'Vehículo Eliminado',
    USUARIO_CREADO: 'Usuario Creado',
    USUARIO_ELIMINADO: 'Usuario Eliminado',
    ASIGNACION_MODIFICADA: 'Asignación Modificada',
    PERMISO_ACTUALIZADO: 'Permiso Actualizado',
    CONFIGURACION_CAMBIADA: 'Configuración Cambiada',
    ZONA_MODIFICADA: 'Zona Modificada',
    EMPLEADO_REGISTRADO: 'Empleado Registrado',
    CAMBIO_ESTADO: 'Cambio de Estado',
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    ACCESO_MANUAL: 'Acceso Manual'
};

/**
 * Etiquetas legibles para los campos de la base de datos
 */
const FIELD_LABELS = {
    nombre: 'Nombre',
    apellido: 'Apellido',
    email: 'Email',
    telefono: 'Teléfono',
    cedula: 'Cédula',
    sexo: 'Sexo',
    direccion: 'Dirección',
    fecha_nacimiento: 'Fecha de Nacimiento',
    rol_id: 'Rol',
    id_rol: 'Rol',
    id_estado: 'Estado',
    placa: 'Placa',
    id_marca: 'Marca',
    id_modelo: 'Modelo',
    id_color: 'Color',
    capacidad_total: 'Capacidad',
    id_tipo: 'Tipo',
    descripcion: 'Descripción'
};

/**
 * Función central para registrar logs
 */
export const registrarLog = async ({
    tipo_nombre,
    descripcion,
    id_persona,
    organizacion_id,
    id_plaza = null,
    id_dispositivo = null,
    origen = 'Panel Web'
}) => {
    if (!id_persona || !organizacion_id) {
        console.warn('Logging: Falta id_persona o organizacion_id', { id_persona, organizacion_id });
        return;
    }

    try {
        // 1. Obtener ID del tipo de evento
        const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
        
        // 2. Obtener ID del origen del evento (si no existe lo creamos o usamos uno genérico)
        let id_origen = null;
        const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', origen).maybeSingle();
        if (oe) id_origen = oe.id_origen;

        // 3. Insertar el evento
        const { error } = await supabase.from('evento').insert([{
            fecha_hora: new Date().toISOString(),
            descripcion: descripcion,
            id_persona: id_persona,
            organizacion_id: organizacion_id,
            id_tipo: te?.id_tipo || null,
            id_origen_evento: id_origen,
            id_plaza: id_plaza,
            id_dispositivo: id_dispositivo
        }]);

        if (error) throw error;
    } catch (err) {
        console.error('Error reportado al registrar log:', err.message);
    }
};

/**
 * Compara dos objetos y genera una descripción de los cambios detectados
 */
export const generarDescripcionCambio = (oldObj, newObj, title = 'Cambios detectados') => {
    const cambios = [];

    for (const key in newObj) {
        // Ignorar campos internos o de sistema
        if (['created_at', 'updated_at', 'id_usuario', 'id_persona', 'id_vehiculo'].includes(key)) continue;

        const oldVal = oldObj[key];
        const newVal = newObj[key];

        // Solo registrar si los valores son diferentes (comparación simple)
        if (String(oldVal || '') !== String(newVal || '')) {
            const label = FIELD_LABELS[key] || key;
            cambios.push(`${label}: "${oldVal || 'N/A'}" → "${newVal}"`);
        }
    }

    if (cambios.length === 0) return `${title}: Sin cambios significativos en los valores.`;
    
    return `${title}: ${cambios.join(' | ')}`;
};

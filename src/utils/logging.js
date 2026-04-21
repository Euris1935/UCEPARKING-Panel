import { supabase } from '../supabaseClient';

/**
 * Tipos de evento — nombres exactos según tabla tipo_evento en BD
 */
export const EVENT_TYPES = {
    ENTRADA:                 'Entrada',
    SALIDA:                  'Salida',
    ALERTA:                  'Alerta',
    RESERVA_CREADA:          'Reserva Creada',
    RESERVA_CANCELADA:       'Reserva Cancelada',
    TICKET_EMITIDO:          'Ticket Emitido',
    TICKET_CERRADO:          'Ticket Cerrado',
    TICKET_VENCIDO:          'Ticket Vencido',
    MANTENIMIENTO_INICIADO:  'Mantenimiento Iniciado',
    MANTENIMIENTO_COMPLETADO:'Mantenimiento Completado',
    ACCESO_DENEGADO:         'Acceso Denegado',
    DISPOSITIVO_OFFLINE:     'Dispositivo Offline',
    DISPOSITIVO_ONLINE:      'Dispositivo Online',
    ENTRADA_LPR_AUTORIZADA:  'Entrada LPR Autorizada',
    ENTRADA_LPR_DENEGADA:    'Entrada LPR Denegada',
    SALIDA_LPR:              'Salida LPR',
    PLACA_NO_RECONOCIDA:     'Placa No Reconocida',
    VEHICULO_REGISTRADO:     'Vehículo Registrado',
    VEHICULO_ELIMINADO:      'Vehículo Eliminado',
    USUARIO_CREADO:          'Usuario Creado',
    USUARIO_ELIMINADO:       'Usuario Eliminado',
    ASIGNACION_MODIFICADA:   'Asignación Modificada',
    PERMISO_ACTUALIZADO:     'Permiso Actualizado',
    CONFIGURACION_CAMBIADA:  'Configuración Cambiada',
    ZONA_MODIFICADA:         'Zona Modificada',
    EMPLEADO_REGISTRADO:     'Empleado Registrado',
    NUEVO_EMPLEADO:          'Empleado Registrado',
    CAMBIO_ESTADO:           'Cambio de Estado',
    LOGIN:                   'Inicio de Sesión',
    LOGOUT:                  'Cierre de Sesión',
};

/** Normaliza el string de origen al nombre exacto que existe en la BD */
const normalizarOrigen = (origen = '') => {
    const o = origen.toLowerCase();
    if (o.includes('móvil') || o.includes('movil') || o.includes('app')) return 'App Móvil';
    if (o.includes('lpr')) return 'LPR';
    if (o.includes('sistema')) return 'Sistema';
    return 'Panel Web';
};

/**
 * Registra un evento en la tabla `evento`.
 * Si id_persona u organizacion_id no se pasan, los resuelve desde la sesión activa.
 */
export const registrarLog = async ({
    tipo_nombre,
    descripcion,
    id_persona       = null,
    organizacion_id  = null,
    id_plaza         = null,
    id_dispositivo   = null,
    origen           = 'Panel Web'
}) => {
    try {
        let resolvedPersonaId = id_persona;
        let resolvedOrgId     = organizacion_id;

        // Auto-resolver desde la sesión si faltan
        if (!resolvedPersonaId || !resolvedOrgId) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: ud } = await supabase
                    .from('usuario')
                    .select('id_persona, organizacion_id')
                    .eq('id', user.id)
                    .maybeSingle();
                if (!resolvedPersonaId) resolvedPersonaId = ud?.id_persona  ?? null;
                if (!resolvedOrgId)     resolvedOrgId     = ud?.organizacion_id ?? null;
            }
        }

        if (!resolvedPersonaId || !resolvedOrgId) {
            console.warn('[Log] No se pudo resolver id_persona u organizacion_id — evento omitido.');
            return;
        }

        const origenNormalizado = normalizarOrigen(origen);

        const [{ data: te }, { data: oe }] = await Promise.all([
            supabase.from('tipo_evento')   .select('id_tipo')  .eq('nombre', tipo_nombre)       .maybeSingle(),
            supabase.from('origen_evento') .select('id_origen').eq('nombre', origenNormalizado) .maybeSingle(),
        ]);

        const { error } = await supabase.from('evento').insert([{
            fecha_hora:       new Date().toISOString(),
            descripcion,
            id_persona:       resolvedPersonaId,
            organizacion_id:  resolvedOrgId,
            id_tipo:          te?.id_tipo   ?? null,
            id_origen_evento: oe?.id_origen ?? null,
            id_plaza,
            id_dispositivo,
        }]);

        if (error) throw error;
    } catch (err) {
        console.error('[Log] Error al registrar evento:', err.message);
    }
};

/**
 * Compara dos objetos y genera una descripción de los cambios detectados.
 */
const FIELD_LABELS = {
    nombre: 'Nombre', apellido: 'Apellido', email: 'Email',
    telefono: 'Teléfono', cedula: 'Cédula', sexo: 'Sexo',
    direccion: 'Dirección', fecha_nacimiento: 'Fecha de Nacimiento',
    rol_id: 'Rol', id_rol: 'Rol', id_estado: 'Estado',
    placa: 'Placa', id_marca: 'Marca', id_modelo: 'Modelo',
    id_color: 'Color', capacidad_total: 'Capacidad',
    id_tipo: 'Tipo', descripcion: 'Descripción',
};

export const generarDescripcionCambio = (oldObj, newObj, title = 'Cambios detectados') => {
    const cambios = [];
    for (const key in newObj) {
        if (['created_at', 'updated_at', 'id_usuario', 'id_persona', 'id_vehiculo'].includes(key)) continue;
        const oldVal = oldObj[key];
        const newVal = newObj[key];
        if (String(oldVal || '') !== String(newVal || '')) {
            const label = FIELD_LABELS[key] || key;
            cambios.push(`${label}: "${oldVal || 'N/A'}" → "${newVal}"`);
        }
    }
    if (cambios.length === 0) return `${title}: Sin cambios significativos.`;
    return `${title}: ${cambios.join(' | ')}`;
};

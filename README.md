# 🅿️ UCE PARKING — Panel de Administración

Sistema de gestión de parqueo universitario desarrollado con **React** y **Supabase**. Permite el control de acceso vehicular, gestión de plazas en tiempo real, emisión de tickets, reservaciones, notificaciones y generación de reportes.

---

## 📋 Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Tecnologías](#tecnologías)
- [Requisitos Previos](#requisitos-previos)
- [Instalación y Uso](#instalación-y-uso)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Módulos del Sistema](#módulos-del-sistema)
- [Base de Datos](#base-de-datos)
- [Variables de Entorno](#variables-de-entorno)
- [Requisitos Funcionales](#requisitos-funcionales)
- [Guías de Uso por Módulo](#guías-de-uso-por-módulo)

---

## Descripción General

**UCE PARKING** es un panel de control web para administradores del sistema de parqueo de la Universidad Central del Este. Provee:

- 🟢 Monitoreo de plazas en **tiempo real** (Supabase Realtime).
- 🎫 **Emisión e impresión de tickets** para visitantes.
- 🚪 **Registro de entrada y salida** de vehículos con hora exacta.
- 📊 **Reportes y logs** de eventos del sistema.
- 🔔 **Centro de notificaciones** con badges en vivo.
- 🔧 **Gestión de dispositivos IoT** (sensores, cámaras, pantallas).

---

## Tecnologías

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React | 19.x |
| Backend / BD | Supabase (PostgreSQL) | SDK 2.x |
| Enrutamiento | React Router DOM | 7.x |
| Alertas / Modales | SweetAlert2 | 11.x |
| Iconografía | React Icons | 5.x |
| Estilos | Tailwind CSS (via CDN) | 3.x |
| Build | react-scripts (CRA) | 5.0.1 |

---

## Requisitos Previos

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- Cuenta y proyecto activo en [Supabase](https://supabase.com)

---

## Instalación y Uso

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd panel-supabase

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno (ver sección ↓)
cp .env.example .env
# Edita .env con tu URL y clave de Supabase

# 4. Iniciar en modo desarrollo
npm start

# 5. Generar build de producción
npm run build
```

---

## Estructura del Proyecto

```
panel-supabase/
├── public/
├── src/
│   ├── componentes/
│   │   ├── barraLateral.jsx      # Navegación lateral principal
│   │   └── Layout.jsx            # Wrapper de página con sidebar
│   ├── paginas/
│   │   ├── Login.jsx             # Autenticación
│   │   ├── Dashboard.jsx         # Vista principal con métricas
│   │   ├── VehiculosTickets.jsx  # Emisión y cierre de tickets
│   │   ├── Ocupacion.jsx         # Control manual de plazas (tiempo real)
│   │   ├── ZonasParqueos.jsx     # Gestión de zonas y plazas
│   │   ├── Reservaciones.jsx     # Reservas de plazas
│   │   ├── Asignaciones.jsx      # Plazas fijas para empleados
│   │   ├── Usuarios.jsx          # Gestión de usuarios del sistema
│   │   ├── Empleados.jsx         # Gestión de empleados
│   │   ├── Sensores.jsx          # Inventario de hardware/IoT
│   │   ├── Mantenimiento.jsx     # Solicitudes de mantenimiento
│   │   ├── Reportes.jsx          # Reportes textuales
│   │   ├── Logs.jsx              # Historial de eventos (RF10)
│   │   ├── Notificaciones.jsx    # Centro de notificaciones (RF11/RF15)
│   │   └── Configuracion.jsx     # Configuración del sistema
│   ├── supabaseClient.js         # Inicialización del cliente Supabase
│   └── App.js                    # Rutas y control de sesión
├── .env                          # Variables de entorno (NO subir a git)
├── .env.example                  # Plantilla de variables de entorno
└── package.json
```

---

## Módulos del Sistema

### 🔐 1. Login
- Autenticación con **Supabase Auth** (`signInWithPassword`).
- Verificación de rol y estado activo antes de permitir acceso.
- Sesión persistida en `sessionStorage` (se limpia al cerrar pestaña).

### 📊 2. Dashboard
- Resumen en tiempo real: plazas libres, ocupadas, reservadas y en mantenimiento.
- Usa `supabase.channel('postgres_changes')` para actualización automática.
- Tarjetas de métricas clicables con acceso directo a módulos.

### 🎫 3. Vehículos y Tickets
Tres pestañas:

| Pestaña | Función |
|---|---|
| **Nueva Entrada** | Emite ticket para visitante nuevo o registrado. Guarda en `tickets`, `vehiculos`, `registros_acceso` y `eventos`. Abre modal de impresión. |
| **Tickets Activos** | Lista vehículos en el parqueo con tiempo transcurrido. Botón **Salida** cierra ticket, libera plaza y registra `salida_at`. |
| **Flota Registrada** | CRUD de vehículos del personal. Gestiona FKs al eliminar. |

### 🅿️ 4. Control de Ocupación
- Grid visual de plazas por zona con código de color.
- Un clic alterna LIBRE ↔ OCUPADA.
- Botones hover: RESERVADA, FUERA DE SERVICIO.
- Cada cambio registra log automático en `eventos`.

### 🗺️ 5. Zonas de Parqueo
- CRUD de zonas y sus plazas asociadas.
- Configuración de capacidad por zona.

### 📅 6. Reservaciones
- Creación de reservas con rango de fecha/hora.
- Gestión del historial y verificación de vencimientos.

### 📌 7. Asignaciones Fijas
- Asignación permanente de plazas a empleados con fecha de inicio.
- Botón **Liberar** devuelve la plaza al estado LIBRE.

### 👥 8. Usuarios
- CRUD completo con roles: Administrador, Empleado, Visitante, etc.
- Integración con Supabase Auth para crear/gestionar cuentas.

### 👔 9. Empleados
- Gestión de empleados vinculados a persona, departamento y organización.

### 🖥️ 10. Dispositivos / Sensores
- Inventario de hardware (sensores, cámaras, pantallas).
- Estado operativo, modelo, fecha de instalación y último mantenimiento.

### 🔧 11. Mantenimiento
- Registro de solicitudes preventivas y correctivas.
- Asignación a técnico y tipo. Botón **Resolver** + log automático.

### 📄 12. Reportes
- Creación y listado de reportes textuales por tipo (Ocupación, Ingresos, etc.).

### 📋 13. Logs de Eventos *(RF10)*
- Historial de eventos del sistema en tiempo real.
- Generados automáticamente por: cambios de plaza, tickets y mantenimientos.
- Filtro por tipo y búsqueda libre.

| Tipo de Evento | Generado por |
|---|---|
| `CAMBIO_ESTADO` | Control de Ocupación |
| `TICKET_EMITIDO` | Vehículos y Tickets |
| `SALIDA_VEHICULO` | Vehículos y Tickets |
| `MANTENIMIENTO` | Módulo Mantenimiento |

### 🔔 14. Notificaciones *(RF11/RF15)*
- Badge dinámico en barra lateral con no leídas.
- Crear alertas manuales con tipo, categoría y destinatario.
- Marcar leídas (individual o todas) y eliminar.

### ⚙️ 15. Configuración
- Tiempo máximo de reserva, umbral de alerta de capacidad.
- Cambio de contraseña de la cuenta activa.

---

## Base de Datos

### Tablas Principales

| Tabla | Descripción |
|---|---|
| `personas` | Datos personales de todos los involucrados |
| `usuarios` | Cuentas vinculadas a `auth.users` de Supabase |
| `empleados` | Personal con rol, departamento y organización |
| `roles` | Catálogo de roles del sistema |
| `plazas` | Plazas individuales con estado actual |
| `zonas_estacionamiento` | Agrupación de plazas por zona |
| `vehiculos` | Vehículos registrados (placa, marca, color) |
| `tickets` | Tickets de acceso de visitantes |
| `registros_acceso` | Registro de entradas y salidas con timestamps |
| `RESERVA` | Reservas de plazas con fecha/hora inicio y fin |
| `asignaciones_parqueo` | Asignaciones fijas de plazas a empleados |
| `dispositivos` | Hardware del sistema (sensores, cámaras, etc.) |
| `mantenimientos` | Solicitudes de mantenimiento |
| `eventos` | Logs automáticos del sistema (RF10) |
| `notificaciones` | Centro de alertas (RF11/RF15) |
| `reportes` | Reportes generados por administradores |
| `pantallas` | Paneles digitales de información por zona |

### Tablas Catálogo

`estado_plaza` · `estado_ticket` · `estado_reserva` · `estado_sensor` · `estado_mantenimiento` · `tipos_dispositivos` · `tipo_mantenimiento` · `tipo_notificacion` · `modelos_equipo` · `departamentos` · `organizaciones`

---

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
REACT_APP_SUPABASE_URL=https://tu-proyecto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

> ⚠️ **Nunca subas `.env` al repositorio.** Agrégalo a `.gitignore`.

Luego actualiza `src/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  { auth: { storage: sessionStorage } }
);
```

---

## Requisitos Funcionales

| RF | Descripción | Estado |
|---|---|---|
| RF1 | Registro y autenticación de usuarios | ✅ Cumplido |
| RF2 | Gestión de roles y permisos | ✅ Cumplido |
| RF3 | Configurar áreas y alertas de capacidad | ✅ Cumplido |
| RF4 | Configurar parámetros de sensores IoT | ✅ Cumplido |
| RF5 | Control manual de plazas (forzar estado) | ✅ Cumplido |
| RF6 | Estado de plazas en tiempo real | ✅ Cumplido |
| RF7 | Registro de datos vehiculares | ✅ Cumplido |
| RF8 | Registro de hora de entrada y salida | ✅ Cumplido |
| RF9 | Actualización con latencia < 5 segundos | ✅ Cumplido |
| RF10 | Logs de eventos | ✅ Cumplido |
| RF11 | Notificaciones automáticas al administrador | 🟡 Parcial |
| RF12 | Visualización de plazas libres por área | ✅ Cumplido |
| RF13 | Búsqueda de plazas disponibles | 🟡 Parcial |
| RF14 | Reservas desde aplicación móvil | ❌ Sin app móvil |
| RF15 | Notificaciones en tiempo real | 🟡 Parcial |
| RF16 | Reportes históricos por período | ❌ Pendiente |

---

## Guías de Uso por Módulo

### Emitir un ticket de visitante
1. Ir a **Vehículos y Tickets → Nueva Entrada**.
2. Si el visitante ya estuvo antes, seleccionarlo en el dropdown.
3. Ingresar nombre, apellido, placa, marca y color.
4. Seleccionar una plaza libre.
5. Presionar **EMITIR TICKET** → aparece el modal de impresión.

### Registrar la salida de un vehículo
1. Ir a **Vehículos y Tickets → Tickets Activos**.
2. Localizar el ticket y presionar **Salida**.
3. El ticket pasa a "Completado", la plaza a "LIBRE" y se registra la hora en `registros_acceso`.

### Cambiar el estado de una plaza manualmente
1. Ir a **Ocupación**.
2. Clic en la plaza → alterna LIBRE/OCUPADA.
3. Hover sobre la plaza → botones para RESERVADA y FUERA DE SERVICIO.

### Ver los eventos del sistema
1. Ir a **Logs de Eventos** en la barra lateral.
2. Filtrar por tipo o usar el buscador de texto.

### Crear una notificación manual
1. Ir a **Notificaciones → Nueva Notificación**.
2. Seleccionar tipo y destinatario (opcional).
3. Escribir el contenido y presionar **Enviar**.

---

## Notas Técnicas

- **Tiempo real**: Se usa `supabase.channel` en Dashboard, Ocupación, Logs y Notificaciones. Cada canal se desuscribe al desmontar el componente.
- **Logs automáticos**: Ocupación, VehiculosTickets y Mantenimiento insertan en `eventos` con cada acción relevante, incluyendo el `persona_id` del usuario activo.
- **Roles esperados** en la BD: `Administrador`, `Empleado`, `Visitante`, `Regular`, `Técnico` (la comparación es case-insensitive con `.toLowerCase()`).
- **Eliminación de vehículos**: Se eliminan primero las dependencias (`registros_acceso`, `tickets` completados) antes de borrar el vehículo para respetar las FK constraints.

---

*Proyecto UCE PARKING — Universidad Central del Ecuador — 2026*

# 📋 UCE Parking Panel — Informe de Pantallas

> **Versión:** Marzo 2026 · Stack: React + Supabase + Backend local Node.js (Arduino/barreras)

---

## 🏗️ Arquitectura General

| Capa | Tecnología |
|---|---|
| Frontend | React (Create React App), Tailwind CSS |
| Base de datos | Supabase (PostgreSQL) — schema relacional con FKs |
| Autenticación | Supabase Auth (`auth.users` → `usuarios` → `personas`) |
| Backend local | Node.js en `http://localhost:4000` — control de barreras físicas |
| Tiempo real | Supabase Realtime (`postgres_changes`) en pantallas clave |
| Notificaciones | SweetAlert2 |

---

## 📺 Pantallas del Sistema

---

### 1. 🏠 Dashboard (`/dashboard`)

**Propósito:** Vista de resumen ejecutivo del estado actual del parqueo.

**Funciones principales:**
- Muestra contadores en tiempo real: plazas **Libres**, **Ocupadas**, **Asignadas**, **Reservadas**
- Usa suscripción Realtime a la tabla `plazas` con caché del catálogo `estado_plaza`
- Muestra KPIs del día: tickets emitidos, accesos registrados
- Primera pantalla que ve el operador al iniciar sesión

**Tablas consultadas:** `plazas`, `estado_plaza`, `tickets`, `registros_acceso`

---

### 2. 🎟️ Tickets de Acceso (`/tickets`)

**Propósito:** Emisión y control de tickets para visitantes externos.

**Pestaña: Nueva Entrada**
- Busca visitantes ya registrados o crea uno nuevo (nombre, apellido, **cédula**, teléfono, sexo)
- Ingresa datos del vehículo: placa, marca, modelo, color (catálogos dinámicos desde DB)
- Asigna plaza libre disponible
- Define duración del ticket (30 min, 1h, 2h, 4h, 8h, 24h, sin límite)
- Al emitir: crea el ticket, marca la plaza como ocupada, registra acceso (`registros_acceso`), llama a la API local para abrir barrera principal
- Muestra el ticket imprimible con QR code

**Pestaña: Tickets Activos**
- Lista todos los tickets del día con estado (Activo, Vencido, Usado, Anulado)
- Muestra tiempo transcurrido en tiempo real y hora de vencimiento (parpadea en rojo < 10 min)
- Acción **Salida:** cierra el ticket, libera la plaza, actualiza `registros_acceso`, abre barrera
- Acción **Anular:** cancela el ticket y libera la plaza
- Acción **Reimprimir:** muestra el ticket con marca de agua "REIMPRESIÓN"
- Auto-verifica tickets vencidos cada 60 segundos

**Tablas:** `tickets`, `estado_ticket`, `visitantes`, `personas`, `plazas`, `vehiculos`, `marcas_vehiculo`, `modelos_vehiculo`, `colores_vehiculo`, `registros_acceso`, `eventos`

---

### 3. 🚗 Flota de Vehículos (`/vehiculos`)

**Propósito:** Gestión del parque vehicular del personal (empleados y usuarios del sistema).

**Formulario: Vincular Vehículo Personal**
- Selecciona propietario entre empleados y usuarios del sistema
- Ingresa placa (máx. 6 caracteres, solo alfanumérico)
- Selecciona marca, modelo (filtrado por marca) y color desde catálogos de DB
- Inserta en `vehiculos` con FK relacional

**Tabla: Flota Registrada**
- Lista todos los vehículos registrados con propietario, placa, marca/modelo/color y fecha de registro
- Acción **Editar:** actualiza datos del vehículo
- Acción **Eliminar:** verifica que no tenga tickets activos antes de borrar; limpia `registros_acceso` históricos

**Tablas:** `vehiculos`, `personas`, `usuarios`, `empleados`, `marcas_vehiculo`, `modelos_vehiculo`, `colores_vehiculo`, `tickets`, `registros_acceso`

---

### 4. 🔓 Acceso Manual (`/acceso-manual`)

**Propósito:** Registrar entradas/salidas de vehículos de la flota sin usar el sistema LPR (lector automático de placas).

**Pestaña: Nueva Entrada Manual**
- Buscador de vehículo en tiempo real (por placa o nombre del propietario) con dropdown
- Selecciona plaza libre disponible
- Selecciona barrera de acceso (Principal o VIP)
- Valida que el vehículo no esté ya adentro (acceso activo sin salida)
- Registra en `registros_acceso`, marca plaza como ocupada, llama a la API de barrera

**Pestaña: Accesos Activos**
- Lista entradas manuales activas (sin salida registrada)
- Búsqueda por placa, nombre y teléfono
- Acción **Registrar Salida:** libera plaza, actualiza `registros_acceso.salida_at`, abre barrera (Principal o VIP)

**Botones rápidos en header:** Abre barrera Principal o VIP directamente con confirmación

**Tablas:** `registros_acceso`, `vehiculos`, `personas`, `plazas`, `eventos`, `tipo_evento`, `origen_evento`

---

### 5. 🗺️ Ocupación (`/ocupacion`)

**Propósito:** Visualización gráfica en tiempo real del estado de todas las plazas.

**Funciones:**
- Grid visual de plazas por zona con código de colores por estado (Libre, Ocupada, Asignada, Reservada)
- Suscripción Realtime a cambios en `plazas`
- Muestra número de plaza y estado actual

**Tablas:** `plazas`, `estado_plaza`, `zonas_estacionamiento`

---

### 6. 🏢 Zonas y Plazas (`/zonas-parqueo`)

**Propósito:** Configuración estructural del parqueo.

**Gestión de Zonas:**
- Crear zona con nombre y capacidad total
- Al crear, genera automáticamente las plazas con código `PREFIJO-01`, `PREFIJO-02`, etc.
- Puede generar plazas faltantes para zonas existentes
- Editar nombre/capacidad; eliminar zona (borra todas sus plazas en cascada)

**Gestión de Plazas (Mapa):**
- Vista de mapa editable por zona con todas las plazas
- Hover sobre plaza muestra botones Editar y Eliminar
- Crear plaza individual con número, zona, amplitud y longitud
- Actualiza `Capacidad_Total` de la zona si se añaden plazas que superan la capacidad

**Tablas:** `zonas_estacionamiento`, `plazas`, `estado_plaza`

---

### 7. 📅 Reservaciones (`/reservaciones`)

**Propósito:** Gestión de reservas de plazas para personas.

**Funciones:**
- Crear reserva: selecciona persona, plaza libre, fecha/hora inicio y fin
- Al crear marca la plaza como `Reservada` (id_estado = 3)
- Editar reserva activa (ajusta estados de plazas si cambia la plaza)
- Completar reserva manualmente o auto-completar cuando vence `Fecha_Hora_Fin` (verificación cada 5 segundos)
- Cancelar reserva (libera plaza)
- Eliminar reserva

**Tablas:** `RESERVA`, `plazas`, `personas`, `estado_reserva`

---

### 8. 📌 Asignaciones Fijas (`/asignaciones`)

**Propósito:** Asignación permanente o temporal de plazas a empleados.

**Funciones:**
- Crear asignación: selecciona empleado, muestra su vehículo vinculado automáticamente, selecciona plaza libre, fechas inicio/fin (con opción "Indeterminada")
- Al asignar, marca la plaza con estado "Asignada"
- Editar asignación: puede cambiar plaza (libera la anterior, asigna la nueva)
- Liberar/Eliminar asignación (plaza vuelve a estado Libre)
- Búsqueda por nombre de empleado o número de plaza

**Tablas:** `asignaciones_parqueo`, `empleados`, `personas`, `plazas`, `vehiculos`, `estado_plaza`, `estado_asignacion`

---

### 9. 👤 Usuarios (`/usuarios`)

**Propósito:** Administración de cuentas de acceso al panel.

**Funciones:**
- Lista usuarios con rol "Usuario Regular"
- Crear usuario: crea `personas` → crea cuenta en `auth.users` (Supabase Auth) → vincula en `usuarios`
- Editar datos personales (nombre, teléfono, dirección, etc.)
- Eliminar acceso (borra entrada en `usuarios`, mantiene datos en `personas`)
- Acceso rápido a gestión de Empleados

**Tablas:** `usuarios`, `personas`, `roles`, `auth.users` (vía Supabase Auth API)

---

### 10. 👔 Empleados (`/empleados`)

**Propósito:** Registro y gestión del personal operativo y administrativo.

**Funciones:**
- Lista todos los empleados con datos personales, contacto y datos laborales
- Crear empleado: crea `personas` → vincula en `empleados` con rol, departamento y organización
- Validación de edad mínima 18 años
- Editar datos personales y laborales
- Eliminar empleado (también elimina la persona si no tiene otros registros)

**Tablas:** `empleados`, `personas`, `roles`, `departamentos`, `organizaciones`

---

### 11. 🔧 Mantenimiento (`/mantenimiento`)

**Propósito:** Gestión de incidencias y mantenimientos de dispositivos (sensores, barreras, cámaras).

**Funciones:**
- Lista mantenimientos con dispositivo, tipo, técnico asignado, fecha y estado
- Crear solicitud: selecciona dispositivo, tipo de mantenimiento, técnico (empleado) y fecha
- Marcar como **Resuelto** (registra `Fecha_Fin` automáticamente)
- Registro automático de log en `eventos` al crear y al resolver
- Búsqueda por descripción, técnico o tipo de dispositivo

**Tablas:** `mantenimientos`, `dispositivos`, `tipos_dispositivos`, `modelos_equipo_cat`, `marcas_equipo`, `empleados`, `tipo_mantenimiento`, `estado_mantenimiento`, `eventos`

---

### 12. 📊 Logs / Eventos (`/logs`)

**Propósito:** Auditoría completa de todas las acciones del sistema.

**Funciones:**
- Lista cronológica de todos los eventos registrados
- Muestra: fecha/hora, tipo de evento, descripción, persona que lo generó, origen
- Filtro por tipo de evento y búsqueda de texto

**Tablas:** `eventos`, `tipo_evento`, `origen_evento`, `personas`

---

### 13. 📈 Reportes (`/reportes`)

**Propósito:** Generación de reportes en formato Excel.

**Funciones:**
- Selecciona tipo de reporte y rango de fechas
- Llama al backend local (`http://localhost:4000`) para generar el Excel
- Descarga el archivo generado

**Tablas (vía backend):** `tickets`, `registros_acceso`, `eventos`, `personas`, `vehiculos`

---

### 14. 🔔 Notificaciones (`/notificaciones`)

**Propósito:** Centro de notificaciones del sistema.

**Funciones:**
- Lista notificaciones personales del usuario actual
- Marcar como leída / todas leídas
- Tipos de notificaciones categorizados con iconos

**Tablas:** `notificaciones`, `tipo_notificacion`

---

## 🔗 Integraciones Externas

| Integración | Descripción |
|---|---|
| **Supabase Realtime** | Dashboard, Ocupación, Tickets y AccesoManual escuchan cambios en tiempo real |
| **API Barreras Principal** | `localhost:4000/api/access/open-main` — se llama al emitir ticket y al registrar salida |
| **API Barreras VIP** | `localhost:4000/api/access/open-vip` — disponible desde AccesoManual |
| **Supabase Auth** | Creación de usuarios del panel (`signUp`) y gestión de sesión |
| **QR Code** | Generado en el ticket imprimible con `qrcode.react` |

---

## 🗄️ Catálogos de Base de Datos

| Catálogo | Usado en |
|---|---|
| `marcas_vehiculo` | Tickets, Vehículos, AccesoManual |
| `modelos_vehiculo` | Tickets, Vehículos |
| `colores_vehiculo` | Tickets, Vehículos |
| `estado_plaza` | Dashboard, Zonas, Asignaciones, Reservaciones |
| `estado_ticket` | Tickets |
| `estado_reserva` | Reservaciones |
| `estado_asignacion` | Asignaciones |
| `estado_mantenimiento` | Mantenimiento |
| `tipo_evento` | Logs, todos los módulos que registran eventos |
| `origen_evento` | Logs |
| `roles` | Usuarios, Empleados |
| `departamentos` | Empleados |
| `organizaciones` | Empleados |
| `tipo_mantenimiento` | Mantenimiento |
| `tipos_dispositivos` | Mantenimiento |

---

*Generado: Marzo 2026*

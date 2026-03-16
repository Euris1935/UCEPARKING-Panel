# Cambios realizados — 09 de Marzo 2026

## 1. Campo `modelo` en la tabla `vehiculos`

**Archivo:** `src/paginas/VehiculosTickets.jsx`

Se integró el campo `modelo` (columna `modelo` lowercase en Supabase) en toda la página de Vehículos y Tickets:

| Área | Cambio |
|------|--------|
| Estados del formulario | `modelo: ''` añadido a `visitanteForm`, `vehiculoPersonalForm` y `editVehiculoForm` |
| Formulario "Nueva Entrada" | Nuevo input **Modelo** (entre Marca y Color) |
| Formulario "Vincular Vehículo Personal" | Nuevo input **Modelo** |
| Modal "Editar Vehículo" | Nuevo input **Modelo** con valor precargado |
| Ticket de impresión | Nueva fila **Modelo** |
| Tabla Tickets Activos | Columna vehículo muestra `Marca · Modelo · Color` |
| Tabla Flota Registrada | Encabezado renombrado a "Marca / Modelo / Color" |
| INSERT ticket (visitante) | Guarda `Modelo_Vehiculo` en `tickets` |
| INSERT vehículo (visitante y flota) | Guarda `modelo` en `vehiculos` |
| UPDATE vehículo | Actualiza `modelo` en `vehiculos` |

> **Nota de casing:** La columna en `vehiculos` es `modelo` (minúsculas). La columna en `tickets` es `Modelo_Vehiculo`.

---

## 2. Corrección lógica de `visitantes`

**Archivo:** `src/paginas/VehiculosTickets.jsx`

La tabla `visitantes` en la BD **no tiene** `nombre`, `apellido`, `telefono`, `sexo` directamente — estos campos viven en `personas`. Se corrigió toda la lógica:

| Área | Antes | Ahora |
|------|-------|-------|
| Crear visitante nuevo | Insertaba en `visitantes` con nombre/apellido | Inserta primero en `personas`, luego en `visitantes` con `persona_id` |
| Query de visitantes | `select('*')` | `select('id, created_at, personas(id, nombre, apellido, telefono, sexo)')` |
| Query de tickets | `visitantes(nombre, apellido)` | `visitantes(id, personas(nombre, apellido))` |
| INSERT ticket — select de retorno | `visitantes(nombre, apellido)` | `visitantes(id, personas(nombre, apellido))` |
| Dropdown autocompletar | `v.nombre`, `v.apellido` | `v.personas?.nombre`, `v.personas?.apellido` |
| Tabla tickets activos | `t.visitantes?.nombre` | `t.visitantes?.personas?.nombre` |
| Ticket impresión | `ticket.visitantes?.nombre` | `ticket.visitantes?.personas?.nombre` |

---

## 3. Dispositivos en Mantenimiento — sin resultados

**Archivo:** `src/paginas/Mantenimiento.jsx`

**Causa:** La query filtraba `.eq('estado_operativo', 'Activo')` con mayúscula exacta — si los datos en la BD tenían otro casing, retornaba `[]`.

**Fix:**
- Se eliminó el filtro restrictivo; ahora carga **todos** los dispositivos.
- Los campos del select se ampliaron para incluir `modelos_equipo(Modelo, Marca)` y `estado_operativo`.
- El dropdown ahora muestra: `[ID] Tipo — Marca Modelo (ubicación) · estado`.

---

## 4. Pantalla de Notificaciones

**Archivo:** `src/paginas/Notificaciones.jsx`

Se reescribió el componente ajustado al schema real:

| Área | Cambio |
|------|--------|
| Selector de tipo | Antes hardcodeado; ahora carga desde la tabla `tipo_notificacion` de la BD |
| Sincronización `Tipo` + `id_tipo` | Al seleccionar `id_tipo`, el campo `Tipo` (texto) se llena automáticamente |
| Validación al crear | Ahora exige seleccionar un tipo antes de enviar |
| `marcarTodasLeidas` | Cambió de `.eq('Leida', false)` a `.in('ID_Notificacion', ids)` para respetar RLS |
| Badge de tipo | Lee `tipo_notificacion.nombre_tipo` con fallback a `Tipo` |

### Políticas RLS requeridas en Supabase

Ejecutar en el **SQL Editor** de Supabase:

```sql
-- INSERT
CREATE POLICY "Autenticados pueden insertar notificaciones"
ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (true);

-- SELECT
CREATE POLICY "Autenticados pueden ver notificaciones"
ON public.notificaciones FOR SELECT TO authenticated USING (true);

-- UPDATE (marcar leída)
CREATE POLICY "Autenticados pueden actualizar notificaciones"
ON public.notificaciones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE
CREATE POLICY "Autenticados pueden eliminar notificaciones"
ON public.notificaciones FOR DELETE TO authenticated USING (true);
```

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `src/paginas/VehiculosTickets.jsx` | Campo `modelo`, lógica `visitantes` corregida |
| `src/paginas/Mantenimiento.jsx` | Query dispositivos sin filtro de casing |
| `src/paginas/Notificaciones.jsx` | Reescritura completa ajustada al schema |

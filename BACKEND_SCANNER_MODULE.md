# Backend — Módulo Scanner (agregar al servidor Express en Render)

## 1. `modules/scanner/scanner.routes.js`

```js
// modules/scanner/scanner.routes.js
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js"; // ajusta la ruta a tu middleware
import { procesarSalidaTicket } from "./scanner.controller.js";

const router = Router();

// POST /api/scanner/salida-ticket
// Body: { token: "TICKET-42-L010536" }
router.post("/salida-ticket", requireAuth, procesarSalidaTicket);

export default router;
```

---

## 2. `modules/scanner/scanner.controller.js`

```js
// modules/scanner/scanner.controller.js
import { supabaseAdmin } from "../../lib/supabaseAdmin.js"; // tu cliente admin de Supabase

/**
 * Procesa la salida de un ticket escaneado.
 * Token esperado: "TICKET-{id_ticket}-{placa}" (ej: "TICKET-42-L010536")
 * También acepta solo el id numérico por compatibilidad.
 */
export async function procesarSalidaTicket(req, res) {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ code: "TOKEN_INVALIDO", error: "Token requerido" });
  }

  // ── Parsear token ────────────────────────────────────────────────────────
  let id_ticket = null;

  // Formato largo: TICKET-42-L010536
  const matchLargo = token.trim().match(/^TICKET-(\d+)-/i);
  if (matchLargo) {
    id_ticket = parseInt(matchLargo[1], 10);
  } else {
    // Fallback: solo número
    const matchNum = token.trim().match(/^(\d+)$/);
    if (matchNum) id_ticket = parseInt(matchNum[1], 10);
  }

  if (!id_ticket) {
    return res.status(400).json({ code: "TOKEN_INVALIDO", error: "Formato de código no reconocido" });
  }

  // ── Buscar ticket ────────────────────────────────────────────────────────
  const { data: ticket, error: tkErr } = await supabaseAdmin
    .from("ticket")
    .select(`
      id_ticket, id_estado, placa_capturada,
      visitante_nombre, visitante_apellido,
      fecha_hora_emision, id_plaza_asignada, organizacion_id
    `)
    .eq("id_ticket", id_ticket)
    .maybeSingle();

  if (tkErr || !ticket) {
    return res.status(404).json({ code: "TICKET_NO_ENCONTRADO", error: "Ticket no encontrado en el sistema" });
  }

  // ── Validar estado ───────────────────────────────────────────────────────
  // Obtener estados
  const { data: estados } = await supabaseAdmin.from("estado_ticket").select("id_estado, nombre");
  const stMap = {};
  (estados || []).forEach(s => { stMap[s.id_estado] = s.nombre.toLowerCase(); });
  const estadoActual = stMap[ticket.id_estado] || "";

  if (estadoActual === "cerrado") {
    return res.status(409).json({ code: "TICKET_YA_PROCESADO", error: "Este ticket ya fue procesado (salida ya registrada)" });
  }
  if (estadoActual === "anulado" || estadoActual === "vencido") {
    return res.status(409).json({ code: "TICKET_ANULADO", error: `Ticket en estado: ${estadoActual}` });
  }

  // ── Calcular duración ────────────────────────────────────────────────────
  const ahora = new Date();
  const inicio = new Date(ticket.fecha_hora_emision);
  const duracion_minutos = Math.round((ahora - inicio) / 60000);

  // ── Cerrar ticket ────────────────────────────────────────────────────────
  const idEstCerrado = (estados || []).find(s => s.nombre.toLowerCase() === "cerrado")?.id_estado || 2;

  const { error: updErr } = await supabaseAdmin
    .from("ticket")
    .update({ id_estado: idEstCerrado, fecha_hora_vencimiento: ahora.toISOString() })
    .eq("id_ticket", ticket.id_ticket);

  if (updErr) {
    return res.status(500).json({ code: "ERROR_INTERNO", error: updErr.message });
  }

  // ── Liberar plaza ────────────────────────────────────────────────────────
  if (ticket.id_plaza_asignada) {
    const { data: epLibre } = await supabaseAdmin
      .from("estado_plaza")
      .select("id_estado")
      .ilike("nombre", "Libre")
      .maybeSingle();

    await supabaseAdmin
      .from("plaza")
      .update({ id_estado: epLibre?.id_estado || 1 })
      .eq("id_plaza", ticket.id_plaza_asignada);
  }

  // ── Abrir barrera de salida ──────────────────────────────────────────────
  // Dispara el endpoint de barrera en background (no bloquea la respuesta)
  try {
    const { accessController } = await import("../access/access.controller.js");
    await accessController.openExit();
  } catch (_) {
    // La barrera es best-effort; no fallamos si no está disponible
  }

  // ── Emitir evento Socket.IO (si existe) ──────────────────────────────────
  try {
    const { io } = await import("../../socket.js");
    io.emit("salida-escaner", {
      placa: ticket.placa_capturada,
      visitante: `${ticket.visitante_nombre || ""} ${ticket.visitante_apellido || ""}`.trim() || null,
      duracion_minutos,
      timestamp: ahora.toISOString(),
    });
  } catch (_) {
    // Socket.IO opcional
  }

  return res.json({
    ok: true,
    placa: ticket.placa_capturada,
    visitante_nombre: ticket.visitante_nombre || null,
    visitante_apellido: ticket.visitante_apellido || null,
    duracion_minutos,
    timestamp: ahora.toISOString(),
  });
}
```

---

## 3. Registro en `app.js`

```js
// IMPORT (junto a los demás imports)
import scannerRoutes from "./modules/scanner/scanner.routes.js";

// RUTA (junto a las demás rutas)
app.use("/api/scanner", scannerRoutes);
```

---

## Notas

- El token que el escáner USB lee tiene el formato `TICKET-{id_ticket}-{placa}` (ej: `TICKET-42-L010536`), exactamente como está impreso en el código de barras con `react-barcode` en el frontend.
- El controlador parsea ese prefijo para extraer el `id_ticket` y valida el estado antes de cerrar.
- Si tu backend no tiene Socket.IO, elimina el bloque `try { const { io } = ... }` — el panel ya se actualiza vía Supabase real-time (postgres_changes).
- Ajusta la ruta de `requireAuth` y `supabaseAdmin` a las que ya usas en tu proyecto Render.

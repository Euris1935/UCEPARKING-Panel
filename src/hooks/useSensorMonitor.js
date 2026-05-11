import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "../supabaseClient";

const UMBRAL_OFFLINE_MIN = 10;
const UMBRAL_ERROR_COUNT = 3;
const INTERVALO_CHECK_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Hook RF11 — Monitor automático de salud de sensores.
 *
 * Uso en Layout.jsx:
 *   const { sensoresOffline, sensoresConErrores } = useSensorMonitor(orgId);
 *
 * Expone:
 *   sensoresOffline       — array de dispositivos sin heartbeat (id_estado cambiado a 7)
 *   sensoresConErrores    — array de dispositivos con errores_seguidos >= UMBRAL
 *   checkAhora()          — forzar verificación manual
 */
export function useSensorMonitor(orgId) {
  const [sensoresOffline, setSensoresOffline] = useState([]);
  const [sensoresConErrores, setSensoresConErrores] = useState([]);
  const alertasEnviadasRef = useRef(new Set());

  const checkSensores = useCallback(async () => {
    if (!orgId) return;

    try {
      // 1. Llamar RPC — devuelve sensores Operativos (id_estado=6) sin heartbeat reciente
      const { data: offline, error: errOffline } = await supabase.rpc(
        "fn_detectar_sensores_offline",
        { p_organizacion_id: orgId, p_minutos_umbral: UMBRAL_OFFLINE_MIN },
      );

      if (errOffline) {
        console.error(
          "[SensorMonitor] fn_detectar_sensores_offline:",
          errOffline.message,
        );
      } else if (offline?.length) {
        for (const sensor of offline) {
          const key = `offline-${sensor.id_dispositivo}`;
          if (alertasEnviadasRef.current.has(key)) continue;

          // RPC atómica: cambia estado + inserta notificacion + evento
          const { error: errMark } = await supabase.rpc(
            "fn_marcar_sensor_offline",
            {
              p_id_dispositivo: sensor.id_dispositivo,
              p_organizacion_id: orgId,
            },
          );

          if (!errMark) {
            alertasEnviadasRef.current.add(key);
          } else {
            console.error(
              "[SensorMonitor] fn_marcar_sensor_offline:",
              errMark.message,
            );
          }
        }
      }

      // 2. Sensores con demasiados errores consecutivos (aún Operativos)
      const { data: conErrores, error: errErr } = await supabase
        .from("dispositivo")
        .select(
          `
          id_dispositivo,
          errores_seguidos,
          tipo:tipo_dispositivo!id_tipo(nombre),
          plaza:id_plaza(numero_plaza)
        `,
        )
        .eq("organizacion_id", orgId)
        .eq("activo", true)
        .eq("id_estado", 6)
        .gte("errores_seguidos", UMBRAL_ERROR_COUNT);

      if (!errErr) {
        for (const sensor of conErrores || []) {
          const key = `errores-${sensor.id_dispositivo}`;
          if (alertasEnviadasRef.current.has(key)) continue;

          await supabase.from("notificacion").insert([
            {
              organizacion_id: orgId,
              contenido: `ERROR SENSOR: ${sensor.tipo?.nombre || "Dispositivo"} (Plaza ${sensor.plaza?.numero_plaza || "N/A"}) acumula ${sensor.errores_seguidos} errores consecutivos. Verificar estado físico.`,
              leida: false,
              id_tipo: 5, // tipo_notificacion: Error
            },
          ]);

          alertasEnviadasRef.current.add(key);
        }
        setSensoresConErrores(conErrores || []);
      }

      // 3. Actualizar lista de offline para el banner en Layout
      const { data: actualesOffline } = await supabase
        .from("dispositivo")
        .select(
          `
          id_dispositivo,
          ultimo_heartbeat,
          errores_seguidos,
          tipo:tipo_dispositivo!id_tipo(nombre),
          plaza:id_plaza(numero_plaza)
        `,
        )
        .eq("organizacion_id", orgId)
        .eq("activo", true)
        .eq("id_estado", 7); // Fuera de Servicio

      setSensoresOffline(actualesOffline || []);
    } catch (err) {
      console.error("[SensorMonitor] Error inesperado:", err.message);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;

    checkSensores();
    const intervalo = setInterval(checkSensores, INTERVALO_CHECK_MS);

    // Escuchar cambios en dispositivo para limpiar alertas al reconectarse
    const channel = supabase
      .channel("sensor_monitor_watch")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dispositivo" },
        (payload) => {
          const prev = payload.old;
          const next = payload.new;

          // Sensor volvió a Operativo desde Fuera de Servicio o Fallo
          if (
            (prev?.id_estado === 7 || prev?.id_estado === 4) &&
            next?.id_estado === 6
          ) {
            alertasEnviadasRef.current.delete(`offline-${next.id_dispositivo}`);
            alertasEnviadasRef.current.delete(`errores-${next.id_dispositivo}`);
            setSensoresOffline((prev) =>
              prev.filter((s) => s.id_dispositivo !== next.id_dispositivo),
            );
          }

          // Sensor nuevo entró en Fuera de Servicio por trigger externo
          if (next?.id_estado === 7 && prev?.id_estado !== 7) {
            setSensoresOffline((prev) => {
              const yaExiste = prev.some(
                (s) => s.id_dispositivo === next.id_dispositivo,
              );
              if (yaExiste) return prev;
              return [
                ...prev,
                { id_dispositivo: next.id_dispositivo, ...next },
              ];
            });
          }
        },
      )
      .subscribe();

    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, [orgId, checkSensores]);

  return {
    sensoresOffline,
    sensoresConErrores,
    checkAhora: checkSensores,
  };
}

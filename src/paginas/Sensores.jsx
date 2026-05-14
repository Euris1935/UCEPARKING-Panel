import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Layout from "../componentes/Layout";
import Swal from "sweetalert2";
import {
  FaSearch,
  FaPlus,
  FaMicrochip,
  FaTrash,
  FaEdit,
  FaSync,
  FaTimesCircle,
  FaExclamationTriangle,
  FaCheckCircle,
  FaHistory,
  FaWifi,
  FaCog,
  FaCarSide,
} from "react-icons/fa";
import { useOrg } from "../contexts/OrgContext";
import SearchableSelect from "../componentes/SearchableSelect";
import { registrarLog, EVENT_TYPES } from "../utils/logging";

export default function Sensores() {
  const { orgId } = useOrg();
  const [dispositivos, setDispositivos] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [estadosEquipo, setEstadosEquipo] = useState([]);
  const [listaTipos, setListaTipos] = useState([]);
  const [listaMarcas, setListaMarcas] = useState([]);
  const [listaModelos, setListaModelos] = useState([]);
  const [configMap, setConfigMap] = useState({});
  const [incidencias, setIncidencias] = useState([]);
  const [activeTab, setActiveTab] = useState("dispositivos");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [enviandoConfig, setEnviandoConfig] = useState(false);
  const [configActual, setConfigActual] = useState(null);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const initialForm = {
    id_tipo: "",
    id_marca: "",
    id_modelo: "",
    id_plaza: "",
    id_estado: "",
    fecha_instalacion: new Date().toISOString().split("T")[0],
    ultimo_mantenimiento: "",
  };
  const initialConfig = {
    frecuencia_ms: 5000,
    umbral_ocupado: 70,
    umbral_libre: 30,
    modo_operacion: "activo",
    notas: "",
  };
  const [formData, setFormData] = useState(initialForm);
  const [configForm, setConfigForm] = useState(initialConfig);

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: ud } = await supabase
          .from("usuario")
          .select("id_persona")
          .eq("id", user.id)
          .maybeSingle();
        if (ud) setCurrentPersonaId(ud.id_persona);
      }
    };
    fetchUser();

    if (orgId) {
      loadData();
      const channel = supabase
        .channel("realtime_sensores")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dispositivo" },
          loadData,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "heartbeat_sensor" },
          loadData,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plaza" },
          loadData,
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [orgId]);

  useEffect(() => {
    if (activeTab === "incidencias" && orgId) cargarIncidencias();
  }, [activeTab, orgId]);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: dispData, error } = await supabase
        .from("dispositivo")
        .select(
          `
          *,
          tipo:tipo_dispositivo!id_tipo(id_tipo, nombre),
          modelo:modelo!id_modelo(id_modelo, nombre, id_marca, marca:marca(id_marca, nombre)),
          plaza:plaza!id_plaza(id_plaza, numero_plaza, zona:id_zona(id_zona, nombre, nivel_piso)),
          estado:estado_dispositivo!dispositivo_estado_fk(id_estado, nombre)
        `,
        )
        .eq("organizacion_id", orgId);
      
      if (error) throw error;

      const sorted = (dispData || []).sort((a, b) => {
        // 1. Por Nombre de Zona (A-Z)
        const zonaA = a.plaza?.zona?.nombre || "ZZZZ";
        const zonaB = b.plaza?.zona?.nombre || "ZZZZ";
        const cmpZona = zonaA.localeCompare(zonaB);
        if (cmpZona !== 0) return cmpZona;

        // 2. Por Número de Plaza (Secuencial)
        const numA = a.plaza?.numero_plaza || "ZZZZ";
        const numB = b.plaza?.numero_plaza || "ZZZZ";
        return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setDispositivos(sorted);

      // Cargar config de sensores para mostrar estado en tabla
      const { data: configs } = await supabase
        .from("config_sensor")
        .select("*")
        .eq("organizacion_id", orgId);

      const mapa = {};
      (configs || []).forEach((c) => {
        mapa[c.id_dispositivo] = c;
      });
      setConfigMap(mapa);

      const [
        { data: tTipos },
        { data: tMarcas },
        { data: tModelos },
        { data: pData },
        { data: eDisp },
      ] = await Promise.all([
        supabase
          .from("tipo_dispositivo")
          .select("id_tipo, nombre")
          .order("nombre"),
        supabase.from("marca").select("id_marca, nombre").order("nombre"),
        supabase
          .from("modelo")
          .select("id_modelo, nombre, id_marca")
          .order("nombre"),
        supabase
          .from("plaza")
          .select(
            "*, zona:id_zona(id_zona, nombre, estado_zona:id_estado(nombre))",
          )
          .eq("organizacion_id", orgId)
          .order("numero_plaza"),
        supabase
          .from("estado_dispositivo")
          .select("id_estado, nombre")
          .order("nombre"),
      ]);

      setListaTipos(tTipos || []);
      setListaMarcas(tMarcas || []);
      setListaModelos(tModelos || []);
      setPlazas(
        (pData || []).filter(
          (p) => (p.zona?.estado_zona?.nombre || "Activa") === "Activa",
        ),
      );
      setEstadosEquipo(
        (eDisp || []).filter(
          (e) => !e.nombre.toLowerCase().includes("mantenimiento"),
        ),
      );
    } catch (error) {
      console.error("Error crítico en loadData:", error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const cargarIncidencias = async () => {
    try {
      const { data } = await supabase
        .from("evento")
        .select(
          `
          id_log, fecha_hora, descripcion,
          tipo:tipo_evento!id_tipo(nombre),
          dispositivo:id_dispositivo(
            id_dispositivo,
            tipo:tipo_dispositivo!id_tipo(nombre),
            plaza:id_plaza(numero_plaza)
          )
        `,
        )
        .eq("organizacion_id", orgId)
        .in("id_tipo", [12, 13]) // 12=Dispositivo Offline, 13=Dispositivo Online
        .order("fecha_hora", { ascending: false })
        .limit(200);

      setIncidencias(data || []);
    } catch (err) {
      console.error("Error cargando incidencias:", err.message);
    }
  };

  // ── Abrir modal de edición y cargar config existente ──
  const handleEdit = (disp) => {
    setEditingId(disp.id_dispositivo);
    setFormData({
      id_tipo: disp.id_tipo || "",
      id_marca: disp.modelo?.id_marca || "",
      id_modelo: disp.id_modelo || "",
      id_plaza: disp.id_plaza ? String(disp.id_plaza) : "",
      id_estado: disp.id_estado ? String(disp.id_estado) : "",
      fecha_instalacion: disp.fecha_instalacion
        ? disp.fecha_instalacion.split("T")[0]
        : "",
      ultimo_mantenimiento: disp.ultimo_mantenimiento || "",
    });

    const cfgExistente = configMap[disp.id_dispositivo];
    if (cfgExistente) {
      setConfigForm({
        frecuencia_ms: cfgExistente.frecuencia_ms,
        umbral_ocupado: cfgExistente.umbral_ocupado,
        umbral_libre: cfgExistente.umbral_libre,
        modo_operacion: cfgExistente.modo_operacion,
        notas: cfgExistente.notas || "",
      });
      setConfigActual(cfgExistente);
    } else {
      setConfigForm(initialConfig);
      setConfigActual(null);
    }

    setShowConfigPanel(false);
    setShowModal(true);
  };

  // ── Enviar configuración remota (RF4) ──
  const handleEnviarConfig = async () => {
    if (!editingId || !orgId) return;
    setEnviandoConfig(true);
    try {
      // 1. Guardar/actualizar en Supabase (fuente de verdad)
      const { data: cfgGuardada, error: upsertErr } = await supabase
        .from("config_sensor")
        .upsert(
          {
            id_dispositivo: editingId,
            organizacion_id: orgId,
            frecuencia_ms: configForm.frecuencia_ms,
            umbral_ocupado: configForm.umbral_ocupado,
            umbral_libre: configForm.umbral_libre,
            modo_operacion: configForm.modo_operacion,
            notas: configForm.notas || null,
            estado_config: "pendiente",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id_dispositivo" },
        )
        .select()
        .single();

      if (upsertErr) throw upsertErr;
      setConfigActual(cfgGuardada);

      // 2. Intentar enviar al backend local (puede fallar si hardware no disponible)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`http://${window.location.hostname}:4000/api/sensor/config`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ id_dispositivo: editingId, ...configForm }),
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok) {
          await supabase
            .from("config_sensor")
            .update({
              estado_config: "aplicado",
              ultima_aplicacion: new Date().toISOString(),
            })
            .eq("id_dispositivo", editingId);

          setConfigActual((prev) => ({
            ...prev,
            estado_config: "aplicado",
            ultima_aplicacion: new Date().toISOString(),
          }));
          Swal.fire(
            "Configuración aplicada",
            "El sensor recibió los nuevos parámetros.",
            "success",
          );
        } else {
          Swal.fire(
            "Guardado en cola",
            "El sensor está offline. Los parámetros se aplicarán al reconectarse.",
            "warning",
          );
        }
      } catch {
        // Backend no disponible — queda en pendiente hasta siguiente heartbeat
        Swal.fire(
          "Guardado localmente",
          "Backend no disponible. Se aplicará cuando el sensor se conecte.",
          "info",
        );
      }

      await registrarLog({
        tipo_nombre: EVENT_TYPES.CONFIGURACION_CAMBIADA,
        descripcion: `Config remota guardada para dispositivo ID ${editingId}: ${configForm.frecuencia_ms}ms, umbral ${configForm.umbral_ocupado}%, modo ${configForm.modo_operacion}`,
        id_persona: currentPersonaId,
        organizacion_id: orgId,
        id_dispositivo: editingId,
        origen: "Panel Web - Hardware y Sensores",
      });

      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setEnviandoConfig(false);
    }
  };

  // ── Guardar datos del dispositivo ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const tipoObj = listaTipos.find(
      (t) => String(t.id_tipo) === String(formData.id_tipo),
    );

    try {
      const dispData = {
        id_tipo: parseInt(formData.id_tipo),
        id_modelo: parseInt(formData.id_modelo),
        id_plaza: formData.id_plaza || null,
        id_estado: parseInt(formData.id_estado) || null,
        fecha_instalacion: formData.fecha_instalacion,
        ultimo_mantenimiento: formData.ultimo_mantenimiento || null,
        ...(orgId ? { organizacion_id: orgId } : {}),
      };

      if (editingId) {
        const updateData = { ...dispData };
        delete updateData.organizacion_id;

        const { error } = await supabase
          .from("dispositivo")
          .update(updateData)
          .eq("id_dispositivo", editingId);
        if (error) throw error;

        const nombreEstado =
          estadosEquipo.find(
            (e) => String(e.id_estado) === String(formData.id_estado),
          )?.nombre || "N/A";
        const tipoLog = nombreEstado.toLowerCase().includes("operativo")
          ? EVENT_TYPES.DISPOSITIVO_ONLINE
          : nombreEstado.toLowerCase().includes("fuera") ||
              nombreEstado.toLowerCase().includes("fallo")
            ? EVENT_TYPES.DISPOSITIVO_OFFLINE
            : EVENT_TYPES.CAMBIO_ESTADO;

        await registrarLog({
          tipo_nombre: tipoLog,
          descripcion: `Actualización de ${tipoObj?.nombre || "Dispositivo"}: Estado → ${nombreEstado}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          id_dispositivo: editingId,
          origen: "Panel Web - Hardware y Sensores",
        });

        Swal.fire("Éxito", "Registro actualizado", "success");
      } else {
        const { data: nDisp, error } = await supabase
          .from("dispositivo")
          .insert([dispData])
          .select("id_dispositivo")
          .single();
        if (error) throw error;

        await registrarLog({
          tipo_nombre: EVENT_TYPES.DISPOSITIVO_ONLINE,
          descripcion: `Nuevo dispositivo registrado: ${tipoObj?.nombre || "Equipo"}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          id_dispositivo: nDisp.id_dispositivo,
          origen: "Panel Web - Hardware y Sensores",
        });

        Swal.fire("Éxito", "Registro creado", "success");
      }

      closeModal();
      loadData();
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingId(null);
    const estOperativo = estadosEquipo.find((e) =>
      e.nombre.toLowerCase().includes("operativo"),
    );
    setFormData({ ...initialForm, id_estado: estOperativo?.id_estado || "" });
    setConfigForm(initialConfig);
    setConfigActual(null);
    setShowConfigPanel(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(initialForm);
    setConfigForm(initialConfig);
    setConfigActual(null);
    setShowConfigPanel(false);
  };

  const handleDelete = async (disp) => {
    const result = await Swal.fire({
      title: "¿Eliminar dispositivo?",
      text: "Se borrará de forma permanente el registro técnico.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      confirmButtonColor: "#ef4444",
    });

    if (result.isConfirmed) {
      try {
        await Promise.all([
          supabase
            .from("evento")
            .update({ id_dispositivo: null })
            .eq("id_dispositivo", disp.id_dispositivo),
          supabase
            .from("mantenimiento")
            .update({ id_dispositivo: null })
            .eq("id_dispositivo", disp.id_dispositivo),
        ]);
        const { error } = await supabase
          .from("dispositivo")
          .delete()
          .eq("id_dispositivo", disp.id_dispositivo);
        if (error) throw error;

        await registrarLog({
          tipo_nombre: EVENT_TYPES.DISPOSITIVO_OFFLINE,
          descripcion: `Dispositivo eliminado: ${disp.tipo?.nombre || "Equipo"}`,
          id_persona: currentPersonaId,
          organizacion_id: orgId,
          origen: "Panel Web - Hardware y Sensores",
        });

        Swal.fire("Eliminado", "Dispositivo borrado correctamente", "success");
        loadData();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  const filteredDispositivos = dispositivos.filter((d) => {
    const b = searchTerm.toLowerCase();
    return (
      (d.tipo?.nombre || "").toLowerCase().includes(b) ||
      (d.plaza?.numero_plaza || "").toLowerCase().includes(b)
    );
  });

  const tabBtn = (id, label, icon) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${
        activeTab === id
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            Gestión de Hardware
          </h2>
          <p className="text-gray-500 font-medium">
            Dispositivos, sensores y configuración remota.
          </p>
        </div>
        {!showModal && activeTab === "dispositivos" && (
          <button
            onClick={handleNew}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition"
          >
            <FaPlus /> Nuevo Registro
          </button>
        )}
      </header>

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {tabBtn("dispositivos", "Dispositivos", <FaMicrochip />)}
        {tabBtn(
          "incidencias",
          "Incidencias Técnicas",
          <FaExclamationTriangle />,
        )}
      </div>

      {/* ══════════════════ TAB: DISPOSITIVOS ══════════════════ */}
      {activeTab === "dispositivos" && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <div className="relative w-72">
                  <input
                    type="text"
                    placeholder="Buscar por tipo o plaza..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-blue-500 outline-none text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <FaSearch className="absolute left-3 top-3 text-gray-400" />
                </div>
                <button
                  onClick={loadData}
                  disabled={isRefreshing}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition disabled:opacity-50"
                >
                  <FaSync className={isRefreshing ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 uppercase text-[10px] text-gray-500 font-black tracking-widest sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-4 text-left">Hardware</th>
                      <th className="px-6 py-4 text-left">Marca / Modelo</th>
                      <th className="px-6 py-4 text-left">Plaza</th>
                      <th className="px-6 py-4 text-left">Último Ping</th>
                      <th className="px-6 py-4 text-left">Config</th>
                      <th className="px-6 py-4 text-left">Registro</th>
                      <th className="px-6 py-4 text-left">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredDispositivos.map((disp) => {
                      const cfg = configMap[disp.id_dispositivo];
                      const minutosSinPing = disp.ultimo_heartbeat
                        ? Math.round(
                            (Date.now() - new Date(disp.ultimo_heartbeat)) /
                              60000,
                          )
                        : null;

                      return (
                        <tr
                          key={disp.id_dispositivo}
                          className="hover:bg-gray-50/50 transition group"
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900 uppercase text-xs">
                              {disp.tipo?.nombre}
                            </div>
                            {disp.errores_seguidos > 0 && (
                              <div className="text-[9px] text-orange-600 font-black mt-0.5">
                                {disp.errores_seguidos} error(es) seguido(s)
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600">
                            {disp.modelo?.marca?.nombre} — {disp.modelo?.nombre}
                          </td>
                          <td className="px-6 py-4">
                            {disp.plaza ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-md w-fit">
                                  <span className="text-[9px] font-black text-emerald-600 uppercase">
                                    Plaza
                                  </span>
                                  <span className="text-sm font-black text-emerald-700">
                                    {disp.plaza.numero_plaza}
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase">
                                  {disp.plaza.zona?.nombre} ·{" "}
                                  {disp.plaza.zona?.nivel_piso === 0
                                    ? "P.Baja"
                                    : `Piso ${disp.plaza.zona?.nivel_piso}`}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">
                                Sin plaza
                              </span>
                            )}
                          </td>

                          {/* ── Columna: Último heartbeat ── */}
                          <td className="px-6 py-4">
                            {disp.ultimo_heartbeat ? (
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-full w-fit ${
                                    minutosSinPing < 10
                                      ? "bg-green-100 text-green-700"
                                      : minutosSinPing < 30
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {minutosSinPing < 1
                                    ? "Hace un momento"
                                    : `${minutosSinPing}min atrás`}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono">
                                  {new Date(
                                    disp.ultimo_heartbeat,
                                  ).toLocaleTimeString("es-DO", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-300 italic">
                                Sin registro
                              </span>
                            )}
                          </td>

                          {/* ── Columna: Estado config RF4 ── */}
                          <td className="px-6 py-4">
                            {cfg ? (
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full w-fit ${
                                    cfg.estado_config === "aplicado"
                                      ? "bg-green-100 text-green-700"
                                      : cfg.estado_config === "error"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {cfg.estado_config}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono">
                                  {cfg.frecuencia_ms}ms · {cfg.umbral_ocupado}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-300 italic">
                                Sin config
                              </span>
                            )}
                          </td>

                          {/* ── Columna: Registro ── */}
                          <td className="px-6 py-4">
                            <div className="text-[10px] font-bold text-gray-500 uppercase">
                              {disp.created_at ? new Date(disp.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                            </div>
                            <div className="text-[9px] text-gray-400">
                              {disp.created_at ? new Date(disp.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {disp.estado ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase w-fit block ${
                                  disp.estado.nombre
                                    .toLowerCase()
                                    .includes("operativo")
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : disp.estado.nombre
                                          .toLowerCase()
                                          .includes("fuera") ||
                                        disp.estado.nombre
                                          .toLowerCase()
                                          .includes("fallo")
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : "bg-orange-50 text-orange-700 border-orange-200"
                                }`}
                              >
                                {disp.estado.nombre}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-[10px]">
                                N/A
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEdit(disp)}
                                className="text-blue-500 hover:text-blue-700"
                              >
                                <FaEdit size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(disp)}
                                className="text-red-400 hover:text-red-600"
                              >
                                <FaTrash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ══ Panel lateral: Formulario + Config ══ */}
          {showModal && (
            <aside className="w-full lg:w-[420px] flex-shrink-0">
              <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                    <FaMicrochip className="text-blue-600" />{" "}
                    {editingId ? "Editar Hardware" : "Nuevo Hardware"}
                  </h3>
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <FaTimesCircle size={18} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Tipo */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                      Tipo de equipo *
                    </label>
                    <SearchableSelect
                      options={listaTipos.map((t) => ({
                        value: t.id_tipo,
                        label: t.nombre,
                      }))}
                      value={formData.id_tipo}
                      onChange={(val) =>
                        setFormData({ ...formData, id_tipo: val })
                      }
                      placeholder="— Seleccionar tipo —"
                      focusRingClass="focus:ring-blue-500"
                      selectedItemClass="bg-blue-100 text-blue-800"
                    />
                  </div>

                  {/* Marca + Modelo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                        Marca *
                      </label>
                      <SearchableSelect
                        options={listaMarcas.map((m) => ({
                          value: m.id_marca,
                          label: m.nombre,
                        }))}
                        value={formData.id_marca}
                        onChange={(val) =>
                          setFormData({
                            ...formData,
                            id_marca: val,
                            id_modelo: "",
                          })
                        }
                        placeholder="— Marca —"
                        focusRingClass="focus:ring-blue-500"
                        selectedItemClass="bg-blue-100 text-blue-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                        Modelo *
                      </label>
                      <select
                        className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50"
                        value={formData.id_modelo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            id_modelo: e.target.value,
                          })
                        }
                        required
                        disabled={!formData.id_marca}
                      >
                        <option value="">— Modelo —</option>
                        {listaModelos
                          .filter(
                            (m) =>
                              String(m.id_marca) === String(formData.id_marca),
                          )
                          .map((m) => (
                            <option key={m.id_modelo} value={m.id_modelo}>
                              {m.nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Plaza + Fecha */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                        Plaza
                      </label>
                      <SearchableSelect
                        options={(() => {
                          const opts = [];
                          const plazasDisponibles = plazas.filter((p) => {
                            const ocupada = dispositivos.some(
                              (d) =>
                                String(d.id_plaza) === String(p.id_plaza) &&
                                String(d.id_dispositivo) !== String(editingId)
                            );
                            return !ocupada;
                          });
                          const zonas = [
                            ...new Set(plazasDisponibles.map((p) => p.zona?.nombre)),
                          ].sort();
                          zonas.forEach((z) => {
                            opts.push({
                              label: z || "Sin Zona",
                              isGroup: true,
                            });
                            plazasDisponibles
                              .filter((p) => p.zona?.nombre === z)
                              .forEach((p) =>
                                opts.push({
                                  value: p.id_plaza,
                                  label: p.numero_plaza,
                                }),
                              );
                          });
                          return opts;
                        })()}
                        value={formData.id_plaza}
                        onChange={(val) =>
                          setFormData({ ...formData, id_plaza: val })
                        }
                        placeholder="— Ninguna —"
                        focusRingClass="focus:ring-blue-500"
                        selectedItemClass="bg-blue-100 text-blue-800"
                        groupLabelClass="text-blue-600 bg-blue-50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                        Fecha instalación
                      </label>
                      <input
                        type="date"
                        className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50"
                        value={formData.fecha_instalacion}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            fecha_instalacion: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Estado operativo */}
                  <div>
                    <label className="text-[10px] font-black text-blue-600 uppercase mb-1 block">
                      Estado operativo
                    </label>
                    <select
                      className={`border p-2 rounded-lg w-full text-sm outline-none focus:ring-blue-500 bg-white font-bold ${!editingId ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      value={formData.id_estado}
                      onChange={(e) =>
                        setFormData({ ...formData, id_estado: e.target.value })
                      }
                      required
                      disabled={!editingId}
                    >
                      {!editingId && <option value="">Auto: Operativo</option>}
                      {estadosEquipo.map((est) => (
                        <option key={est.id_estado} value={est.id_estado}>
                          {est.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editingId && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">
                        Último mantenimiento
                      </label>
                      <input
                        type="date"
                        className="w-full border p-2 rounded-lg text-sm outline-none focus:ring-blue-500 bg-gray-50"
                        value={formData.ultimo_mantenimiento}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            ultimo_mantenimiento: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold tracking-wide transition shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <FaMicrochip />{" "}
                    {loading
                      ? "PROCESANDO..."
                      : editingId
                        ? "ACTUALIZAR"
                        : "REGISTRAR"}
                  </button>
                </form>

                {/* ══ Panel de Configuración Remota RF4 ══ */}
                {editingId && (
                  <div className="border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowConfigPanel((v) => !v)}
                      className="w-full flex justify-between items-center text-[10px] font-black text-blue-600 uppercase tracking-widest py-1"
                    >
                      <span className="flex items-center gap-2">
                        <FaCog /> Configuración remota (RF4)
                        {configActual && (
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-black ${
                              configActual.estado_config === "aplicado"
                                ? "bg-green-100 text-green-700"
                                : configActual.estado_config === "error"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {configActual.estado_config}
                          </span>
                        )}
                      </span>
                      <span>{showConfigPanel ? "▲" : "▼"}</span>
                    </button>

                    {showConfigPanel && (
                      <div className="mt-4 space-y-4 bg-blue-50/30 p-4 rounded-xl border border-blue-100">
                        {/* Frecuencia */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            Frecuencia de muestreo
                            <span className="ml-2 text-blue-600 font-black">
                              {configForm.frecuencia_ms}ms
                            </span>
                          </label>
                          <input
                            type="range"
                            min="500"
                            max="30000"
                            step="500"
                            value={configForm.frecuencia_ms}
                            onChange={(e) =>
                              setConfigForm((f) => ({
                                ...f,
                                frecuencia_ms: parseInt(e.target.value),
                              }))
                            }
                            className="w-full accent-blue-600"
                          />
                          <div className="flex justify-between text-[9px] text-gray-400">
                            <span>500ms</span>
                            <span>30s</span>
                          </div>
                        </div>

                        {/* Umbrales */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              Umbral ocupado (%)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={configForm.umbral_ocupado}
                              onChange={(e) =>
                                setConfigForm((f) => ({
                                  ...f,
                                  umbral_ocupado: parseInt(e.target.value),
                                }))
                              }
                              className="w-full border rounded-lg p-2 text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              Umbral libre (%)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={configForm.umbral_libre}
                              onChange={(e) =>
                                setConfigForm((f) => ({
                                  ...f,
                                  umbral_libre: parseInt(e.target.value),
                                }))
                              }
                              className="w-full border rounded-lg p-2 text-sm bg-white"
                            />
                          </div>
                        </div>

                        {/* Modo operación */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            Modo de operación
                          </label>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
                            {["activo", "pasivo", "calibracion"].map((modo) => (
                              <button
                                key={modo}
                                type="button"
                                onClick={() =>
                                  setConfigForm((f) => ({
                                    ...f,
                                    modo_operacion: modo,
                                  }))
                                }
                                className={`py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                                  configForm.modo_operacion === modo
                                    ? "bg-white text-blue-600 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                }`}
                              >
                                {modo}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Notas */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                            Notas
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Observaciones..."
                            value={configForm.notas}
                            onChange={(e) =>
                              setConfigForm((f) => ({
                                ...f,
                                notas: e.target.value,
                              }))
                            }
                            className="w-full border rounded-lg p-2 text-sm bg-white resize-none"
                          />
                        </div>

                        {/* Estado aplicado */}
                        {configActual && (
                          <div
                            className={`flex items-center gap-2 p-2 rounded-lg text-[10px] font-bold ${
                              configActual.estado_config === "aplicado"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : configActual.estado_config === "error"
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                            }`}
                          >
                            {configActual.estado_config === "aplicado" && (
                              <FaCheckCircle size={10} />
                            )}
                            {configActual.estado_config === "error" && (
                              <FaExclamationTriangle size={10} />
                            )}
                            {configActual.estado_config === "pendiente" && (
                              <FaSync size={10} className="animate-spin" />
                            )}
                            <span>
                              {configActual.estado_config === "aplicado"
                                ? "Configuración aplicada"
                                : configActual.estado_config === "error"
                                  ? "Error al aplicar"
                                  : "Pendiente de envío"}
                            </span>
                            {configActual.ultima_aplicacion && (
                              <span className="ml-auto opacity-60">
                                {new Date(
                                  configActual.ultima_aplicacion,
                                ).toLocaleTimeString("es-DO")}
                              </span>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleEnviarConfig}
                          disabled={enviandoConfig}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {enviandoConfig ? (
                            <FaSync className="animate-spin" />
                          ) : (
                            <FaCog />
                          )}
                          {enviandoConfig
                            ? "Enviando..."
                            : "Enviar configuración al sensor"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </aside>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: INCIDENCIAS RF11 ══════════════════ */}
      {activeTab === "incidencias" && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-800">
                Historial de Incidencias Técnicas
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Eventos de conexión/desconexión detectados automáticamente.
              </p>
            </div>
            <button
              onClick={cargarIncidencias}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
            >
              <FaSync />
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-black text-gray-400 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Fecha / Hora</th>
                  <th className="px-5 py-3 text-left">Evento</th>
                  <th className="px-5 py-3 text-left">Dispositivo</th>
                  <th className="px-5 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {incidencias.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-12 text-gray-400">
                      <FaWifi className="mx-auto text-3xl mb-2 opacity-20" />
                      <p className="text-sm">Sin incidencias registradas.</p>
                    </td>
                  </tr>
                ) : (
                  incidencias.map((inc) => {
                    const esOffline = inc.tipo?.nombre?.includes("Offline");
                    return (
                      <tr
                        key={inc.id_log}
                        className="hover:bg-gray-50 transition"
                      >
                        <td className="px-5 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {new Date(inc.fecha_hora).toLocaleString("es-DO", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase w-fit ${
                              esOffline
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : "bg-green-100 text-green-700 border border-green-200"
                            }`}
                          >
                            {esOffline ? (
                              <FaExclamationTriangle size={9} />
                            ) : (
                              <FaCheckCircle size={9} />
                            )}
                            {inc.tipo?.nombre}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-gray-700 whitespace-nowrap">
                          {inc.dispositivo?.tipo?.nombre || "—"}
                          {inc.dispositivo?.plaza?.numero_plaza && (
                            <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                              Plaza {inc.dispositivo.plaza.numero_plaza}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-5 py-3 text-xs text-gray-500 max-w-sm truncate"
                          title={inc.descripcion}
                        >
                          {inc.descripcion}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

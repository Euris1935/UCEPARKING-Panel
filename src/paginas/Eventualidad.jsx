import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import { useOrg } from '../contexts/OrgContext';
import { EVENT_TYPES, registrarLog } from '../utils/logging';
import { FaExclamationTriangle, FaSearch, FaTimesCircle, FaShieldAlt } from 'react-icons/fa';
import Swal from 'sweetalert2';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Eventualidad() {
  const { orgId } = useOrg();
  const [eventualidades, setEventualidades] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ id_vehiculo: '', motivo: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (orgId) {
      loadEventualidades();
      loadVehiculos();
    }
  }, [orgId]);

  const loadEventualidades = async () => {
    setIsRefreshing(true);
    setLoading(true);
    try {
      const { data: tipoAlerta } = await supabase
        .from('tipo_evento')
        .select('id_tipo')
        .eq('nombre', EVENT_TYPES.EVENTUALIDAD)
        .single();

      if (!tipoAlerta) throw new Error("No se encontró el tipo de evento Alerta");

      const { data, error } = await supabase
        .from('evento')
        .select(`
          id_log, fecha_hora, descripcion,
          persona:id_persona(nombre, apellido, cedula)
        `)
        .eq('organizacion_id', orgId)
        .eq('id_tipo', tipoAlerta.id_tipo)
        .order('fecha_hora', { ascending: false });

      if (error) throw error;
      setEventualidades(data || []);
    } catch (e) {
      console.error("Error al cargar eventualidades:", e.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadVehiculos = async () => {
    try {
      const { data, error } = await supabase
        .from('vehiculo')
        .select(`
          id_vehiculo, placa, id_persona,
          persona:id_persona(nombre, apellido)
        `)
        .eq('organizacion_id', orgId)
        .not('id_persona', 'is', null);

      if (error) throw error;
      setVehiculos(data || []);
    } catch (e) {
      console.error("Error al cargar vehículos:", e.message);
    }
  };

  const filteredEventualidades = eventualidades.filter((ev) => {
    const s = searchTerm.toLowerCase();
    const desc = ev.descripcion?.toLowerCase() || '';
    const n = ev.persona ? `${ev.persona.nombre} ${ev.persona.apellido}`.toLowerCase() : '';
    return desc.includes(s) || n.includes(s);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id_vehiculo || !form.motivo.trim()) {
      return Swal.fire('Atención', 'Seleccione un vehículo y escriba el motivo.', 'warning');
    }

    const vSelected = vehiculos.find(v => String(v.id_vehiculo) === String(form.id_vehiculo));
    if (!vSelected) return;

    setSubmitting(true);
    try {
      // 1. Registrar la Eventualidad (Log)
      const descFinal = `[Vehículo: ${vSelected.placa}] ${form.motivo}`;
      await registrarLog({
        tipo_nombre: EVENT_TYPES.EVENTUALIDAD,
        descripcion: descFinal,
        id_persona: vSelected.id_persona,
        organizacion_id: orgId
      });

      // 2. Comprobar la Regla de los 3 Strikes
      const { data: tipoAlerta } = await supabase
        .from('tipo_evento')
        .select('id_tipo')
        .eq('nombre', EVENT_TYPES.EVENTUALIDAD)
        .single();

      const { count } = await supabase
        .from('evento')
        .select('*', { count: 'exact', head: true })
        .eq('id_persona', vSelected.id_persona)
        .eq('id_tipo', tipoAlerta.id_tipo);

      let mensajeExito = 'La eventualidad ha sido registrada en el sistema.';

      // Si con esta (ya contada porque la insertamos arriba) llega a 3 o más
      if (count >= 3) {
        // Bloquear el vehículo
        await supabase
          .from('vehiculo')
          .update({ id_estado: 2 }) // 2 = Inactivo/Bloqueado
          .eq('id_vehiculo', vSelected.id_vehiculo);

        mensajeExito += `<br><br><b style="color:red">¡LÍMITE ALCANZADO (3)!</b><br>El vehículo placa <b>${vSelected.placa}</b> ha sido inhabilitado automáticamente.`;
      }

      Swal.fire({
        icon: 'success',
        title: 'Registrado',
        html: mensajeExito
      });

      setForm({ id_vehiculo: '', motivo: '' });
      setShowModal(false);
      loadEventualidades();

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Ocurrió un problema al registrar la eventualidad.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Eventualidades</h2>
          <p className="text-gray-500 font-medium">Registro de incidentes o eventualidades y control de bloqueos automáticos.</p>
        </div>
        {!showModal && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white py-2.5 px-6 rounded-lg font-bold shadow flex items-center gap-2 transition"
          >
            <FaExclamationTriangle /> Registrar Eventualidad
          </button>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <div className="relative w-72">
                <input
                  type="text"
                  placeholder="Buscar por placa o persona..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-red-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
              </div>
              <button
                onClick={loadEventualidades}
                disabled={isRefreshing}
                className="p-2 text-red-600 hover:bg-red-50 rounded-full transition disabled:opacity-50"
              >
                <FaShieldAlt className={isRefreshing ? 'animate-spin' : ''} size={18} />
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <p className="text-center text-gray-400 py-10 font-bold">Cargando eventualidades...</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 uppercase text-[10px] text-gray-500 font-black tracking-widest sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-left">Fecha y Hora</th>
                      <th className="px-6 py-4 text-left">Usuario Involucrado</th>
                      <th className="px-6 py-4 text-left">Detalle de Eventualidad</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredEventualidades.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="text-center text-gray-400 py-8">No se encontraron eventualidades.</td>
                      </tr>
                    ) : (
                      filteredEventualidades.map(ev => (
                        <tr key={ev.id_log} className="hover:bg-red-50/30 transition group">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {new Date(ev.fecha_hora).toLocaleString('es-DO', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-800">
                            {ev.persona ? `${ev.persona.nombre} ${ev.persona.apellido}` : 'Desconocido'}
                          </td>
                          <td className="px-6 py-4 text-gray-600 text-xs">
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 w-fit mb-1 border border-red-200">
                              <FaExclamationTriangle size={9} /> FALTA REGISTRADA
                            </span>
                            {ev.descripcion}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Modal Lateral */}
        {showModal && (
          <aside className="w-full lg:w-[400px] flex-shrink-0">
            <section className="bg-white p-6 rounded-2xl shadow-lg border border-red-100 sticky top-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <FaExclamationTriangle className="text-red-600" /> Nueva Eventualidad
                </h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimesCircle size={18} />
                </button>
              </div>

              <div className="bg-red-50 p-3 rounded-lg border border-red-100 mb-4 text-xs text-red-800 leading-relaxed font-medium">
                Al registrar 3 eventualidades a una misma persona, su vehículo será inhabilitado automáticamente.
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Vehículo / Placa *</label>
                  <SearchableSelect
                    options={vehiculos.map(v => ({
                      value: v.id_vehiculo,
                      label: `${v.placa} — ${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`
                    }))}
                    value={form.id_vehiculo}
                    onChange={(val) => setForm({ ...form, id_vehiculo: val })}
                    placeholder="— Seleccione un vehículo —"
                    focusRingClass="focus:ring-red-500"
                    selectedItemClass="bg-red-100 text-red-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Motivo / Detalle *</label>
                  <textarea
                    rows={4}
                    className="w-full border p-2 rounded-lg text-sm resize-none focus:ring-red-500 bg-gray-50 outline-none"
                    placeholder="Ej. Se parqueó en zona de discapacitados sin autorización..."
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-black tracking-wider text-[11px] uppercase transition shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? 'REGISTRANDO...' : 'REGISTRAR EVENTUALIDAD'}
                </button>
              </form>
            </section>
          </aside>
        )}
      </div>
    </Layout>
  );
}

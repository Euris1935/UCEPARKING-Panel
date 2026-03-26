import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaUserPlus, FaDoorOpen, FaSignOutAlt, FaList, FaSearch } from 'react-icons/fa';

export default function AccesoManual() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('entrada'); // 'entrada' | 'activos'

  // Datos
  const [vehiculos, setVehiculos] = useState([]);
  const [todasPlazas, setTodasPlazas] = useState([]);
  const [plazasLibres, setPlazasLibres] = useState([]);
  const [accesosActivos, setAccesosActivos] = useState([]);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  // Formulario Entrada Manual
  const [entradaForm, setEntradaForm] = useState({
    vehiculo_id: '',
    id_plaza: '',
    puertaDestino: 'main'
  });

  const [busquedaVehiculo, setBusquedaVehiculo] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [busquedaActivos, setBusquedaActivos] = useState(''); // #25: búsqueda en accesos activos

  const vehiculosFiltrados = vehiculos.filter(v =>
    (v.placa && v.placa.toLowerCase().includes(busquedaVehiculo.toLowerCase())) ||
    (v.personas?.nombre && v.personas.nombre.toLowerCase().includes(busquedaVehiculo.toLowerCase())) ||
    (v.personas?.apellido && v.personas.apellido.toLowerCase().includes(busquedaVehiculo.toLowerCase()))
  );

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('usuarios').select('id_persona').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.id_persona);
      }
    };
    init();
    loadData();

    // Suscripción tiempo real a registros_acceso y plazas
    const ch = supabase.channel('rt_am')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_acceso' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadData = async () => {
    try {
      // Plazas: obtener todas para mapear los nombres, y filtrar las libres para el dropdown
      const { data: plazas } = await supabase.from('plazas').select('*').order('Numero_Plaza');
      if (plazas) {
        setTodasPlazas(plazas);
        setPlazasLibres(plazas.filter(p => p.id_estado === 1));
      }

      // Vehículos registrados (con dueños)
      const { data: vhs, error: vErr } = await supabase
        .from('vehiculos')
        .select('*, marcas_vehiculo(nombre), modelos_vehiculo(nombre), colores_vehiculo(nombre), personas(nombre, apellido, telefono)')
        .order('Fecha_Registro', { ascending: false });
      if (vErr) console.error('Error cargando vehiculos:', vErr);

      // Accesos activos (entradas manuales sin salida)
      // Eliminamos plazas(Numero_Plaza) del select porque no hay Foreign Key en la BD para eso
      const { data: activos, error: activosErr } = await supabase
        .from('registros_acceso')
        .select('*, vehiculos(placa, id_persona, marcas_vehiculo(nombre), modelos_vehiculo(nombre), colores_vehiculo(nombre), personas(nombre, apellido, telefono))')
        .is('salida_at', null)
        .order('entrada_at', { ascending: false });

      if (activosErr) console.error('Error cargando accesos activos:', activosErr);

      setVehiculos(vhs || []);
      setAccesosActivos(activos || []);

    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const registrarLog = async (tipo, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Acceso Manual').maybeSingle();
      await supabase.from('eventos').insert([{
        Fecha_Hora: new Date().toISOString(),
        Descripcion: descripcion,
        Id_Plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo_evento: te?.id_tipo || null,
        id_origen_evento: oe?.id_origen || null
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const handleRegistrarEntrada = async (e) => {
    e.preventDefault();
    if (!entradaForm.vehiculo_id) return Swal.fire('Atención', 'Seleccione un vehículo/cliente.', 'warning');
    if (!entradaForm.id_plaza) return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');

    setLoading(true);
    try {
      const vehiculoSelect = vehiculos.find(v => v.id_vehiculo === parseInt(entradaForm.vehiculo_id));

      // Validación: Verificar si el vehículo ya tiene un acceso activo
      const vehiculoYaEstaAdentro = accesosActivos.find(a => a.id_vehiculo === vehiculoSelect.id_vehiculo);
      if (vehiculoYaEstaAdentro) {
        setLoading(false);
        return Swal.fire('Acceso Denegado', 'Este vehículo ya tiene un acceso activo registrado y no ha salido del parqueo.', 'error');
      }

      const plazaSelect = plazasLibres.find(p => p.Id_Plaza === parseInt(entradaForm.id_plaza));

      // 1. Insertar Registro de Acceso
      const { error: raErr } = await supabase
        .from('registros_acceso')
        .insert({
          entrada_at: new Date().toISOString(),
          id_vehiculo: vehiculoSelect.id_vehiculo,
          ticket_id: null,
          Id_Plaza: plazaSelect.Id_Plaza,
          id_dispositivo_entrada: null
        });
      if (raErr) throw raErr;

      // 2. Actualizar Plaza
      await supabase.from('plazas').update({
        id_estado: 2
      }).eq('Id_Plaza', plazaSelect.Id_Plaza);

      // 3. Log
      await registrarLog(
        'ACCESO_MANUAL_ENTRADA',
        `Entrada manual: ${vehiculoSelect.placa} — ${vehiculoSelect.personas?.nombre} ${vehiculoSelect.personas?.apellido} — Plaza ${plazaSelect.Numero_Plaza}.`,
        plazaSelect.Id_Plaza
      );

      // 4. Abrir Barrera (Principal o VIP)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch(`http://localhost:4000/api/access/open-${entradaForm.puertaDestino}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => { });
        }
      } catch (_) { }

      const nombrePuerta = entradaForm.puertaDestino === 'vip' ? 'VIP' : 'Principal';
      Swal.fire('¡Éxito!', `Entrada registrada para ${vehiculoSelect.placa}. Barrera ${nombrePuerta} abriéndose.`, 'success');
      setEntradaForm({ vehiculo_id: '', id_plaza: '', puertaDestino: 'main' });
      setBusquedaVehiculo('');
      setActiveTab('activos');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
    setLoading(false);
  };

  const handleRegistrarSalida = async (acceso) => {
    const plazaEncontrada = todasPlazas.find(p => p.Id_Plaza === acceso.Id_Plaza);
    const result = await Swal.fire({
      title: '¿Registrar Salida Manual?',
      html: `Vehículo: <b>${acceso.vehiculos?.placa}</b><br/>Plaza: <b>${plazaEncontrada?.Numero_Plaza || 'No asig.'}</b><br/><br/><span class="text-sm text-gray-500">Seleccione la barrera a abrir:</span>`,
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonColor: '#16a34a',
      denyButtonColor: '#9333ea',
      confirmButtonText: 'Abrir Principal',
      denyButtonText: 'Abrir VIP',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed && !result.isDenied) return;

    const barreraSalida = result.isConfirmed ? 'main' : 'vip';

    try {
      const ahora = new Date().toISOString();

      // 1. Marcar salida en registros_acceso
      const { error: raErr } = await supabase
        .from('registros_acceso')
        .update({ salida_at: ahora })
        .eq('id_registro', acceso.id_registro);
      if (raErr) throw raErr;

      // 2. Liberar Plaza si existe
      if (acceso.Id_Plaza) {
        await supabase.from('plazas').update({
          id_estado: 1
        }).eq('Id_Plaza', acceso.Id_Plaza);
      }

      // 3. Log — incluye nombre de persona (#16)
      const nombreSalida = `${acceso.vehiculos?.personas?.nombre || ''} ${acceso.vehiculos?.personas?.apellido || ''}`.trim() || 'Desconocido';
      await registrarLog(
        'ACCESO_MANUAL_SALIDA',
        `Salida manual: ${nombreSalida} — ${acceso.vehiculos?.placa} — Plaza ${plazaEncontrada?.Numero_Plaza || 'N/A'}.`,
        acceso.Id_Plaza
      );

      // 4. Abrir Barrera
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch(`http://localhost:4000/api/access/open-${barreraSalida}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => { });
        }
      } catch (_) { }

      const nombrePuertaSalida = barreraSalida === 'vip' ? 'VIP' : 'Principal';
      Swal.fire('¡Salida Registrada!', `La plaza quedó libre y la barrera ${nombrePuertaSalida} se está abriendo.`, 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const apiControlBarrera = async (endpoint, tituloConfirmacion) => {
    const res = await Swal.fire({
      title: tituloConfirmacion,
      text: "Esto abrirá la barrera físicamente.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#eab308',
      confirmButtonText: 'Sí, abrir',
      cancelButtonText: 'Cancelar'
    });
    if (res.isConfirmed) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const respuesta = await fetch(`http://localhost:4000/api/access/${endpoint}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        if (respuesta.ok) {
          Swal.fire('Barrera Abierta', 'El comando se ha enviado exitosamente.', 'success');
          registrarLog('APERTURA_MANUAL_BARRERA', `Apertura manual de ${tituloConfirmacion}`);
        } else {
          Swal.fire('Error', 'El servidor respondió con un error.', 'error');
        }
      } catch (e) {
        Swal.fire('Error de Conexión', 'No se pudo conectar con el backend local (Arduino).', 'error');
      }
    }
  };

  const formatearFecha = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-DO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  const tabBtn = (id, label, icon) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${activeTab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'
        }`}
    >
      {icon} {label}
      {id === 'activos' && accesosActivos.length > 0 && (
        <span className="ml-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{accesosActivos.length}</span>
      )}
    </button>
  );

  return (
    <Layout>
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Acceso Manual</h2>
          <p className="text-gray-500 mt-1">Dar acceso manual a clientes registrados sin LPR.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => apiControlBarrera('open-main', '¿Abrir Barrera Principal?')}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 font-bold rounded-lg shadow transition flex items-center gap-2"
          >
            PUERTA PRINCIPAL
          </button>
          <button
            onClick={() => apiControlBarrera('open-vip', '¿Abrir Barrera VIP?')}
            className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 font-bold rounded-lg shadow transition flex items-center gap-2"
          >
            PUERTA VIP
          </button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada', 'Nueva Entrada Manual', <FaDoorOpen />)}
        {tabBtn('activos', 'Accesos Activos', <FaList />)}
      </div>

      {activeTab === 'entrada' && (
        <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 max-w-2xl">
          <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
            <FaUserPlus className="text-indigo-600" /> Registrar Entrada
          </h3>
          <form onSubmit={handleRegistrarEntrada} className="space-y-4">
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Vehículo (Placa / Cliente) *</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 text-sm focus:ring-indigo-500 bg-gray-50 uppercase"
                placeholder="Ej. ABC-1234 o nombre..."
                value={busquedaVehiculo}
                onChange={(e) => {
                  setBusquedaVehiculo(e.target.value);
                  setMostrarDropdown(true);
                  if (entradaForm.vehiculo_id) {
                    setEntradaForm({ ...entradaForm, vehiculo_id: '' });
                  }
                }}
                onFocus={() => setMostrarDropdown(true)}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                required={!entradaForm.vehiculo_id}
              />

              {mostrarDropdown && (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 shadow-xl max-h-60 overflow-y-auto rounded-lg mt-1">
                  {vehiculosFiltrados.length === 0 ? (
                    <li className="p-3 text-sm text-gray-500 text-center">No se encontraron vehículos</li>
                  ) : (
                    vehiculosFiltrados.map(v => (
                      <li
                        key={v.id_vehiculo}
                        className="p-3 hover:bg-indigo-50 border-b last:border-0 cursor-pointer transition-colors"
                        onMouseDown={() => {
                          setEntradaForm({ ...entradaForm, vehiculo_id: v.id_vehiculo });
                          setBusquedaVehiculo(`${v.placa} — ${v.personas?.nombre} ${v.personas?.apellido}`);
                          setMostrarDropdown(false);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-indigo-700 text-base font-mono">{v.placa}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 border">{v.marcas_vehiculo?.nombre} {v.modelos_vehiculo?.nombre}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <FaUserPlus className="text-[10px]" /> {v.personas?.nombre} {v.personas?.apellido}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignar Plaza *</label>
              <select
                className="w-full border rounded-lg p-2 text-sm focus:ring-indigo-500 bg-gray-50"
                value={entradaForm.id_plaza}
                onChange={(e) => setEntradaForm({ ...entradaForm, id_plaza: e.target.value })}
                required
              >
                <option value="">— Seleccione una plaza libre —</option>
                {plazasLibres.map(p => (
                  <option key={p.Id_Plaza} value={p.Id_Plaza}>
                    Plaza {p.Numero_Plaza}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puerta de Acceso *</label>
              <select
                className="w-full border rounded-lg p-2 text-sm focus:ring-indigo-500 bg-gray-50"
                value={entradaForm.puertaDestino}
                onChange={(e) => setEntradaForm({ ...entradaForm, puertaDestino: e.target.value })}
                required
              >
                <option value="main">Barrera Principal</option>
                <option value="vip">Barrera VIP</option>
              </select>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading ? 'Procesando...' : <><FaDoorOpen /> Registrar Entrada y Abrir Barrera</>}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'activos' && (
        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center bg-gray-50">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FaList className="text-indigo-600" /> Control de Salidas
            </h3>
            {/* #25: Búsqueda en accesos activos */}
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Buscar placa, nombre, tel..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-indigo-500 outline-none"
                value={busquedaActivos}
                onChange={e => setBusquedaActivos(e.target.value)}
              />
              <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                <tr>
                  <th className="py-3 px-4">Placa</th>
                  <th className="py-3 px-4">Cliente / Info</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Plaza</th>
                  <th className="py-3 px-4">Hora Entrada</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  const busq = busquedaActivos.toLowerCase();
                  const filtrados = accesosActivos.filter(acc => {
                    if (!busq) return true;
                    const placa = acc.vehiculos?.placa?.toLowerCase() || '';
                    const nombre = `${acc.vehiculos?.personas?.nombre || ''} ${acc.vehiculos?.personas?.apellido || ''}`.toLowerCase();
                    const tel = (acc.vehiculos?.personas?.telefono || '').toLowerCase();
                    return placa.includes(busq) || nombre.includes(busq) || tel.includes(busq);
                  });
                  if (filtrados.length === 0) {
                    return <tr><td colSpan="6" className="text-center py-8 text-gray-400">No hay accesos manuales activos</td></tr>;
                  }
                  return filtrados.map((acc) => (
                    <tr key={acc.id_registro} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 text-base">{acc.vehiculos?.placa}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-800">{acc.vehiculos?.personas?.nombre} {acc.vehiculos?.personas?.apellido}</div>
                        <div className="text-xs text-gray-500">{acc.vehiculos?.marcas_vehiculo?.nombre} {acc.vehiculos?.modelos_vehiculo?.nombre}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {acc.vehiculos?.personas?.telefono || <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded font-bold text-xs">
                          {todasPlazas.find(p => p.Id_Plaza === acc.Id_Plaza)?.Numero_Plaza || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{formatearFecha(acc.entrada_at)}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleRegistrarSalida(acc)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-bold text-xs transition flex items-center gap-1 mx-auto"
                        >
                          <FaSignOutAlt /> Registrar Salida
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Layout>
  );
}

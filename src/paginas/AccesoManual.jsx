import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaUserPlus, FaDoorOpen, FaSignOutAlt, FaList, FaSearch } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { playBeep } from '../utils/audio';
import SearchableSelect from '../componentes/SearchableSelect';

export default function AccesoManual() {
  const { orgId, loadingOrg } = useOrg();
  const [loading, setLoading] = useState(false);
   const [activeTab, setActiveTab] = useState('entrada'); // 'entrada' | 'activos'
 
   // Datos
   const [vehiculos, setVehiculos] = useState([]);
   const [visitantes, setVisitantes] = useState([]);
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
        const { data } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.id_persona);
      }
    };
    init();
    loadData();

    // Suscripción tiempo real a acceso y plaza
    const ch = supabase.channel('rt_am')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acceso' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadData = async () => {
    try {
      // Obtener estados para plaza
      const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
      const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

      // Plazas: obtener todas para mapear los nombres, y filtrar las libres para el dropdown
      const { data: plazas } = await supabase.from('plaza').select('*').order('numero_plaza');
      if (plazas) {
        setTodasPlazas(plazas);
        setPlazasLibres(plazas.filter(p => p.id_estado === idEstLibrePlaza));
      }

      // Vehículos registrados (con dueños)
      const { data: vhs, error: vErr } = await supabase
        .from('vehiculo')
        .select('*, marca(nombre), modelo(nombre), color(nombre), persona(nombre, apellido, telefono)')
        .order('created_at', { ascending: false });
      if (vErr) console.error('Error cargando vehiculos:', vErr);

      // Visitantes registrados
      const { data: vis, error: visErr } = await supabase
        .from('visitante')
        .select('*, persona(nombre, apellido, telefono)')
        .order('created_at', { ascending: false });
      if (visErr) console.error('Error cargando visitantes:', visErr);

      // Accesos activos (entradas manuales sin salida)
      const { data: activos, error: activosErr } = await supabase
        .from('acceso')
        .select('*, vehiculo(placa, id_persona, marca(nombre), modelo(nombre), color(nombre), persona(nombre, apellido, telefono)), ticket(id_visitante)')
        .is('salida_at', null)
        .order('entrada_at', { ascending: false });

      if (activosErr) console.error('Error cargando accesos activos:', activosErr);
 
      setVehiculos(vhs || []);
      setVisitantes(vis || []);
      setAccesosActivos(activos || []);

    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo').select('id').eq('contexto', 'evento').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Acceso Manual').maybeSingle();
      await supabase.from('evento').insert([{
        fecha_hora: new Date().toISOString(),
        descripcion: descripcion,
        id_plaza: idPlaza,
        id_persona: currentPersonaId,
        id_tipo: te?.id || null,
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const handleRegistrarEntrada = async (e) => {
    e.preventDefault();

    if (!entradaForm.vehiculo_id) return Swal.fire('Atención', 'Seleccione un vehículo.', 'warning');
    if (!entradaForm.id_plaza) return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');
    if (!entradaForm.puertaDestino) return Swal.fire('Atención', 'Seleccione una puerta de acceso.', 'warning');
    if (!orgId) return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Verifique que su usuario esté vinculado a un empleado/organización.', 'error');

    setLoading(true);
    try {
      const vehiculoSelect = vehiculos.find(v => v.id_vehiculo === parseInt(entradaForm.vehiculo_id));

      // Validación: Verificar si el vehículo ya tiene un acceso activo
      const vehiculoYaEstaAdentro = accesosActivos.find(a => a.id_vehiculo === vehiculoSelect.id_vehiculo);
      if (vehiculoYaEstaAdentro) {
        setLoading(false);
        return Swal.fire('Acceso Denegado', 'Este vehículo ya tiene un acceso activo registrado y no ha salido del parqueo.', 'error');
      }

      const plazaSelect = plazasLibres.find(p => p.id_plaza === parseInt(entradaForm.id_plaza));

      // 1. Insertar Registro de Acceso
      const { error: raErr } = await supabase
        .from('acceso')
        .insert({
          entrada_at: new Date().toISOString(),
          id_vehiculo: vehiculoSelect.id_vehiculo,
          ticket_id: null,
          id_plaza: plazaSelect.id_plaza,
          id_dispositivo_entrada: null,
          organizacion_id: orgId
        });
      if (raErr) throw raErr;

      // 2. Actualizar Plaza (Ocupada)
      const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
      const idEstOcupPlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Ocupado')?.id || 2;

      playBeep();
      await supabase.from('plaza').update({
        id_estado: idEstOcupPlaza
      }).eq('id_plaza', plazaSelect.id_plaza);

      // 3. Log
      await registrarLog(
        'Entrada',
        `Entrada manual: ${vehiculoSelect.placa} — ${vehiculoSelect.persona?.nombre} ${vehiculoSelect.persona?.apellido} — Plaza ${plazaSelect.numero_plaza}.`,
        plazaSelect.id_plaza
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
      Swal.fire('Registro Exitoso', `Entrada registrada para ${vehiculoSelect.placa}. Barrera ${nombrePuerta} abriéndose.`, 'success');
      setEntradaForm({ vehiculo_id: '', id_plaza: '', puertaDestino: 'main' });
      setBusquedaVehiculo('');
      setActiveTab('activos');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
    setLoading(false);
  };

  const handleRegistrarSalida = async (acc) => {
    const plazaEncontrada = todasPlazas.find(p => p.id_plaza === acc.id_plaza);
    const result = await Swal.fire({
      title: '¿Registrar Salida Manual?',
      html: `Vehículo: <b>${acc.vehiculo?.placa}</b><br/>Plaza: <b>${plazaEncontrada?.numero_plaza || 'No asig.'}</b><br/><br/><span class="text-sm text-gray-500">Seleccione la barrera a abrir:</span>`,
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

      // 1. Marcar salida en acceso
      const { error: raErr } = await supabase
        .from('acceso')
        .update({ salida_at: ahora })
        .eq('id_registro', acc.id_registro);
      if (raErr) throw raErr;

      // 2. Liberar Plaza si existe
      if (acc.id_plaza) {
        const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
        const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;

        await supabase.from('plaza').update({
          id_estado: idEstLibrePlaza
        }).eq('id_plaza', acc.id_plaza);
      }



      // 3. Log 
      const nombreSalida = `${acc.vehiculo?.persona?.nombre || ''} ${acc.vehiculo?.persona?.apellido || ''}`.trim() || 'Desconocido';
      await registrarLog(
        'Salida',
        `Salida manual: ${nombreSalida} — ${acc.vehiculo?.placa} — Plaza ${plazaEncontrada?.numero_plaza || 'N/A'}.`,
        acc.id_plaza
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
      Swal.fire('Salida Registrada', `La plaza quedó libre y la barrera ${nombrePuertaSalida} se está abriendo.`, 'success');
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
          registrarLog('Entrada', `Apertura manual de ${tituloConfirmacion}`);
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
                          setBusquedaVehiculo(`${v.placa} — ${v.persona?.nombre} ${v.persona?.apellido}`);
                          setMostrarDropdown(false);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-indigo-700 text-base font-mono">{v.placa}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 border">{v.marca?.nombre} {v.modelo?.nombre}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <FaUserPlus className="text-[10px]" /> {v.persona?.nombre} {v.persona?.apellido}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignar Plaza *</label>
                <SearchableSelect
                  options={plazasLibres.map(p => ({ value: p.id_plaza, label: `Plaza ${p.numero_plaza}` }))}
                  value={entradaForm.id_plaza}
                  onChange={(val) => setEntradaForm({ ...entradaForm, id_plaza: val })}
                  placeholder="— Seleccione una plaza libre —"
                  focusRingClass="focus:ring-indigo-500"
                  selectedItemClass="bg-indigo-100 text-indigo-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puerta de Acceso *</label>
                <SearchableSelect
                  options={[
                    { value: 'main', label: 'Barrera Principal' },
                    { value: 'vip', label: 'Barrera VIP' }
                  ]}
                  value={entradaForm.puertaDestino}
                  onChange={(val) => setEntradaForm({ ...entradaForm, puertaDestino: val })}
                  placeholder="— Seleccionar puerta —"
                  focusRingClass="focus:ring-indigo-500"
                  selectedItemClass="bg-indigo-100 text-indigo-800"
                />
              </div>
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
                    const placa = acc.vehiculo?.placa?.toLowerCase() || '';
                    const vOwner = acc.vehiculo?.persona;
                    const vGuest = acc.ticket?.id_visitante ? visitantes.find(v => v.id_visitante === acc.ticket.id_visitante)?.persona : null;
                    const per = vOwner || vGuest;

                    const nombre = `${per?.nombre || ''} ${per?.apellido || ''}`.toLowerCase();
                    const tel = (per?.telefono || '').toLowerCase();
                    return placa.includes(busq) || nombre.includes(busq) || tel.includes(busq);
                  });
                  if (filtrados.length === 0) {
                    return <tr><td colSpan="6" className="text-center py-8 text-gray-400">No hay accesos manuales activos</td></tr>;
                  }
                  return filtrados.map((acc) => (
                    <tr key={acc.id_registro} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 text-base">{acc.vehiculo?.placa}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-800">
                            {(() => {
                                const vOwner = acc.vehiculo?.persona;
                                const guestPersona = acc.ticket?.id_visitante ? visitantes.find(v => v.id_visitante === acc.ticket.id_visitante)?.persona : null;
                                
                                if (vOwner) return `${vOwner.nombre} ${vOwner.apellido}`;
                                if (guestPersona) return (
                                    <div className="flex items-center gap-2">
                                        <span>{guestPersona.nombre} {guestPersona.apellido}</span>
                                        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-md font-black border border-amber-200">VISITANTE</span>
                                    </div>
                                );
                                return 'Visitante';
                            })()}
                        </div>
                        <div className="text-xs text-gray-500">{acc.vehiculo?.marca?.nombre} {acc.vehiculo?.modelo?.nombre}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {(() => {
                             const vOwner = acc.vehiculo?.persona;
                             const vGuest = acc.ticket?.id_visitante ? visitantes.find(v => v.id_visitante === acc.ticket.id_visitante)?.persona : null;
                             return vOwner?.telefono || vGuest?.telefono || <span className="text-gray-300 italic">—</span>;
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded font-bold text-xs">
                          {todasPlazas.find(p => p.id_plaza === acc.id_plaza)?.numero_plaza || 'N/A'}
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

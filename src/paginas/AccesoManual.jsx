import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaUserPlus, FaDoorOpen, FaSignOutAlt, FaList, FaSearch, FaSyncAlt, FaCar } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { playBeep } from '../utils/audio';
import SearchableSelect from '../componentes/SearchableSelect';

export default function AccesoManual() {
  const { orgId, loadingOrg } = useOrg();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('entrada'); // 'entrada' | 'activos'

  // Datos
  const [vehiculos, setVehiculos] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [visitantes, setVisitantes] = useState([]);
  const [todasPlazas, setTodasPlazas] = useState([]);
  const [plazasLibres, setPlazasLibres] = useState([]);
  const [accesosActivos, setAccesosActivos] = useState([]);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchOptions, setSearchOptions] = useState([]);

  // Formulario Entrada Manual
  const [entradaForm, setEntradaForm] = useState({
    vehiculo_id: '',
    id_plaza: '',
    puertaDestino: 'main'
  });

  const [busquedaVehiculo, setBusquedaVehiculo] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [busquedaActivos, setBusquedaActivos] = useState(''); // #25: búsqueda en accesos activos

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
      setIsRefreshing(true);
      // 1. Estados y Plazas
      const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
      const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;
      const idEstOcupPlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Ocupado')?.id || 2;

      const { data: plazas } = await supabase.from('plaza').select('*').order('numero_plaza');
      if (plazas) {
        setTodasPlazas(plazas);
        setPlazasLibres(plazas.filter(p => p.id_estado === idEstLibrePlaza));
      }
      // 2. TODAS LAS PERSONAS (Solución Jarol)
      const { data: allP } = await supabase.from('persona').select('*').order('nombre');
      const pMap = {}; (allP || []).forEach(p => { pMap[p.id_persona] = p; });
      setPersonas(allP || []);

      // 3. Vehículos y Visitantes
      const { data: vhs } = await supabase.from('vehiculo').select('*, marca(nombre), modelo(nombre), color(nombre)');
      const vhsEnriquecidos = (vhs || []).map(v => ({ ...v, persona: pMap[v.id_persona] || null }));
      setVehiculos(vhsEnriquecidos);

      // 4. Calcular Search Options (Para el buscador manual)
      // Solo incluimos vehículos, pero permitimos buscarlos por nombre de dueño
      const options = vhsEnriquecidos.map(v => ({ 
        id: v.id_vehiculo, 
        type: 'v', 
        placa: v.placa, 
        nombre: `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`,
        marca: v.marca?.nombre, 
        modelo: v.modelo?.nombre
      }));
      setSearchOptions(options);

      // 5. Accesos activos
      const { data: activos } = await supabase
        .from('acceso')
        .select('*, vehiculo(*, marca(nombre), modelo(nombre), color(nombre))')
        .is('salida_at', null)
        .order('entrada_at', { ascending: false });

      const enrichedActivos = (activos || []).map(acc => {
        const per = pMap[acc.vehiculo?.id_persona];
        return {
          ...acc,
          _personaNombre: per ? `${per.nombre} ${per.apellido}` : (acc.vehiculo?.placa || 'Desconocido'),
          _personaTel: per?.telefono || '—'
        };
      });
      setAccesosActivos(enrichedActivos);

    } catch (err) { console.error('Error loadData:', err); } finally { setIsRefreshing(false); }
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
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Vehículo o Persona (Jarol, Placa, etc.) *</label>
              <input
                type="text"
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 bg-gray-50 outline-none transition-all"
                placeholder="Ej. Jarol, ABC-1234 o nombre..."
                value={busquedaVehiculo}
                onChange={(e) => {
                  setBusquedaVehiculo(e.target.value);
                  setMostrarDropdown(true);
                  if (entradaForm.vehiculo_id) setEntradaForm({ ...entradaForm, vehiculo_id: '' });
                }}
                onFocus={() => setMostrarDropdown(true)}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
              />

              {mostrarDropdown && (
                <ul className="absolute z-50 w-full bg-white border border-gray-200 shadow-2xl max-h-72 overflow-y-auto rounded-xl mt-2 py-1 transform transition-all">
                  {searchOptions
                    .filter(opt => {
                      const match = opt.nombre.toLowerCase().includes(busquedaVehiculo.toLowerCase()) || 
                                    opt.placa.toLowerCase().includes(busquedaVehiculo.toLowerCase());
                      
                      // Si la búsqueda está vacía, solo mostrar vehículos (v)
                      if (!busquedaVehiculo.trim()) return opt.type === 'v';
                      
                      // Si hay búsqueda, mostrar cualquier coincidencia
                      return match;
                    })
                    .slice(0, 50)
                    .map(opt => (
                      <li
                        key={`${opt.type}-${opt.id}`}
                        className="px-4 py-3 hover:bg-indigo-50 border-b border-gray-50 last:border-0 cursor-pointer transition-colors group"
                        onMouseDown={() => {
                          if (opt.type === 'p') {
                            const pid = opt.id;
                            Swal.fire({
                              title: 'Vincular Placa',
                              input: 'text',
                              inputLabel: 'Este usuario no tiene vehículo. Ingrese la placa:',
                              inputPlaceholder: 'ABC-1234',
                              showCancelButton: true
                            }).then(async (res) => {
                              if (res.isConfirmed && res.value) {
                                  const placa = res.value.toUpperCase();
                                  const { data: exV } = await supabase.from('vehiculo').select('id_vehiculo').eq('placa', placa).maybeSingle();
                                  if (exV) {
                                    setEntradaForm({ ...entradaForm, vehiculo_id: exV.id_vehiculo });
                                    setBusquedaVehiculo(`${placa} — ${opt.nombre}`);
                                  } else {
                                    const { data: nV } = await supabase.from('vehiculo').insert([{ placa, id_persona: pid, organizacion_id: orgId }]).select('id_vehiculo').single();
                                    if (nV) {
                                      setEntradaForm({ ...entradaForm, vehiculo_id: nV.id_vehiculo });
                                      setBusquedaVehiculo(`${placa} — ${opt.nombre}`);
                                    }
                                  }
                              }
                            });
                          } else {
                            setEntradaForm({ ...entradaForm, vehiculo_id: opt.id });
                            setBusquedaVehiculo(`${opt.placa} — ${opt.nombre}`);
                          }
                          setMostrarDropdown(false);
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`font-bold font-mono text-base ${opt.type === 'v' ? 'text-indigo-700' : 'text-gray-400 italic'}`}>
                            {opt.placa}
                          </span>
                          {opt.marca && (
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 border">
                              {opt.marca} {opt.modelo}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <FaUserPlus className="text-[10px]" /> <span>{opt.nombre}</span>
                        </div>
                      </li>
                    ))
                  }
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
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Buscar placa, nombre..."
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-indigo-500 outline-none"
                  value={busquedaActivos}
                  onChange={e => setBusquedaActivos(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs" />
              </div>
              <button
                onClick={loadData}
                disabled={isRefreshing}
                className="p-2.5 bg-white border rounded-lg text-gray-400 hover:text-indigo-600 transition disabled:opacity-50"
              >
                <FaSyncAlt className={isRefreshing ? 'animate-spin' : ''} />
              </button>
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
                    return acc.vehiculo?.placa?.toLowerCase().includes(busq) ||
                      acc._personaNombre?.toLowerCase().includes(busq) ||
                      acc._personaTel?.toLowerCase().includes(busq);
                  });
                  if (filtrados.length === 0) {
                    return <tr><td colSpan="6" className="text-center py-8 text-gray-400">No hay accesos manuales activos</td></tr>;
                  }
                  return filtrados.map((acc) => (
                    <tr key={acc.id_registro} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 text-base">{acc.vehiculo?.placa}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-800">
                          {acc._personaNombre}
                        </div>
                        <div className="text-xs text-gray-500">{acc.vehiculo?.marca?.nombre} {acc.vehiculo?.modelo?.nombre}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {acc._personaTel}
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

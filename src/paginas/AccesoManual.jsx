import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaUserPlus, FaDoorOpen, FaSignOutAlt, FaList, FaSearch, FaSyncAlt, FaHistory, FaSignInAlt, FaStar } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';

// ─────────────────────────────────────────────────────────────
// CAMBIOS:
// - Eliminada toda referencia a tabla `visitante` (no existe en BD)
// - AccesoManual trabaja con la tabla `acceso` + `vehiculo`
//   que SÍ existen. No emite tickets — solo registra acceso por
//   vehículo del sistema. Los visitantes sin vehículo pueden
//   vincularse creando el vehículo on-the-fly con su placa.
// ─────────────────────────────────────────────────────────────

export default function AccesoManual() {
  const { orgId, loadingOrg } = useOrg();
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState('entrada');

  // Datos
  const [vehiculos,       setVehiculos]       = useState([]);
  const [personas,        setPersonas]        = useState([]);
  const [todasPlazas,     setTodasPlazas]     = useState([]);
  const [plazasLibres,    setPlazasLibres]    = useState([]);
  const [accesosActivos,  setAccesosActivos]  = useState([]);
  const [accesosHistorial,setAccesosHistorial]= useState([]);
  const [currentPersonaId,setCurrentPersonaId]= useState(null);
  const [isRefreshing,    setIsRefreshing]    = useState(false);
  const [searchOptions,   setSearchOptions]   = useState([]);

  // Formulario Entrada
  const [entradaForm, setEntradaForm] = useState({
    vehiculo_id: '', id_plaza: '', puertaDestino: 'main'
  });
  const [busquedaVehiculo, setBusquedaVehiculo] = useState('');
  const [mostrarDropdown,  setMostrarDropdown]  = useState(false);
  const [busquedaActivos,  setBusquedaActivos]  = useState('');

  useEffect(() => {
    if (orgId) {
      loadData();
      const ch = supabase.channel('rt_am')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'acceso' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza'  }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zona'   }, loadData)
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      setIsRefreshing(true);

      // 1. Estado "Libre" de plaza
      const { data: epLibre } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibrePlaza = epLibre?.id_estado || 1;

      // 2. Plazas (filtrando zonas inactivas)
      const { data: rawPlazas } = await supabase
        .from('plaza')
        .select('*, zona:id_zona(estado_zona:id_estado(nombre))')
        .eq('organizacion_id', orgId)
        .order('numero_plaza');

      const plazasVivas = (rawPlazas || []).filter(p => {
        const est = p.zona?.estado_zona?.nombre || 'Activa';
        return est === 'Activa';
      });
      setTodasPlazas(plazasVivas);

      // Plazas libres excluyendo asignadas
      const { data: asigsActivas } = await supabase
        .from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1);
      const plazasAsignadasIds = new Set(asigsActivas?.map(a => a.id_plaza) || []);
      setPlazasLibres(plazasVivas.filter(p =>
        p.id_estado === idEstLibrePlaza && !plazasAsignadasIds.has(p.id_plaza)
      ));

      // 3. Personas de la org via RPC — CAMBIO: sin visitante
      const { data: orgUsers } = await supabase.rpc('get_usuarios_org');
      const allP = (orgUsers || []).map(u => ({
        id_persona: u.id_persona,
        nombre:     u.nombre,
        apellido:   u.apellido,
        email:      u.email,
        telefono:   u.telefono
      }));
      const pMap = {};
      allP.forEach(p => { pMap[p.id_persona] = p; });
      setPersonas(allP);

      // 4. Vehículos habilitados de la org
      const { data: vhs } = await supabase
        .from('vehiculo')
        .select('*, modelo:id_modelo(nombre, marca:id_marca(nombre)), color:id_color(nombre)')
        .eq('organizacion_id', orgId)
        .eq('id_estado', 1);
      const vhsEnriquecidos = (vhs || []).map(v => ({ ...v, persona: pMap[v.id_persona] || null }));
      setVehiculos(vhsEnriquecidos);

      // 5. Vehículos con acceso activo (para bloquearlos en dropdown)
      const { data: accActivosIds } = await supabase
        .from('acceso').select('id_vehiculo').eq('organizacion_id', orgId).is('salida_at', null);
      const vehiculosConAccesoActivo = new Set((accActivosIds || []).map(a => a.id_vehiculo));

      setSearchOptions(generateSearchOptions(vhsEnriquecidos, allP, vehiculosConAccesoActivo));

      // 6. Accesos activos
      const { data: activos } = await supabase
        .from('acceso')
        .select('*, vehiculo:id_vehiculo(*, modelo:id_modelo(nombre, marca:id_marca(nombre)), color:id_color(nombre))')
        .eq('organizacion_id', orgId)
        .is('salida_at', null)
        .order('entrada_at', { ascending: false });

      const enrichedActivos = (activos || []).map(acc => {
        const per = pMap[acc.vehiculo?.id_persona];
        return {
          ...acc,
          _personaNombre: per ? `${per.nombre} ${per.apellido}` : (acc.vehiculo?.placa || 'Desconocido'),
          _personaTel:    per?.telefono || '—',
          _marcaNombre:   acc.vehiculo?.modelo?.marca?.nombre,
          _modeloNombre:  acc.vehiculo?.modelo?.nombre
        };
      });
      setAccesosActivos(enrichedActivos);

      // 7. Historial de accesos
      const { data: historial } = await supabase
        .from('acceso')
        .select('*, vehiculo:id_vehiculo(*, modelo:id_modelo(nombre, marca:id_marca(nombre)), color:id_color(nombre))')
        .eq('organizacion_id', orgId)
        .not('salida_at', 'is', null)
        .order('salida_at', { ascending: false })
        .limit(100);

      const enrichedHistorial = (historial || []).map(acc => {
        const per = pMap[acc.vehiculo?.id_persona];
        return {
          ...acc,
          _personaNombre: per ? `${per.nombre} ${per.apellido}` : (acc.vehiculo?.placa || 'Desconocido'),
          _personaTel:    per?.telefono || '—',
          _marcaNombre:   acc.vehiculo?.modelo?.marca?.nombre,
          _modeloNombre:  acc.vehiculo?.modelo?.nombre
        };
      });
      setAccesosHistorial(enrichedHistorial);

      // currentPersonaId
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
        setCurrentPersonaId(ud?.id_persona);
      }
    } catch (err) {
      console.error('Error loadData AccesoManual:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const generateSearchOptions = (vhsEnriquecidos, allP, vehiculosConAccesoActivo) => {
    const vhsOptions = vhsEnriquecidos.map(v => {
      const tieneAcceso = vehiculosConAccesoActivo.has(v.id_vehiculo);
      return {
        id:       v.id_vehiculo,
        type:     'v',
        placa:    v.placa,
        nombre:   `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`.trim() || 'Sin Propietario',
        marca:    v.modelo?.marca?.nombre,
        modelo:   v.modelo?.nombre,
        disabled: tieneAcceso,
        razon:    tieneAcceso ? 'Ya tiene acceso activo' : null
      };
    });

    // CAMBIO: sin visitantes — solo personas del sistema sin vehículo
    const idsPersonasConVehiculo = new Set(vhsEnriquecidos.map(v => v.id_persona).filter(Boolean));
    const personasSinVehiculo = allP
      .filter(p => !idsPersonasConVehiculo.has(p.id_persona))
      .map(p => ({
        id:       p.id_persona,
        type:     'p',
        placa:    'Sin placa asignada',
        nombre:   `${p.nombre || ''} ${p.apellido || ''}`.trim() || 'Sin nombre',
        marca:    null,
        modelo:   null,
        disabled: false,
        razon:    null
      }));

    return [...vhsOptions, ...personasSinVehiculo].sort((a, b) => {
      const cmp = (a.nombre || '').localeCompare(b.nombre || '');
      return cmp !== 0 ? cmp : (a.placa || '').localeCompare(b.placa || '');
    });
  };

  const registrarAccesoLog = (tipo_nombre, descripcion, idPlaza = null) =>
    registrarLog({ tipo_nombre, descripcion, organizacion_id: orgId, id_plaza: idPlaza, origen: 'Panel Web' });

  const handleRegistrarEntrada = async (e) => {
    e.preventDefault();
    if (!entradaForm.vehiculo_id) return Swal.fire('Atención', 'Seleccione un vehículo.', 'warning');
    if (!entradaForm.id_plaza)    return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');
    if (!orgId) return Swal.fire('Error', 'No se detectó la organización. Recargue la página.', 'error');

    setLoading(true);
    try {
      const vehiculoSelect = vehiculos.find(v => v.id_vehiculo === parseInt(entradaForm.vehiculo_id));

      const vehiculoYaEstaAdentro = accesosActivos.find(a => a.id_vehiculo === vehiculoSelect?.id_vehiculo);
      if (vehiculoYaEstaAdentro) {
        setLoading(false);
        return Swal.fire('Acceso Denegado', 'Este vehículo ya tiene un acceso activo y no ha salido del parqueo.', 'error');
      }

      const plazaSelect = plazasLibres.find(p => p.id_plaza === parseInt(entradaForm.id_plaza));

      const { error: raErr } = await supabase.from('acceso').insert({
        entrada_at:          new Date().toISOString(),
        id_vehiculo:         vehiculoSelect.id_vehiculo,
        id_plaza:            plazaSelect.id_plaza,
        id_dispositivo_entrada: null,
        organizacion_id:     orgId
      });
      if (raErr) throw raErr;

      // Ocupar plaza
      const { data: epOcupado } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Ocupad%').maybeSingle();
      await supabase.from('plaza').update({ id_estado: epOcupado?.id_estado || 2 }).eq('id_plaza', plazaSelect.id_plaza);

      await registrarAccesoLog(
        EVENT_TYPES.ENTRADA,
        `Entrada manual: ${vehiculoSelect.placa} — ${vehiculoSelect.persona?.nombre || 'Desconocido'} ${vehiculoSelect.persona?.apellido || ''}.`.trim(),
        plazaSelect.id_plaza
      );

      // Abrir barrera
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch(`http://localhost:4000/api/access/open-${entradaForm.puertaDestino}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => {});
        }
      } catch (_) {}

      const nombrePuertaMap = { 'vip': 'VIP', 'main': 'Principal', 'exit': 'Salida' };
      Swal.fire('Registro Exitoso', `Entrada registrada para ${vehiculoSelect.placa}. Barrera ${nombrePuertaMap[entradaForm.puertaDestino] || 'Desconocida'} abriéndose.`, 'success');
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
      html: `<div class="text-left space-y-2 mb-4">
               <p>Vehículo: <b class="text-indigo-600">${acc.vehiculo?.placa}</b></p>
               <p>Plaza: <b class="text-gray-700">${plazaEncontrada?.numero_plaza || 'No asig.'}</b></p>
             </div>`,
      icon: 'question',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Registrar Salida'
    });
    if (!result.isConfirmed) return;

    try {
      const ahora = new Date().toISOString();
      const { error: raErr } = await supabase
        .from('acceso').update({ salida_at: ahora }).eq('id_registro', acc.id_registro);
      if (raErr) throw raErr;

      // Liberar plaza
      if (acc.id_plaza) {
        const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
        await supabase.from('plaza').update({ id_estado: epLibre?.id_estado || 1 }).eq('id_plaza', acc.id_plaza);
      }

      const nombreSalida = acc._personaNombre || 'Desconocido';
      await registrarAccesoLog(EVENT_TYPES.SALIDA, `Salida manual: ${nombreSalida} — ${acc.vehiculo?.placa}.`, acc.id_plaza);

      // Abrir barrera
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch('http://localhost:4000/api/access/open-exit', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => {});
        }
      } catch (_) {}

      Swal.fire('Salida Registrada', 'La plaza quedó libre y la barrera se está abriendo.', 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const apiControlBarrera = async (endpoint, tituloConfirmacion) => {
    const res = await Swal.fire({ title: tituloConfirmacion, text: 'Esto abrirá la barrera físicamente.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#eab308', confirmButtonText: 'Sí, abrir', cancelButtonText: 'Cancelar' });
    if (res.isConfirmed) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const respuesta = await fetch(`http://localhost:4000/api/access/${endpoint}`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        if (respuesta.ok) Swal.fire('Barrera Abierta', 'El comando se envió exitosamente.', 'success');
        else Swal.fire('Error', 'El servidor respondió con un error.', 'error');
      } catch (e) {
        Swal.fire('Error de Conexión', 'No se pudo conectar con el backend local.', 'error');
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

  const tabBtn = (id, label) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${
        activeTab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
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
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
            <button onClick={() => apiControlBarrera('open-main', '¿Abrir Barrera Principal?')} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95">
              <FaSignInAlt size={16} /> 
              <span>ENTRADA PRINCIPAL</span>
            </button>
            <button onClick={() => apiControlBarrera('open-exit', '¿Abrir Barrera de Salida?')} className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 active:scale-95">
              <FaSignOutAlt size={16} />
              <span>SALIDA PRINCIPAL</span>
            </button>
          </div>
          <div className="h-8 w-px bg-gray-300 hidden md:block"></div>
          <button onClick={() => apiControlBarrera('open-vip',  '¿Abrir Barrera VIP?')} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-6 py-2.5 font-block rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 border border-indigo-400">
            <FaStar className="text-yellow-300" size={16} />
            <span className="font-bold tracking-wide">ACCESO VIP</span>
          </button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada',  'Nueva Entrada')}
        {tabBtn('activos',  'Accesos Activos')}
        {tabBtn('historial','Historial')}
      </div>

      {/* ── TAB ENTRADA ── */}
      {activeTab === 'entrada' && (
        <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 max-w-2xl">
          <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
            <FaUserPlus className="text-indigo-600" /> Registrar Entrada
          </h3>
          <form onSubmit={handleRegistrarEntrada} className="space-y-4">

            {/* Buscador de vehículo/persona — CAMBIO: sin visitante */}
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Vehículo o Persona *</label>
              <input
                type="text"
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 bg-gray-50 outline-none transition-all"
                placeholder="Ej: Jarol, ABC-1234 o nombre..."
                value={busquedaVehiculo}
                onChange={e => {
                  setBusquedaVehiculo(e.target.value);
                  setMostrarDropdown(true);
                  if (entradaForm.vehiculo_id) setEntradaForm({ ...entradaForm, vehiculo_id: '' });
                }}
                onFocus={() => setMostrarDropdown(true)}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
              />

              {mostrarDropdown && (
                <ul className="absolute z-50 w-full bg-white border border-gray-200 shadow-2xl max-h-72 overflow-y-auto rounded-xl mt-2 py-1">
                  {searchOptions
                    .filter(opt => {
                      const match = (opt.nombre || '').toLowerCase().includes(busquedaVehiculo.toLowerCase()) ||
                                    (opt.placa  || '').toLowerCase().includes(busquedaVehiculo.toLowerCase());
                      if (!busquedaVehiculo.trim()) return opt.type === 'v';
                      return match;
                    })
                    .slice(0, 50)
                    .map(opt => {
                      const isBlocked = opt.disabled === true;
                      return (
                        <li
                          key={`${opt.type}-${opt.id}`}
                          className={`px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${isBlocked ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-indigo-50 cursor-pointer'}`}
                          onMouseDown={() => {
                            if (isBlocked) return;
                            if (opt.type === 'p') {
                              // Persona sin vehículo — crear vehículo on-the-fly
                              const pid = opt.id;
                              Swal.fire({
                                title: 'Vincular Placa',
                                input: 'text',
                                inputLabel: 'Este usuario no tiene vehículo. Ingrese la placa:',
                                inputPlaceholder: 'L 010536',
                                showCancelButton: true
                              }).then(async res => {
                                if (res.isConfirmed && res.value) {
                                  const placa = res.value.toUpperCase().replace(/\s/g, ' ').trim();
                                  const { data: exV } = await supabase.from('vehiculo').select('id_vehiculo').eq('placa', placa).maybeSingle();
                                  if (exV) {
                                    setEntradaForm({ ...entradaForm, vehiculo_id: exV.id_vehiculo });
                                    setBusquedaVehiculo(`${placa} - ${opt.nombre}`);
                                  } else {
                                    const { data: nV } = await supabase.from('vehiculo').insert([{ placa, id_persona: pid, organizacion_id: orgId }]).select('id_vehiculo').single();
                                    if (nV) {
                                      setEntradaForm({ ...entradaForm, vehiculo_id: nV.id_vehiculo });
                                      setBusquedaVehiculo(`${placa} - ${opt.nombre}`);
                                    }
                                  }
                                }
                              });
                            } else {
                              setEntradaForm({ ...entradaForm, vehiculo_id: opt.id });
                              setBusquedaVehiculo(`${opt.placa} - ${opt.nombre}`);
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
                            <FaUserPlus className="text-[10px]" />
                            <span>{opt.nombre}</span>
                            {isBlocked && opt.razon && <span className="ml-2 text-red-400 font-semibold">- {opt.razon}</span>}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignar Plaza *</label>
                <SearchableSelect
                  options={plazasLibres.map(p => ({ value: p.id_plaza, label: `Plaza ${p.numero_plaza}` }))}
                  value={entradaForm.id_plaza}
                  onChange={val => setEntradaForm({ ...entradaForm, id_plaza: val })}
                  placeholder="Seleccionar plaza disponible"
                  focusRingClass="focus:ring-indigo-500"
                  selectedItemClass="bg-indigo-100 text-indigo-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puerta de Acceso *</label>
                <SearchableSelect
                  options={[
                    { value: 'main', label: 'Barrera Principal' },
                    { value: 'vip',  label: 'Barrera VIP' },
                    { value: 'exit', label: 'Barrera de Salida' }
                  ]}
                  value={entradaForm.puertaDestino}
                  onChange={val => setEntradaForm({ ...entradaForm, puertaDestino: val })}
                  placeholder="Seleccionar puerta"
                  focusRingClass="focus:ring-indigo-500"
                  selectedItemClass="bg-indigo-100 text-indigo-800"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading || loadingOrg}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold tracking-wide transition-all shadow-md disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading || loadingOrg ? 'Procesando...' : <><FaDoorOpen /> Registrar Entrada y Abrir Barrera</>}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── TABS ACTIVOS / HISTORIAL ── */}
      {(activeTab === 'activos' || activeTab === 'historial') && (
        <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center bg-gray-50">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {activeTab === 'activos' ? 'Vehículos Adentro' : 'Historial de Accesos Manuales'}
              </h3>
              <p className="text-[10px] text-gray-400">
                {activeTab === 'activos' ? 'Vehículos con acceso activo que aún no han salido.' : 'Registros de accesos manuales finalizados.'}
              </p>
            </div>
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

          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                <tr>
                  <th className="py-3 px-4">Placa</th>
                  <th className="py-3 px-4">Cliente / Info</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Plaza</th>
                  <th className="py-3 px-4">Hora Entrada</th>
                  {activeTab === 'historial' && <th className="py-3 px-4">Hora Salida</th>}
                  <th className="py-3 px-4 text-center">{activeTab === 'historial' ? 'Estado' : 'Acciones'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(() => {
                  const busq = busquedaActivos.toLowerCase();
                  const listado = activeTab === 'activos' ? accesosActivos : accesosHistorial;
                  const filtrados = listado.filter(acc =>
                    acc.vehiculo?.placa?.toLowerCase().includes(busq) ||
                    acc._personaNombre?.toLowerCase().includes(busq) ||
                    acc._personaTel?.toLowerCase().includes(busq)
                  );
                  if (filtrados.length === 0) {
                    return (
                      <tr>
                        <td colSpan={activeTab === 'historial' ? 7 : 6} className="text-center py-8 text-gray-400">
                          No se encontraron registros.
                        </td>
                      </tr>
                    );
                  }
                  return filtrados.map(acc => (
                    <tr key={acc.id_registro} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 text-base">{acc.vehiculo?.placa}</td>
                      <td className="py-3 px-4 text-nowrap">
                        <div className="font-semibold text-gray-800">{acc._personaNombre}</div>
                        <div className="text-xs text-gray-500">{acc._marcaNombre} {acc._modeloNombre}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{acc._personaTel}</td>
                      <td className="py-3 px-4">
                        <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded font-bold text-xs">
                          {todasPlazas.find(p => p.id_plaza === acc.id_plaza)?.numero_plaza || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">{formatearFecha(acc.entrada_at)}</td>
                      {activeTab === 'historial' && (
                        <td className="py-3 px-4 text-gray-600 text-xs">{formatearFecha(acc.salida_at)}</td>
                      )}
                      <td className="py-3 px-4 text-center">
                        {activeTab === 'activos' ? (
                          <button
                            onClick={() => handleRegistrarSalida(acc)}
                            className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-bold text-xs transition flex items-center gap-1 mx-auto shadow-sm"
                          >
                            <FaSignOutAlt /> Registrar Salida
                          </button>
                        ) : (
                          <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            Completado
                          </span>
                        )}
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
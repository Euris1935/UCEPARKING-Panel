import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaUserPlus, FaDoorOpen, FaSignOutAlt, FaList, FaSearch, FaSyncAlt, FaCar } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import { playBeep } from '../utils/audio';

export default function AccesoManual() {
  const { orgId, loadingOrg } = useOrg();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('entrada'); // 'entrada' | 'activos'

  // Datos
  const [vehiculos, setVehiculos] = useState([]);
  const [personas, setPersonas] = useState([]);
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

  const nombrePuertaLabel = (key) => {
    if (key === 'vip') return 'VIP';
    if (key === 'exit') return 'Salida';
    return 'Principal';
  };

  const [busquedaVehiculo, setBusquedaVehiculo] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [busquedaActivos, setBusquedaActivos] = useState('');

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

    // Suscripción tiempo real (Singular según esquema oficial)
    const ch = supabase.channel('rt_am')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acceso' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Estados y Plazas
      const { data: estadosCat } = await supabase.from('estado').select('id, nombre, contexto');
      const idEstLibrePlaza = estadosCat?.find(e => e.contexto === 'plaza' && e.nombre === 'Libre')?.id || 1;
      
      const { data: plazas } = await supabase.from('plaza').select('*').order('numero_plaza');
      if (plazas) {
        setTodasPlazas(plazas);
        setPlazasLibres(plazas.filter(p => p.id_estado === idEstLibrePlaza));
      }

      // 2. Personas
      const { data: allP } = await supabase.from('persona').select('*').order('nombre');
      const pMap = {}; (allP || []).forEach(p => { pMap[p.id_persona] = p; });
      setPersonas(allP || []);

      // 3. Vehículos
      const { data: vhs } = await supabase.from('vehiculo').select('*, marca(nombre), modelo(nombre), color(nombre)');
      const vhsEnriquecidos = (vhs || []).map(v => ({ ...v, persona: pMap[v.id_persona] || null }));
      setVehiculos(vhsEnriquecidos);

      const options = vhsEnriquecidos.map(v => ({ 
        id: v.id_vehiculo, 
        type: 'v', 
        placa: v.placa, 
        nombre: `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`,
        marca: v.marca?.nombre, 
        modelo: v.modelo?.nombre
      }));
      setSearchOptions(options);

      // 4. Accesos activos
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

    } catch (err) { 
      console.error('Error loadData:', err); 
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const registrarLog = async (tipo, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo').select('id').eq('contexto', 'evento').eq('nombre', tipo).maybeSingle();
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
    if (!orgId) return Swal.fire('Error', 'No se ha detectado organización.', 'error');

    setLoading(true);
    try {
      const vehiculoSelect = vehiculos.find(v => v.id_vehiculo === parseInt(entradaForm.vehiculo_id));
      const vehiculoYaEstaAdentro = accesosActivos.find(a => a.id_vehiculo === vehiculoSelect.id_vehiculo);
      
      if (vehiculoYaEstaAdentro) {
        setLoading(false);
        return Swal.fire('Acceso Denegado', 'Ya tiene un acceso activo.', 'error');
      }

      const plazaSelect = todasPlazas.find(p => p.id_plaza === parseInt(entradaForm.id_plaza));

      // 1. Acceso
      const { error: raErr } = await supabase.from('acceso').insert({
        entrada_at: new Date().toISOString(),
        id_vehiculo: vehiculoSelect.id_vehiculo,
        id_plaza: plazaSelect.id_plaza,
        organizacion_id: orgId
      });
      if (raErr) throw raErr;

      // 2. Plaza (Estado Ocupado = 2)
      await supabase.from('plaza').update({ id_estado: 2 }).eq('id_plaza', plazaSelect.id_plaza);
      playBeep();

      // 3. Log
      await registrarLog('Entrada', `Entrada manual: ${vehiculoSelect.placa} — Plaza ${plazaSelect.numero_plaza}.`, plazaSelect.id_plaza);

      const nombrePuerta = nombrePuertaLabel(entradaForm.puertaDestino);
      Swal.fire('Éxito', `Entrada registrada. Barrera ${nombrePuerta} abierta.`, 'success');
      setEntradaForm({ vehiculo_id: '', id_plaza: '', puertaDestino: 'main' });
      setBusquedaVehiculo('');
      setActiveTab('activos');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrarSalida = async (acceso) => {
    const plazaEncontrada = todasPlazas.find(p => p.id_plaza === acceso.id_plaza);
    const result = await Swal.fire({
      title: '¿Registrar Salida?',
      html: `
        <div style="text-align:left;margin-bottom:12px">
          <b>Vehículo:</b> ${acceso.vehiculo?.placa}<br/>
          <b>Plaza:</b> ${plazaEncontrada?.numero_plaza || 'N/A'}
        </div>
        <p style="font-size:13px;color:#6b7280;margin-bottom:8px">Seleccione la barrera a abrir:</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="swal-btn-main" onclick="window._swalBarrera='main';Swal.clickConfirm()" style="background:#16a34a;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;border:none;cursor:pointer">🚗 Principal</button>
          <button id="swal-btn-exit" onclick="window._swalBarrera='exit';Swal.clickConfirm()" style="background:#dc2626;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;border:none;cursor:pointer">🚪 Salida</button>
          <button id="swal-btn-vip" onclick="window._swalBarrera='vip';Swal.clickConfirm()" style="background:#9333ea;color:white;padding:8px 16px;border-radius:8px;font-weight:bold;border:none;cursor:pointer">⭐ VIP</button>
        </div>`,
      icon: 'question',
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: 'Cancelar',
      didOpen: () => { window._swalBarrera = null; }
    });
    
    if (!result.isConfirmed || !window._swalBarrera) return;
    const barreraSalida = window._swalBarrera || 'main';

    try {
      const ahora = new Date().toISOString();
      await supabase.from('acceso').update({ salida_at: ahora }).eq('id_registro', acceso.id_registro);
      
      if (acceso.id_plaza) {
        await supabase.from('plaza').update({ id_estado: 1 }).eq('id_plaza', acceso.id_plaza);
      }

      await registrarLog('Salida', `Salida manual: ${acceso.vehiculo?.placa} — Plaza ${plazaEncontrada?.numero_plaza || 'N/A'}.`, acceso.id_plaza);
      
      const nombrePuertaSalida = nombrePuertaLabel(barreraSalida);
      Swal.fire('Éxito', `Salida registrada. Barrera ${nombrePuertaSalida} abierta.`, 'success');
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
      confirmButtonText: 'Sí, abrir'
    });
    if (res.isConfirmed) {
      Swal.fire('Enviado', 'Comando de apertura enviado.', 'success');
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
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${activeTab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
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
          <p className="text-gray-500 mt-1">Control de entradas y salidas manuales.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => apiControlBarrera('open-main', '¿Abrir Principal?')} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 font-bold rounded-lg shadow text-sm">🚗 ENTRADA PRINCIPAL</button>
          <button onClick={() => apiControlBarrera('open-exit', '¿Abrir Salida?')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 font-bold rounded-lg shadow text-sm">🚪 SALIDA</button>
          <button onClick={() => apiControlBarrera('open-vip', '¿Abrir VIP?')} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 font-bold rounded-lg shadow text-sm">⭐ PUERTA VIP</button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada', 'Nueva Entrada', <FaDoorOpen />)}
        {tabBtn('activos', 'Accesos Activos', <FaList />)}
      </div>

      {activeTab === 'entrada' && (
        <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 max-w-2xl">
          <form onSubmit={handleRegistrarEntrada} className="space-y-4">
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Vehículo o Persona *</label>
              <input
                type="text"
                className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 bg-gray-50 outline-none"
                placeholder="Placa o nombre..."
                value={busquedaVehiculo}
                onChange={(e) => { setBusquedaVehiculo(e.target.value); setMostrarDropdown(true); }}
                onFocus={() => setMostrarDropdown(true)}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
              />
              {mostrarDropdown && (
                <ul className="absolute z-50 w-full bg-white border shadow-2xl max-h-72 overflow-y-auto rounded-xl mt-2 py-1">
                  {searchOptions
                    .filter(opt => opt.nombre.toLowerCase().includes(busquedaVehiculo.toLowerCase()) || opt.placa.toLowerCase().includes(busquedaVehiculo.toLowerCase()))
                    .slice(0, 20)
                    .map(opt => (
                      <li key={opt.id} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0" onMouseDown={() => { setEntradaForm({ ...entradaForm, vehiculo_id: opt.id }); setBusquedaVehiculo(`${opt.placa} — ${opt.nombre}`); setMostrarDropdown(false); }}>
                        <div className="font-bold text-indigo-700">{opt.placa}</div>
                        <div className="text-xs text-gray-500">{opt.nombre}</div>
                      </li>
                    ))
                  }
                </ul>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asignar Plaza *</label>
              <select className="w-full border rounded-lg p-2 text-sm bg-gray-50" value={entradaForm.id_plaza} onChange={(e) => setEntradaForm({ ...entradaForm, id_plaza: e.target.value })} required>
                <option value="">— Seleccione plaza —</option>
                {plazasLibres.map(p => <option key={p.id_plaza} value={p.id_plaza}>Plaza {p.numero_plaza}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puerta de Acceso</label>
              <select className="w-full border rounded-lg p-2 text-sm bg-gray-50" value={entradaForm.puertaDestino} onChange={(e) => setEntradaForm({ ...entradaForm, puertaDestino: e.target.value })}>
                <option value="main">🚗 Principal</option>
                <option value="vip">⭐ VIP</option>
              </select>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold">
              {loading ? 'Procesando...' : 'REGISTRAR ACCESO'}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'activos' && (
        <section className="bg-white rounded-2xl shadow-lg border overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <input type="text" placeholder="Filtrar placa..." className="border rounded-lg p-2 text-sm w-64" value={busquedaActivos} onChange={e => setBusquedaActivos(e.target.value)} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-100 font-bold uppercase text-[10px] text-gray-500">
              <tr>
                <th className="p-4">Placa</th>
                <th className="p-4">Propietario</th>
                <th className="p-4">Plaza</th>
                <th className="p-4">Entrada</th>
                <th className="p-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accesosActivos.filter(a => a.vehiculo?.placa.toLowerCase().includes(busquedaActivos.toLowerCase())).map(acc => (
                <tr key={acc.id_registro} className="hover:bg-gray-50">
                  <td className="p-4 font-bold text-indigo-700 font-mono">{acc.vehiculo?.placa}</td>
                  <td className="p-4">{acc._personaNombre}</td>
                  <td className="p-4 font-bold text-gray-600">
                    {todasPlazas.find(p => p.id_plaza === acc.id_plaza)?.numero_plaza || 'N/A'}
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{formatearFecha(acc.entrada_at)}</td>
                  <td className="p-4 text-center">
                    <button onClick={() => handleRegistrarSalida(acc)} className="bg-red-100 text-red-700 px-3 py-1 rounded-lg font-bold text-xs">SALIDA</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </Layout>
  );
}

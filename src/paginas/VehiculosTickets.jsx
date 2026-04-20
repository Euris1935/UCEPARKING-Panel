import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaCar, FaTicketAlt, FaUserPlus, FaSave, FaTrash, FaEdit,
  FaPrint, FaSignOutAlt, FaClipboardCheck, FaSyncAlt, FaBan, FaSearch
} from 'react-icons/fa';
import SearchableSelect from '../componentes/SearchableSelect';
import { useOrg } from '../contexts/OrgContext';
import { useRbac } from '../contexts/RbacContext';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_PLAZA, ESTADO_TICKET, ESTADO_VEHICULO } from '../lib/constants';

/* ── Vista de Impresión de Ticket ── */
function TicketPrintView({ ticket, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-green-700 text-white p-5 text-center">
          <h2 className="text-2xl font-extrabold tracking-widest">UCE PARKING</h2>
          <p className="text-green-200 text-xs mt-1">TICKET DE ACCESO / VISITANTE</p>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <Row label="N° Ticket"       value={`#${String(ticket.id_ticket).padStart(6,'0')}`} bold />
          <hr />
          <Row label="Visitante"       value={ticket._personaNombre || '—'} />
          <Row label="Placa"           value={ticket.placa_capturada} bold mono />
          <Row label="Marca"           value={ticket._marcaNombre || '—'} />
          <Row label="Color"           value={ticket._colorNombre || '—'} />
          <hr />
          <Row label="Plaza Asignada"  value={ticket.plaza?.numero_plaza || `#${ticket.id_plaza_asignada}`} bold />
          <Row label="Hora de Entrada" value={new Date(ticket.fecha_hora_emision).toLocaleString('es-DO')} />
          <Row label="Estado"          value={ticket._statusName} />
          <hr />
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Por favor presente este ticket al salir del parqueo.
          </p>
        </div>
        <div className="flex gap-3 p-4 border-t print:hidden">
          <button onClick={() => window.print()}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
            <FaPrint /> Imprimir
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg font-bold">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, mono }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono bg-gray-900 text-white px-2 py-0.5 rounded' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function VehiculosTickets() {
  const { orgId } = useOrg();
  const { esAdmin, tienePermiso } = useRbac();
  
  const [loading, setLoading]                 = useState(false);
  const [activeTab, setActiveTab]             = useState('entrada');
  const [tickets, setTickets]                 = useState([]);
  const [ticketsActivosCount, setTicketsActivosCount] = useState(0);
  const [vehiculos, setVehiculos]             = useState([]);
  const [personasSistema, setPersonasSistema] = useState([]);
  const [visitantesReg, setVisitantesReg]     = useState([]);
  const [plazasLibres, setPlazasLibres]       = useState([]);
  const [marcasCat, setMarcasCat]             = useState([]);
  const [modelosCat, setModelosCat]           = useState([]);
  const [coloresCat, setColoresCat]           = useState([]);
  const [tiposVehiculoCat, setTiposVehiculoCat] = useState([]);
  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [searchTerm, setSearchTerm]           = useState('');
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [ticketParaImprimir, setTicketParaImprimir] = useState(null);
  const intervaloRef = useRef(null);

  /* ── Formulario de Ticket (Visitante) ── */
  const [visitanteForm, setVisitanteForm] = useState({
    id_visitante: null, 
    id_persona_visitante: '', 
    nombre: '', 
    apellido: '', 
    telefono: '',
    placa: '', 
    id_marca_capturada: '', 
    id_modelo_capturado: '',
    id_color_capturado: '', 
    id_plaza: '', 
    duracion: '60',
    descripcion: ''
  });

  /* ── Formulario de Vehículo Interno ── */
  const [vehPersonalForm, setVehPersonalForm] = useState({ 
    persona_id: '', placa: '', id_modelo: '', id_color: '', id_tipo: '' 
  });
  const [editandoVehiculo, setEditandoVehiculo] = useState(null);
  const [editVehForm, setEditVehForm]           = useState({ placa: '', id_modelo: '', id_color: '' });

  useEffect(() => {
    if (orgId) {
      loadData();
      intervaloRef.current = setInterval(checkExpiredTickets, 60_000);
      const ch = supabase.channel('rt_vt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
        .subscribe();
      return () => { supabase.removeChannel(ch); clearInterval(intervaloRef.current); };
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      setIsRefreshing(true);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      
      const [
        { data: stCat },
        { data: allP },
        { data: allV },
        { data: tks },
        { data: vhs },
        { data: marcas },
        { data: modelos },
        { data: colores },
        { data: rawPlazas },
        { data: tiposVeh }
      ] = await Promise.all([
        supabase.from('estado_ticket').select('id_estado, nombre'),
        supabase.rpc('get_usuarios_org'),
        supabase.from('visitante').select('*, persona:id_persona(id_persona, nombre, apellido, telefono)'),
        supabase.from('ticket').select(`*, plaza:id_plaza_asignada(numero_plaza), 
          marca_cap:id_marca_capturada(nombre), 
          modelo_cap:id_modelo_capturado(nombre),
          color_cap:id_color_capturado(nombre)`
        ).eq('organizacion_id', orgId).gte('fecha_hora_emision', hoy.toISOString()).order('fecha_hora_emision', { ascending: false }),
        supabase.from('vehiculo').select('*, modelo:id_modelo(id_modelo, nombre, marca:id_marca(nombre)), color:id_color(nombre), persona:id_persona(nombre, apellido)').eq('organizacion_id', orgId),
        supabase.from('marca').select('*').order('nombre'),
        supabase.from('modelo').select('*').order('nombre'),
        supabase.from('color').select('*').order('nombre'),
        supabase.from('plaza').select('*, zona:id_zona(id_zona, nombre, estado_zona:id_estado(nombre))').eq('id_estado', ESTADO_PLAZA.LIBRE).eq('organizacion_id', orgId),
        supabase.from('tipo_vehiculo').select('*').order('nombre')
      ]);

      // Filtrar plazas de zonas activas
      setPlazasLibres((rawPlazas || []).filter(p => {
        const estadoZonaNombre = p.zona?.estado_zona?.nombre || 'Activa';
        return estadoZonaNombre === 'Activa';
      }));

      const stMap = {}; (stCat || []).forEach(s => { stMap[s.id_estado] = s.nombre; });
      
      // Mapeo de personas y visitantes
      const pMap = {}; (allP || []).forEach(p => { pMap[p.id_persona] = p; });
      
      // Visitantes: join con persona via FK
      const vMap = {}; (allV || []).forEach(v => { 
        vMap[v.id_visitante] = { ...v }; 
      });

      setTickets((tks || []).map(t => ({
          ...t,
          _statusName: stMap[t.id_estado] || '—',
          _personaNombre: (() => {
            // Intentar obtener nombre de persona directa o del visitante
            if (t.id_visitante && vMap[t.id_visitante]?.persona) {
              const p = vMap[t.id_visitante].persona;
              return `${p.nombre} ${p.apellido}`;
            }
            return t.placa_capturada || '—';
          })(),
          _marcaNombre: t.marca_cap?.nombre || '—',
          _colorNombre: t.color_cap?.nombre || '—'
      })));

      setTicketsActivosCount((tks || []).filter(t => stMap[t.id_estado]?.toLowerCase() === 'activo').length);
      setVehiculos(vhs || []);
      setVisitantesReg(Object.values(vMap));
      setPersonasSistema(allP || []);
      setMarcasCat(marcas || []);
      setModelosCat(modelos || []);
      setColoresCat(colores || []);
      setTiposVehiculoCat(tiposVeh || []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
          setCurrentPersonaId(ud?.id_persona);
      }
    } catch (err) { console.error('Error loadData:', err); } 
    finally { setIsRefreshing(false); }
  };

  const checkExpiredTickets = async () => {
    try {
      const stActivo = ESTADO_TICKET.ACTIVO;
      const stVencido = ESTADO_TICKET.VENCIDO;
      const idLibre = ESTADO_PLAZA.LIBRE;

      const { data: vencidos } = await supabase
        .from('ticket').select('id_ticket, id_plaza_asignada')
        .eq('id_estado', stActivo)
        .not('fecha_hora_vencimiento', 'is', null)
        .lt('fecha_hora_vencimiento', new Date().toISOString());
      
      if (!vencidos || vencidos.length === 0) return;
      for (const t of vencidos) {
        await supabase.from('ticket').update({ id_estado: stVencido }).eq('id_ticket', t.id_ticket);
        await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', t.id_plaza_asignada);
      }
      loadData();
    } catch (e) { console.warn('checkExpiredTickets:', e.message); }
  };

  // #RF12: Apertura de barrera física (Arduino integration)
  const abrirBarreraFisica = async (puerta = 'main') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(`http://localhost:4000/api/access/open-${puerta}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    if (!orgId) return Swal.fire('Error', 'Contexto org ausente.', 'error');
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención','Placa obligatoria.','warning');
    if (!visitanteForm.id_plaza) return Swal.fire('Atención','Seleccione una plaza.','warning');
    
    setLoading(true);
    try {
      let vId = visitanteForm.id_visitante;
      if (!vId) {
        let pId = visitanteForm.id_persona_visitante;
        if (!pId && visitanteForm.nombre) {
          const { data: nP } = await supabase.from('persona').insert([{
            nombre: visitanteForm.nombre.trim(),
            apellido: visitanteForm.apellido.trim(),
            telefono: visitanteForm.telefono.trim()
          }]).select('id_persona').single();
          pId = nP.id_persona;
        }
        if (pId) {
          const { data: nV } = await supabase.from('visitante').insert([{ id_persona: pId }]).select('id_visitante').single();
          vId = nV.id_visitante;
        }
      }

      const durMin = parseInt(visitanteForm.duracion) || 0;
      const fEmis = new Date().toISOString();
      const fVenc = durMin > 0 ? new Date(Date.now() + durMin * 60000).toISOString() : null;

      const { data: nT, error: tErr } = await supabase.from('ticket').insert([{
        id_visitante: vId || null,
        id_plaza_asignada: parseInt(visitanteForm.id_plaza),
        placa_capturada: visitanteForm.placa.toUpperCase(),
        id_marca_capturada: parseInt(visitanteForm.id_marca_capturada) || null,
        id_modelo_capturado: parseInt(visitanteForm.id_modelo_capturado) || null,
        id_color_capturado: parseInt(visitanteForm.id_color_capturado) || null,
        fecha_hora_emision: fEmis,
        fecha_hora_vencimiento: fVenc,
        id_estado: ESTADO_TICKET.ACTIVO,
        organizacion_id: orgId,
        descripcion: visitanteForm.descripcion || ''
      }]).select('*').single();

      if (tErr) throw tErr;

      await supabase.from('plaza').update({ id_estado: ESTADO_PLAZA.OCUPADA }).eq('id_plaza', parseInt(visitanteForm.id_plaza));

      // Abrir barrera de entrada al emitir ticket
      abrirBarreraFisica('main');

      await registrarLog({
        tipo_nombre: EVENT_TYPES.TICKET_EMITIDO,
        descripcion: `Ticket emitido: ${nT.placa_capturada} (Visitante: ${visitanteForm.nombre || 'N/R'})`,
        id_persona: currentPersonaId,
        organizacion_id: orgId,
        id_plaza: nT.id_plaza_asignada,
        origen: 'Panel Web - Vehículos y Tickets'
      });

      const marcaNombre = marcasCat.find(m => m.id_marca === parseInt(visitanteForm.id_marca_capturada))?.nombre || '—';
      const colorNombre = coloresCat.find(c => c.id_color === parseInt(visitanteForm.id_color_capturado))?.nombre || '—';

      Swal.fire('Ticket Emitido', 'El ticket se creó y la barrera se está abriendo.', 'success');
      setTicketParaImprimir({ ...nT, _personaNombre: `${visitanteForm.nombre} ${visitanteForm.apellido}`.trim() || nT.placa_capturada, _statusName: 'Activo', _marcaNombre: marcaNombre, _colorNombre: colorNombre });
      setVisitanteForm({ id_visitante:null, id_persona_visitante:'', nombre:'', apellido:'', telefono:'', placa:'', id_marca_capturada:'', id_modelo_capturado:'', id_color_capturado:'', id_plaza:'', duracion:'60', descripcion:'' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); } 
    finally { setLoading(false); }
  };

  const handleCerrarTicket = async (t) => {
    const res = await Swal.fire({ title: '¿Registrar Salida?', text: `Se liberará la plaza ${t.plaza?.numero_plaza || ''} y se abrirá la barrera de salida.`, icon: 'question', showCancelButton: true });
    if (res.isConfirmed) {
      try {
        await supabase.from('ticket').update({ id_estado: ESTADO_TICKET.CERRADO, fecha_hora_vencimiento: new Date().toISOString() }).eq('id_ticket', t.id_ticket);
        await supabase.from('plaza').update({ id_estado: ESTADO_PLAZA.LIBRE }).eq('id_plaza', t.id_plaza_asignada);

        // Abrir barrera de salida
        abrirBarreraFisica('exit');

        await registrarLog({
           tipo_nombre: EVENT_TYPES.TICKET_CERRADO,
           descripcion: `Salida de ticket: ${t.placa_capturada}. Plaza liberada.`,
           id_persona: currentPersonaId,
           organizacion_id: orgId,
           id_plaza: t.id_plaza_asignada,
           origen: 'Panel Web - Vehículos y Tickets'
        });
        loadData();
      } catch (err) { Swal.fire('Error', err.message, 'error'); }
    }
  };

  const handleAnularTicket = async (t) => {
    const res = await Swal.fire({ title: '¿Anular Ticket?', text: "La plaza se liberará inmediatamente.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' });
    if (res.isConfirmed) {
       await supabase.from('ticket').update({ id_estado: ESTADO_TICKET.ANULADO }).eq('id_ticket', t.id_ticket);
       await supabase.from('plaza').update({ id_estado: ESTADO_PLAZA.LIBRE }).eq('id_plaza', t.id_plaza_asignada);
       loadData();
    }
  };

  const handleVehPersonalSubmit = async (e) => {
    e.preventDefault();
    if (!vehPersonalForm.persona_id || !vehPersonalForm.placa || !vehPersonalForm.id_modelo || !vehPersonalForm.id_color) {
      return Swal.fire('Atención', 'Propietario, Placa, Modelo y Color son obligatorios.', 'warning');
    }
    setLoading(true);
    try {
       const { error } = await supabase.from('vehiculo').insert([{
          id_persona: vehPersonalForm.persona_id,
          placa: vehPersonalForm.placa.toUpperCase(),
          id_modelo: parseInt(vehPersonalForm.id_modelo),
          id_color: parseInt(vehPersonalForm.id_color),
          id_tipo: parseInt(vehPersonalForm.id_tipo) || null,
          id_estado: ESTADO_VEHICULO.ACTIVO,
          organizacion_id: orgId
       }]);
       if (error) throw error;
       Swal.fire('Éxito', 'Vehículo vinculado correctamente.', 'success');
       setVehPersonalForm({ persona_id:'', placa:'', id_modelo:'', id_color:'', id_tipo:'' });
       loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleEliminarVehiculo = async (v) => {
    const res = await Swal.fire({ title: '¿Eliminar?', text: "Esta acción no se puede deshacer.", icon: 'warning', showCancelButton: true });
    if (res.isConfirmed) {
       await supabase.from('vehiculo').delete().eq('id_vehiculo', v.id_vehiculo);
       loadData();
    }
  };

  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    try {
       await supabase.from('vehiculo').update({
          placa: editVehForm.placa.toUpperCase(),
          id_modelo: parseInt(editVehForm.id_modelo) || null,
          id_color: parseInt(editVehForm.id_color) || null
       }).eq('id_vehiculo', editandoVehiculo.id_vehiculo);
       setEditandoVehiculo(null);
       loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  // Modelos filtrados por marca seleccionada
  const modelosFiltradosMarca = (marcaId) => {
    if (!marcaId) return modelosCat;
    return modelosCat.filter(m => String(m.id_marca) === String(marcaId));
  };

  return (
    <Layout>
      <header className="mb-6">
          <div className="flex justify-between items-center">
              <div>
                  <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Vehículos y Tickets</h2>
                  <p className="text-gray-500 font-medium text-sm mt-1">Visitantes, flota interna y control de acceso físico.</p>
              </div>
              <div className="flex gap-4">
                  <div className="bg-green-50 px-4 py-2 rounded-xl border border-green-100 text-center">
                      <p className="text-2xl font-black text-green-700 leading-none">{ticketsActivosCount}</p>
                      <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest mt-1">En Parqueo</p>
                  </div>
              </div>
          </div>
          <div className="flex border-b border-gray-200 mt-6">
            {['entrada','activos','flota'].map(tab => (
              <button key={tab} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 uppercase tracking-wide ${activeTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`} onClick={() => setActiveTab(tab)}>{tab}</button>
            ))}
          </div>
      </header>

      {activeTab === 'entrada' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 animate-in fade-in slide-in-from-bottom-4">
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800"><FaTicketAlt className="text-green-600"/> Nuevo Ticket</h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">Visitante Conocido</label>
                <SearchableSelect options={[{value:'', label:'-- Nuevo --'}, ...visitantesReg.map(v => ({value:v.id_visitante, label:`${v.persona?.nombre||''} ${v.persona?.apellido||''}`}))]} value={visitanteForm.id_visitante} onChange={val => {
                    const v = visitantesReg.find(x => x.id_visitante === val);
                    setVisitanteForm({...visitanteForm, id_visitante:val, nombre:v?.persona?.nombre||'', apellido:v?.persona?.apellido||'', telefono:v?.persona?.telefono||''});
                }} />
              </div>
              {!visitanteForm.id_visitante && (
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase">Nombre</label>
                          <input className="w-full border rounded-xl p-2.5 text-sm" value={visitanteForm.nombre} onChange={e => setVisitanteForm({...visitanteForm, nombre:e.target.value})} />
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase">Apellido</label>
                          <input className="w-full border rounded-xl p-2.5 text-sm" value={visitanteForm.apellido} onChange={e => setVisitanteForm({...visitanteForm, apellido:e.target.value})} />
                      </div>
                  </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase">Placa *</label>
                   <input className="w-full border-2 border-green-200 focus:border-green-500 rounded-xl p-2.5 text-base font-mono font-bold text-center uppercase" placeholder="ABC-1234" value={visitanteForm.placa} onChange={e => setVisitanteForm({...visitanteForm, placa:e.target.value})} required/>
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase">Plaza *</label>
                   <select className="w-full border rounded-xl p-2.5 text-sm" value={visitanteForm.id_plaza} onChange={e => setVisitanteForm({...visitanteForm, id_plaza:e.target.value})} required>
                       <option value="">-- Plaza --</option>
                       {plazasLibres.map(p => <option key={p.id_plaza} value={p.id_plaza}>{p.numero_plaza}</option>)}
                   </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase">Marca</label>
                      <select className="w-full border rounded-xl p-2 text-sm" value={visitanteForm.id_marca_capturada} onChange={e => setVisitanteForm({...visitanteForm, id_marca_capturada:e.target.value, id_modelo_capturado:''})}>
                          <option value="">—</option>
                          {marcasCat.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase">Modelo</label>
                      <select className="w-full border rounded-xl p-2 text-sm" value={visitanteForm.id_modelo_capturado} onChange={e => setVisitanteForm({...visitanteForm, id_modelo_capturado:e.target.value})} disabled={!visitanteForm.id_marca_capturada}>
                          <option value="">—</option>
                          {modelosFiltradosMarca(visitanteForm.id_marca_capturada).map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase">Color</label>
                      <select className="w-full border rounded-xl p-2 text-sm" value={visitanteForm.id_color_capturado} onChange={e => setVisitanteForm({...visitanteForm, id_color_capturado:e.target.value})}>
                          <option value="">—</option>
                          {coloresCat.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
                      </select>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase">Duración</label>
                      <select className="w-full border rounded-xl p-2.5 text-sm" value={visitanteForm.duracion} onChange={e => setVisitanteForm({...visitanteForm, duracion:e.target.value})}>
                          <option value="0">Ilimitado</option>
                          <option value="60">1 Hora</option>
                          <option value="120">2 Horas</option>
                          <option value="240">4 Horas</option>
                      </select>
                  </div>
                  <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase">Descripción</label>
                      <input className="w-full border rounded-xl p-2.5 text-sm" placeholder="Motivo de visita..." value={visitanteForm.descripcion} onChange={e => setVisitanteForm({...visitanteForm, descripcion:e.target.value})} />
                  </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold tracking-widest shadow-lg flex justify-center items-center gap-2">
                  <FaTicketAlt /> {loading ? 'PROCESANDO...' : 'EMITIR TICKET Y ABRIR'}
              </button>
            </form>
          </section>
          <section className="lg:col-span-3 bg-white p-8 rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center">
             <div className="bg-gray-50 p-6 rounded-full mb-4"><FaCar className="text-gray-300 text-5xl"/></div>
             <h4 className="font-bold text-gray-400 uppercase tracking-widest">Modo Recepción Activo</h4>
             <p className="text-xs text-gray-400 mt-2 max-w-xs">Use el panel lateral para registrar visitas manuales y activar la barrera de entrada.</p>
          </section>
        </div>
      )}

      {activeTab === 'activos' && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
            <div className="relative w-72">
              <FaSearch className="absolute left-3 top-3 text-gray-400" />
              <input type="text" placeholder="Buscar placa..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={loadData} className="p-2 text-green-600 hover:bg-green-50 rounded-full"><FaSyncAlt className={isRefreshing ? 'animate-spin' : ''}/></button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
               <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                  <tr>
                    <th className="px-6 py-4 text-left">Visitante</th>
                    <th className="px-6 py-4 text-left">Placa</th>
                    <th className="px-6 py-4 text-left">Plaza</th>
                    <th className="px-6 py-4 text-left">Entrada</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50 text-sm">
                  {tickets.filter(t => t.placa_capturada.toLowerCase().includes(searchTerm.toLowerCase())).map(t => (
                    <tr key={t.id_ticket} className="hover:bg-green-50/30 transition-all">
                       <td className="px-6 py-4 font-bold text-gray-800">{t._personaNombre}</td>
                       <td className="px-6 py-4"><span className="bg-gray-900 text-white font-mono px-2 py-1 rounded text-xs">{t.placa_capturada}</span></td>
                       <td className="px-6 py-4 font-black text-green-700">P-{t.plaza?.numero_plaza}</td>
                       <td className="px-6 py-4 text-gray-500">{new Date(t.fecha_hora_emision).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                       <td className="px-6 py-4 text-right flex justify-end gap-3">
                          <button onClick={() => setTicketParaImprimir(t)} className="text-blue-500 p-2 hover:bg-blue-50 rounded-lg"><FaPrint/></button>
                          {t._statusName.toLowerCase() === 'activo' && <button onClick={() => handleCerrarTicket(t)} className="bg-green-600 text-white px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2"><FaSignOutAlt/> SALIDA</button>}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'flota' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <aside className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
               <h3 className="text-lg font-bold mb-5 text-gray-800">Registrar Vehículo Interno</h3>
               <form onSubmit={handleVehPersonalSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase">Propietario *</label>
                    <select className="w-full border rounded-xl p-2.5 text-sm" value={vehPersonalForm.persona_id} onChange={e => setVehPersonalForm({...vehPersonalForm, persona_id:e.target.value})} required>
                        <option value="">-- Seleccionar --</option>
                        {personasSistema.map(p => <option key={p.id_persona} value={p.id_persona}>{p.nombre} {p.apellido}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase">Placa *</label>
                    <input className="w-full border rounded-xl p-2.5 font-mono text-center uppercase" value={vehPersonalForm.placa} onChange={e => setVehPersonalForm({...vehPersonalForm, placa:e.target.value})} required placeholder="ABC-1234"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">Marca *</label>
                        <select className="w-full border rounded-xl p-2 text-sm" value={vehPersonalForm.id_marca || ''} onChange={e => setVehPersonalForm({...vehPersonalForm, id_marca:e.target.value, id_modelo:''})} required>
                            <option value="">—</option>
                            {marcasCat.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">Modelo *</label>
                        <select className="w-full border rounded-xl p-2 text-sm" value={vehPersonalForm.id_modelo} onChange={e => setVehPersonalForm({...vehPersonalForm, id_modelo:e.target.value})} required disabled={!vehPersonalForm.id_marca}>
                            <option value="">—</option>
                            {modelosFiltradosMarca(vehPersonalForm.id_marca).map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}
                        </select>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">Color *</label>
                        <select className="w-full border rounded-xl p-2 text-sm" value={vehPersonalForm.id_color} onChange={e => setVehPersonalForm({...vehPersonalForm, id_color:e.target.value})} required>
                            <option value="">—</option>
                            {coloresCat.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase">Tipo</label>
                        <select className="w-full border rounded-xl p-2 text-sm" value={vehPersonalForm.id_tipo} onChange={e => setVehPersonalForm({...vehPersonalForm, id_tipo:e.target.value})}>
                            <option value="">—</option>
                            {tiposVehiculoCat.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
                        </select>
                      </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow">VINCULAR FLOTA</button>
               </form>
            </aside>
            <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <h3 className="font-bold text-gray-800 mb-4">Flota Registrada</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase">
                            <tr><th>Propietario</th><th>Placa</th><th>Marca / Modelo</th><th>Color</th><th className="text-right">Acciones</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {vehiculos.map(v => (
                                <tr key={v.id_vehiculo}>
                                    <td className="py-3 px-2 font-bold text-gray-700">{v.persona?.nombre} {v.persona?.apellido}</td>
                                    <td className="py-3 px-2"><span className="bg-gray-100 px-2 py-1 rounded font-mono font-bold text-xs">{v.placa}</span></td>
                                    <td className="py-3 px-2 text-gray-500">{v.modelo?.marca?.nombre} {v.modelo?.nombre}</td>
                                    <td className="py-3 px-2 text-gray-500">{v.color?.nombre || '—'}</td>
                                    <td className="py-3 px-2 text-right">
                                        <button onClick={() => handleEliminarVehiculo(v)} className="text-red-400 hover:text-red-600"><FaTrash/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {ticketParaImprimir && <TicketPrintView ticket={ticketParaImprimir} onClose={() => setTicketParaImprimir(null)}/>}
      
      {editandoVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white p-6 rounded-2xl w-full max-w-sm">
              <h3 className="font-bold mb-4">Editar Vehículo</h3>
              <form onSubmit={handleEditarVehiculo} className="space-y-3">
                 <input className="w-full border p-2 rounded" value={editVehForm.placa} onChange={e => setEditVehForm({...editVehForm, placa:e.target.value.toUpperCase()})} />
                 <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded">Guardar</button>
                 <button type="button" onClick={() => setEditandoVehiculo(null)} className="w-full text-gray-400">Cancelar</button>
              </form>
           </div>
        </div>
      )}
    </Layout>
  );
}
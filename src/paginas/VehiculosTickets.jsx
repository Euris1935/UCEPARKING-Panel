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
import { ESTADO_PLAZA, ESTADO_TICKET } from '../lib/constants';

// ═══════════════════════════════════════════════════════════
// BD REAL:
//  tickets     → Estado(text), Placa_Capturada, Id_Plaza_Asignada, visitante_id(int FK visitantes.id_visitante)
//  vehiculos   → id_vehiculo(PK), placa, id_persona(UUID), id_marca(FK), id_modelo(FK), id_color(FK)
//  visitantes  → id_visitante(PK int), id_persona(UUID FK personas.id_persona)
//  personas    → id_persona(UUID PK), nombre, apellido
//  marcas_vehiculo  → id_marca, nombre
//  colores_vehiculo → id_color, nombre
// ═══════════════════════════════════════════════════════════

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
          <Row label="Marca"           value={ticket.marca_vehiculo || '—'} />
          <Row label="Color"           value={ticket.color_vehiculo || '—'} />
          <hr />
          <Row label="Plaza Asignada"  value={ticket.plaza?.numero_plaza || `#${ticket.id_plaza}`} bold />
          <Row label="Hora de Entrada" value={new Date(ticket.fecha_emision).toLocaleString('es-DO')} />
          <Row label="Estado"          value={ticket.estado} />
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
  const { esAdmin } = useRbac();
  
  const [loading, setLoading]                 = useState(false);
  const [activeTab, setActiveTab]             = useState('entrada');
  const [tickets, setTickets]                 = useState([]);
  const [ticketsActivos, setTicketsActivos]   = useState(0);
  const [vehiculos, setVehiculos]             = useState([]);
  const [personasSistema, setPersonasSistema] = useState([]);
  const [visitantesReg, setVisitantesReg]     = useState([]);
  const [plazasLibres, setPlazasLibres]       = useState([]);
  const [marcasCat, setMarcasCat]             = useState([]);
  const [coloresCat, setColoresCat]           = useState([]);
  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [searchTerm, setSearchTerm]             = useState('');
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [ticketParaImprimir, setTicketParaImprimir] = useState(null);
  const intervaloRef = useRef(null);

  const [visitanteForm, setVisitanteForm] = useState({
    id_visitante: null, id_persona_visitante: '', nombre: '', apellido: '', telefono: '',
    placa: '', Marca_Vehiculo: '', Color_Vehiculo: '', id_plaza: '', duracion: '60'
  });

  const [vehPersonalForm, setVehPersonalForm] = useState({
    persona_id: '', placa: '', id_marca: '', id_modelo: '', id_color: ''
  });

  const [editandoVehiculo, setEditandoVehiculo] = useState(null);
  const [editVehForm, setEditVehForm]           = useState({ placa: '', id_marca: '', id_color: '' });

  useEffect(() => {
    if (orgId) {
      loadData();
    }
    intervaloRef.current = setInterval(checkExpiredTickets, 60_000);
    const ch = supabase.channel('rt_vt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, loadData)
      .subscribe((s) => { if (s === 'CHANNEL_ERROR') console.error('Error canal rt_vt'); });
    return () => { supabase.removeChannel(ch); clearInterval(intervaloRef.current); };
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    try {
      setIsRefreshing(true);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      
      const [
        { data: epLibre },
        { data: plazasRaw },
        { data: stCat },
        { data: allP },
        { data: allV },
        { data: tks },
        { data: vhs },
        { data: marcas },
        { data: colores }
      ] = await Promise.all([
        supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle(),
        supabase.from('plaza').select('*, zona:id_zona(estado_zona(nombre))').eq('id_estado', 1).eq('organizacion_id', orgId),
        supabase.from('estado_ticket').select('id_estado, nombre'),
        supabase.from('persona').select('*').eq('organizacion_id', orgId).order('nombre'),
        supabase.from('visitante').select('*').eq('organizacion_id', orgId),
        supabase.from('ticket').select('*, plaza:id_plaza_asignada(numero_plaza)').eq('organizacion_id', orgId).gte('fecha_hora_emision', hoy.toISOString()).order('fecha_hora_emision', { ascending: false }),
        supabase.from('vehiculo').select('*, modelo(nombre, marca(nombre)), color(nombre), persona(nombre, apellido)').eq('organizacion_id', orgId).order('created_at', { ascending: false }),
        supabase.from('marca').select('*').order('nombre'),
        supabase.from('color').select('*').order('nombre')
      ]);

      const idLibre = ESTADO_PLAZA.LIBRE;
      setPlazasLibres((plazasRaw || []).filter(p => (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa'));

      const stMap = {}; (stCat || []).forEach(s => { stMap[s.id_estado] = s.nombre; });
      const pMap = {}; (allP || []).forEach(p => { pMap[p.id_persona] = p; });
      const vMap = {}; (allV || []).forEach(v => { vMap[v.id_visitante] = { ...v, persona: pMap[v.id_persona] }; });

      setTickets((tks || []).map(t => ({
          ...t,
          _statusName: stMap[t.id_estado] || '—',
          _personaNombre: vMap[t.id_visitante]?.persona ? `${vMap[t.id_visitante].persona.nombre} ${vMap[t.id_visitante].persona.apellido}` : (t.placa_capturada || '—')
      })));

      setTicketsActivos((tks || []).filter(t => stMap[t.id_estado]?.toLowerCase() === 'activo').length);
      setVehiculos(vhs || []);
      setVisitantesReg(Object.values(vMap));
      setPersonasSistema(allP || []);
      setMarcasCat(marcas || []);
      setColoresCat(colores || []);

    } catch (err) { console.error('Error loadData VehiculosTickets:', err); } finally { setIsRefreshing(false); }
  };

  const handleRegistrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!orgId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user?.id).maybeSingle();

      await registrarLog({
        tipo_nombre,
        descripcion,
        id_persona: uData?.id_persona || null,
        organizacion_id: orgId,
        id_plaza: idPlaza,
        origen: 'Panel Web - Vehiculos y Tickets'
      });
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const checkExpiredTickets = async () => {
    try {
      const idLibre = ESTADO_PLAZA.LIBRE;
      const stActivo = ESTADO_TICKET.ACTIVO;
      const stVencido = ESTADO_TICKET.VENCIDO;

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
      if (vencidos.length > 0) loadData();
    } catch (e) { console.warn('checkExpiredTickets:', e.message); }
  };

  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    if (!currentOrgId) {
      return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
    }
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención','La placa es obligatoria.','warning');
    if (!visitanteForm.id_plaza)     return Swal.fire('Atención','Seleccione una plaza.','warning');
    setLoading(true);
    try {
      // Buscar o crear visitante
      let visitanteId = visitanteForm.id_visitante;
      if (!visitanteId) {
        let pId = visitanteForm.id_persona_visitante;
        
        // Si no hay persona seleccionada, intentamos crearla con el nombre/telefono provisto
        if (!pId && visitanteForm.nombre) {
          const { data: nP, error: nPErr } = await supabase.from('persona').insert([{
            nombre: visitanteForm.nombre.trim(),
            apellido: visitanteForm.apellido.trim(),
            telefono: visitanteForm.telefono.trim() || null
          }]).select('id_persona').single();
          if (nPErr) throw nPErr;
          pId = nP.id_persona;
        }

        if (!pId) {
          setLoading(false);
          return Swal.fire('Atención','Ingrese al menos el nombre del visitante.','warning');
        }

        // Crear visitante vinculado a la persona (nueva o existente)
        const { data: newV, error: vErr } = await supabase
          .from('visitante')
          .insert([{ id_persona: pId }])
          .select().single();
        if (vErr) throw vErr;
        visitanteId = newV.id_visitante;
      }

      const ahora     = new Date().toISOString();
      const minutos   = parseInt(visitanteForm.duracion) || 0;
      const vencimiento = minutos > 0 ? new Date(Date.now() + minutos*60000).toISOString() : null;

      const vencimiento = minutos > 0 ? new Date(Date.now() + minutos*60000).toISOString() : null;

      const idOcupada = ESTADO_PLAZA.RESERVADA; // Usually Occupied/Reserved
      const idEstadoActivo = ESTADO_TICKET.ACTIVO;

      const { data: nuevoTicket, error: tErr } = await supabase
        .from('ticket')
        .insert([{
          id_vehiculo:            null,
          placa_capturada:        visitanteForm.placa.toUpperCase(),
          id_plaza_asignada:      parseInt(visitanteForm.id_plaza),
          id_visitante:           visitanteId,
          id_estado:              idEstadoActivo,
          fecha_hora_emision:     ahora,
          fecha_hora_vencimiento: vencimiento,
          descripcion:            visitanteForm.descripcion || '',
          organizacion_id:        currentOrgId
        }])
        .select('*, plaza:id_plaza_asignada(numero_plaza), estado_ticket(nombre)')
        .single();
      if (tErr) {
        console.error('DEBUG: handleEmitirTicket tErr:', tErr);
        throw tErr;
      }

      await supabase.from('plaza')
        .update({ id_estado: idOcupada })
        .eq('id_plaza', visitanteForm.id_plaza);

      await handleRegistrarLog(EVENT_TYPES.TICKET_EMITIDO,
        `Ticket emitido: ${visitanteForm.placa.toUpperCase()} — Plaza ${nuevoTicket?.plaza?.numero_plaza}.`,
        parseInt(visitanteForm.id_plaza));

      // Enriquecer ticket para vista previa
      const ticketParaPrint = {
        ...nuevoTicket,
        _personaNombre: visitanteForm.nombre ? `${visitanteForm.nombre} ${visitanteForm.apellido}` : '—'
      };
      setTicketParaImprimir(ticketParaPrint);
      setVisitanteForm({
        id_visitante: null, id_persona_visitante: '', nombre: '', apellido: '', telefono: '',
        placa: '', Marca_Vehiculo: '', Color_Vehiculo: '', id_plaza: '', duracion: '60'
      });
      setActiveTab('activos');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  const handleCerrarTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Registrar salida?',
      html: `<b>${ticket.placa_capturada}</b> — Plaza <b>${ticket.plaza?.numero_plaza}</b>`,
      icon: 'question', showCancelButton: true,
      confirmButtonColor: '#16a34a', confirmButtonText: 'Sí, registrar salida'
    });
    if (!result.isConfirmed) return;
    try {
      const ahora = new Date().toISOString();
      const idLibre = ESTADO_PLAZA.LIBRE;
      const idUsado = ESTADO_TICKET.CERRADO;

      const { error, count } = await supabase
        .from('ticket').update({ id_estado: idUsado })
        .eq('id_ticket', ticket.id_ticket);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo actualizar el ticket.');

      const idPlaza = ticket.id_plaza_asignada;
      await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', idPlaza);
      
      await handleRegistrarLog(EVENT_TYPES.TICKET_CERRADO,
        `Salida: ${ticket.placa_capturada} — Plaza ${ticket.plaza?.numero_plaza}. Tiempo: ${calcTiempo(ticket.fecha_hora_emision, ahora)}.`,
        idPlaza);

      Swal.fire('¡Salida Registrada!', `Plaza ${ticket.plaza?.numero_plaza} liberada.`, 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Anular ticket?',
      html: `Ticket <b>#${String(ticket.id_ticket).padStart(5,'0')}</b> — Placa <b>${ticket.placa_capturada}</b>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', confirmButtonText: 'Sí, anular'
    });
    if (!result.isConfirmed) return;
    try {
      const idLibre = ESTADO_PLAZA.LIBRE;
      const idAnulado = ESTADO_TICKET.ANULADO;

      const { error, count } = await supabase
        .from('ticket').update({ id_estado: idAnulado })
        .eq('id_ticket', ticket.id_ticket);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo anular.');

      const idPlaza = ticket.id_plaza_asignada;
      await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', idPlaza);
      await handleRegistrarLog(EVENT_TYPES.TICKET_CERRADO || 'Ticket Anulado',
        `Ticket anulado: ${ticket.placa_capturada} — Plaza ${ticket.plaza?.numero_plaza}.`,
        idPlaza);

      Swal.fire('Anulado', 'Ticket anulado y plaza liberada.', 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEliminarVehiculo = async (vehiculo) => {
    const tkEstActivo = ESTADO_TICKET.ACTIVO;
    const { data: tActivos } = await supabase
      .from('ticket').select('id_ticket')
      .eq('id_vehiculo', vehiculo.id_vehiculo).eq('id_estado', tkEstActivo);
    if (tActivos && tActivos.length > 0)
      return Swal.fire('No se puede eliminar',`Tiene ${tActivos.length} ticket(s) activo(s). Registre la salida primero.`,'warning');

    const r = await Swal.fire({
      title: '¿Eliminar vehículo?', html: `Placa: <b>${vehiculo.placa}</b>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar'
    });
    if (!r.isConfirmed) return;
    try {
      await supabase.from('acceso').delete().eq('id_vehiculo', vehiculo.id_vehiculo);
      await supabase.from('ticket').delete().eq('id_vehiculo', vehiculo.id_vehiculo).neq('id_estado', tkEstActivo);
      const { error, count } = await supabase
        .from('vehiculo').delete({ count: 'exact' }).eq('id_vehiculo', vehiculo.id_vehiculo);
      if (error) throw error;
      if (count === 0) throw new Error('0 filas eliminadas. Verifica permisos RLS.');
      Swal.fire('Eliminado','Vehículo eliminado correctamente.','success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    try {
      const { error, count } = await supabase
        .from('vehiculo')
        .update({
          placa:    editVehForm.placa.toUpperCase(),
          id_color: editVehForm.id_color ? parseInt(editVehForm.id_color) : null
        }, { count: 'exact' })
        .eq('id_vehiculo', editandoVehiculo.id_vehiculo);
      if (error) throw error;
      if (count === 0) throw new Error('0 filas actualizadas. Verifica permisos RLS.');
      Swal.fire('Actualizado','Vehículo actualizado correctamente.','success');
      setEditandoVehiculo(null);
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleVehPersonalSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrgId) {
      return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
    }
    try {
      const { error } = await supabase.from('vehiculo').insert([{
        id_persona: vehPersonalForm.persona_id,
        placa:      vehPersonalForm.placa.toUpperCase(),
        id_color:   vehPersonalForm.id_color ? parseInt(vehPersonalForm.id_color) : null,
        organizacion_id: currentOrgId
      }]);
      if (error) throw error;
      Swal.fire('Registrado','Vehículo vinculado correctamente.','success');
      setVehPersonalForm({ persona_id:'', placa:'', id_marca:'', id_modelo:'', id_color:'' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const calcTiempo = (inicio, fin) => {
    const diff = Math.floor((new Date(fin) - new Date(inicio)) / 60000);
    return diff < 60 ? `${diff} min` : `${Math.floor(diff/60)}h ${diff%60}min`;
  };

  const tabBtn = (id, label, icon) => (
    <button key={id} onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${
        activeTab === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}>
      {icon} {label}
      {id === 'activos' && ticketsActivos > 0 && (
        <span className="ml-1 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{ticketsActivos}</span>
      )}
    </button>
  );

  const estadoBadge = {
    activo:  'bg-green-100 text-green-700 border border-green-200',
    vencido: 'bg-amber-100 text-amber-700 border border-amber-200',
    anulado: 'bg-red-100 text-red-700 border border-red-200',
    usado:   'bg-gray-100 text-gray-600 border border-gray-200'
  };

  return (
    <Layout>
      {ticketParaImprimir && (
        <TicketPrintView ticket={ticketParaImprimir} onClose={() => setTicketParaImprimir(null)} />
      )}

      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Vehículos y Tickets</h2>
        <p className="text-gray-500 mt-1">Control de acceso, emisión de tickets y gestión de la flota.</p>
      </header>

      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada', 'Nueva Entrada', <FaTicketAlt />)}
        {tabBtn('activos', 'Tickets Activos', <FaClipboardCheck />)}
        {tabBtn('flota',   'Flota Registrada', <FaCar />)}
      </div>

      {/* ─── TAB 1: Nueva Entrada ─── */}
      {activeTab === 'entrada' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
              <FaUserPlus className="text-green-600" /> Emisión de Ticket
            </h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Buscar Visitante o Persona</label>
                <SearchableSelect 
                  options={[
                    ...visitantesReg.map(v => ({ value: `v-${v.id_visitante}`, label: `${v.persona?.nombre || ''} ${v.persona?.apellido || ''} (V)` })),
                    ...personasSistema.map(p => ({ value: `p-${p.id_persona}`, label: `${p.nombre || ''} ${p.apellido || ''} (P)` }))
                  ]}
                  value={visitanteForm.id_visitante ? `v-${visitanteForm.id_visitante}` : (visitanteForm.id_persona_visitante ? `p-${visitanteForm.id_persona_visitante}` : '')}
                  onChange={(val) => {
                    if (!val) {
                      setVisitanteForm(f => ({ ...f, id_visitante: null, id_persona_visitante: '', nombre: '', apellido: '' }));
                    } else if (val.startsWith('v-')) {
                      const vid = parseInt(val.replace('v-', ''));
                      const v = visitantesReg.find(vis => vis.id_visitante === vid);
                      setVisitanteForm(f => ({ ...f, id_visitante: v.id_visitante, id_persona_visitante: v.id_persona, nombre: v.persona?.nombre || '', apellido: v.persona?.apellido || '', telefono: v.persona?.telefono || '' }));
                    } else {
                      const pid = val.replace('p-', '');
                      const p = personasSistema.find(x => x.id_persona === pid);
                      setVisitanteForm(f => ({ ...f, id_visitante: null, id_persona_visitante: pid, nombre: p?.nombre || '', apellido: p?.apellido || '', telefono: p?.telefono || '' }));
                    }
                  }}
                  placeholder="Buscar por nombre o apellido..."
                />
              </div>

              {!visitanteForm.id_visitante && (
                <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre</label>
                    <input className="w-full border rounded-lg p-2 text-sm mt-0.5" 
                      value={visitanteForm.nombre}
                      onChange={e => setVisitanteForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Nombre" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Apellido</label>
                    <input className="w-full border rounded-lg p-2 text-sm mt-0.5" 
                      value={visitanteForm.apellido}
                      onChange={e => setVisitanteForm(f => ({ ...f, apellido: e.target.value }))}
                      placeholder="Apellido" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Teléfono</label>
                <input className="w-full border rounded-lg p-2 text-sm mt-0.5" 
                  value={visitanteForm.telefono}
                  onChange={e => setVisitanteForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="809-000-0000" />
              </div>

              <hr className="border-dashed" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Datos del Vehículo</p>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input className="w-full border-2 border-green-300 rounded-lg p-2 text-sm font-mono font-bold uppercase mt-0.5 text-center tracking-widest text-lg"
                  placeholder="ABC-1234"
                  value={visitanteForm.placa}
                  onChange={e => setVisitanteForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Toyota"
                    value={visitanteForm.Marca_Vehiculo}
                    onChange={e => setVisitanteForm(f => ({ ...f, Marca_Vehiculo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Rojo"
                    value={visitanteForm.Color_Vehiculo}
                    onChange={e => setVisitanteForm(f => ({ ...f, Color_Vehiculo: e.target.value }))} />
                </div>
              </div>

              <hr className="border-dashed" />

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Plaza Asignada *</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={visitanteForm.id_plaza}
                  onChange={e => setVisitanteForm(f => ({ ...f, id_plaza: e.target.value }))}
                  required>
                  <option value="">— Seleccionar plaza libre —</option>
                  {plazasLibres.map(p => (
                    <option key={p.id_plaza} value={p.id_plaza}>{p.numero_plaza}</option>
                  ))}
                </select>
                {plazasLibres.length === 0 && (
                  <p className="text-red-500 text-xs mt-1">⚠️ No hay plazas libres disponibles.</p>
                )}
              </div>

              <hr className="border-dashed" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tiempo del Ticket</p>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Duración</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={visitanteForm.duracion}
                  onChange={e => setVisitanteForm(f => ({ ...f, duracion: e.target.value }))}>
                  <option value="0">Sin límite</option>
                  <option value="30">30 minutos</option>
                  <option value="60">1 hora</option>
                  <option value="120">2 horas</option>
                  <option value="240">4 horas</option>
                  <option value="480">8 horas</option>
                  <option value="1440">24 horas</option>
                </select>
                {visitanteForm.duracion !== '0' && visitanteForm.duracion && (
                  <p className="text-xs text-amber-600 font-medium mt-1">
                    ⏰ Vence a las {new Date(Date.now() + parseInt(visitanteForm.duracion)*60000)
                      .toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit' })}
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading || plazasLibres.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow">
                <FaTicketAlt /> {loading ? 'Procesando...' : 'EMITIR TICKET'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-3 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow p-6">
              <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                <FaClipboardCheck className="text-green-600" /> Resumen Actual
              </h3>
              <div className="flex justify-center">
                <div className="bg-green-50 rounded-xl p-6 border border-green-100 text-center w-48">
                  <p className="text-4xl font-extrabold text-green-700">{ticketsActivos}</p>
                  <p className="text-xs text-green-600 font-medium mt-1">Tickets Activos</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ─── TAB 2: Tickets Activos ─── */}
      {activeTab === 'activos' && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between p-5 border-b gap-4 bg-gray-50/50">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FaClipboardCheck className="text-green-600" /> Tickets Activos</h3>
              <p className="text-[10px] text-gray-400">Control de entradas del día</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <input 
                  type="text" 
                  placeholder="Buscar placa o visitante..." 
                  className="w-full pl-8 pr-4 py-2 text-xs border rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSearch className="absolute left-3 top-2.5 text-gray-300 text-[10px]" />
              </div>
              <button 
                onClick={() => { setSearchTerm(''); loadData(); }} 
                disabled={isRefreshing} 
                className="bg-white border text-gray-500 hover:text-green-600 p-2.5 rounded-xl hover:shadow-sm transition disabled:opacity-50"
              >
                  <FaSyncAlt className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">
                <tr>
                  <th className="px-5 py-4 text-left">Ticket</th>
                  <th className="px-5 py-4 text-left">Visitante</th>
                  <th className="px-5 py-4 text-left">Placa</th>
                  <th className="px-5 py-4 text-left">Estado</th>
                  <th className="px-5 py-4 text-left">Plaza</th>
                  <th className="px-5 py-4 text-left">Entrada</th>
                  <th className="px-5 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {tickets
                  .filter(t => 
                    t.placa_capturada?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t._personaNombre?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(t => {
                    const sLower = (t._statusName || '').toLowerCase();
                    const cls = estadoBadge[sLower] || estadoBadge.usado;
                    return (
                      <tr key={t.id_ticket} className="hover:bg-gray-50/80 transition-all group">
                        <td className="px-5 py-4 text-xs font-mono text-gray-400">#{String(t.id_ticket).padStart(5,'0')}</td>
                        <td className="px-5 py-4 font-semibold text-gray-700">{t._personaNombre}</td>
                        <td className="px-5 py-4">
                          <span className="bg-gray-900 text-white font-mono text-[10px] px-2 py-1 rounded shadow-sm">{t.placa_capturada}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase ${cls}`}>
                            {t._statusName}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-600">
                          {t.plaza?.numero_plaza || '—'}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-gray-500">
                          {new Date(t.fecha_hora_emision).toLocaleString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex gap-1 justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setTicketParaImprimir(t)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                              <FaPrint size={14} />
                            </button>
                            {sLower === 'activo' && (
                              <>
                                <button onClick={() => handleCerrarTicket(t)} className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm">
                                  <FaSignOutAlt size={10} /> SALIDA
                                </button>
                                <button onClick={() => handleAnularTicket(t)} className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-[10px] font-bold">
                                  <FaBan size={10} /> ANULAR
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      )}

      {/* ─── TAB 3: Flota Registrada ─── */}
      {activeTab === 'flota' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
              <FaCar className="text-purple-600" /> Vincular Vehículo Personal
            </h3>
            <form onSubmit={handleVehPersonalSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Propietario *</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={vehPersonalForm.persona_id}
                  onChange={e => setVehPersonalForm(f => ({ ...f, persona_id: e.target.value }))}
                  required>
                  <option value="">— Seleccionar persona —</option>
                  {personasSistema.map(p => (
                    <option key={p.id_persona} value={p.id_persona}>{p.nombre} {p.apellido}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input className="w-full border-2 border-purple-200 rounded-lg p-2 text-sm font-mono uppercase tracking-widest text-center text-base mt-0.5"
                  placeholder="ABC-1234"
                  value={vehPersonalForm.placa}
                  onChange={e => setVehPersonalForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required />
              </div>
              {/* Marca desde catálogo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={vehPersonalForm.id_marca}
                  onChange={e => setVehPersonalForm(f => ({ ...f, id_marca: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {marcasCat.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                </select>
              </div>
              {/* Color desde catálogo */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={vehPersonalForm.id_color}
                  onChange={e => setVehPersonalForm(f => ({ ...f, id_color: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {coloresCat.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
                </select>
              </div>
              <button type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow">
                <FaSave /> VINCULAR VEHÍCULO
              </button>
            </form>
          </section>

          <section className="lg:col-span-3 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FaCar className="text-purple-600" /> Flota Registrada
                <span className="ml-2 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {vehiculos.length} vehículos
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-left">Propietario</th>
                    <th className="px-5 py-3 text-left">Placa</th>
                    <th className="px-5 py-3 text-left">Marca / Color</th>
                    <th className="px-5 py-3 text-left">Registro</th>
                    <th className="px-5 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vehiculos.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-10 text-gray-400">No hay vehículos registrados.</td></tr>
                  ) : vehiculos.map(v => (
                    <tr key={v.id_vehiculo} className="hover:bg-gray-50 transition-all">
                      <td className="px-5 py-4 font-medium text-gray-800">
                        {v.persona?.nombre} {v.persona?.apellido}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded text-xs">
                          {v.placa}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        {[v.marca?.nombre, v.color?.nombre].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400">
                        {new Date(v.fecha_registro).toLocaleDateString('es-DO')}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => {
                            setEditandoVehiculo(v);
                            setEditVehForm({ placa: v.placa, id_marca: v.id_marca||'', id_color: v.id_color||'' });
                          }} className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg">
                            <FaEdit size={14} />
                          </button>
                          <button onClick={() => handleEliminarVehiculo(v)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg">
                            <FaTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Modal editar vehículo */}
      {editandoVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Editar Vehículo</h3>
            <form onSubmit={handleEditarVehiculo} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input className="w-full border-2 border-purple-200 rounded-lg p-2 font-mono uppercase tracking-widest text-center text-base mt-0.5"
                  value={editVehForm.placa}
                  onChange={e => setEditVehForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={editVehForm.id_marca}
                  onChange={e => setEditVehForm(f => ({ ...f, id_marca: e.target.value }))}>
                  <option value="">— Sin cambio —</option>
                  {marcasCat.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={editVehForm.id_color}
                  onChange={e => setEditVehForm(f => ({ ...f, id_color: e.target.value }))}>
                  <option value="">— Sin cambio —</option>
                  {coloresCat.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditandoVehiculo(null)}
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-bold">
                  Cancelar
                </button>
                <button type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold shadow">
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
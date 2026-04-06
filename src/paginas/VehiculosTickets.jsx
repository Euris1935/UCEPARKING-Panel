import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaCar, FaTicketAlt, FaUserPlus, FaSave, FaTrash, FaEdit,
  FaPrint, FaSignOutAlt, FaClipboardCheck, FaSyncAlt, FaBan
} from 'react-icons/fa';

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
          <Row label="N° Ticket"       value={`#${String(ticket.Id_Ticket).padStart(6,'0')}`} bold />
          <hr />
          <Row label="Visitante"       value={ticket._personaNombre || '—'} />
          <Row label="Placa"           value={ticket.Placa_Capturada} bold mono />
          <Row label="Marca"           value={ticket.Marca_Vehiculo || '—'} />
          <Row label="Color"           value={ticket.Color_Vehiculo || '—'} />
          <hr />
          <Row label="Plaza Asignada"  value={ticket.plazas?.Numero_Plaza || `#${ticket.Id_Plaza_Asignada}`} bold />
          <Row label="Hora de Entrada" value={new Date(ticket.Fecha_Hora_Emision).toLocaleString('es-DO')} />
          <Row label="Estado"          value={ticket.Estado} />
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
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [currentOrgId, setCurrentOrgId]         = useState(null); // organizacion_id del usuario activo
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
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase
          .from('usuarios')
          .select('id_persona')
          .eq('id', user.id)
          .single();
        if (uData?.id_persona) {
          setCurrentPersonaId(uData.id_persona);
          // Obtener organizacion_id del empleado activo
          const { data: empData } = await supabase
            .from('empleados')
            .select('organizacion_id')
            .eq('id_persona', uData.id_persona)
            .maybeSingle();
          if (empData?.organizacion_id) setCurrentOrgId(empData.organizacion_id);
        }
      }
    };
    init();
    loadData();
    intervaloRef.current = setInterval(checkExpiredTickets, 60_000);
    const ch = supabase.channel('rt_vt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, loadData)
      .subscribe((s) => { if (s === 'CHANNEL_ERROR') console.error('Error canal rt_vt'); });
    return () => { supabase.removeChannel(ch); clearInterval(intervaloRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      // 1. Plazas libres (por id_estado)
      const { data: epLibre } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre_estado', 'Libre').maybeSingle();
      const idLibre = epLibre?.id_estado ?? 1;

      const { data: plazas } = await supabase
        .from('plazas').select('*').eq('id_estado', idLibre);

      // 2. Tickets de hoy
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const { data: tks } = await supabase
        .from('tickets')
        .select('*, plazas(Numero_Plaza)')
        .gte('Fecha_Hora_Emision', hoy.toISOString())
        .order('Fecha_Hora_Emision', { ascending: false });

      // 3. Enriquecer tickets con datos de visitante y persona
      // Usamos RPC para bypassear RLS en visitantes y personas
      let ticketsEnriquecidos = [];
      if (tks && tks.length > 0) {
        const visitanteIds = [...new Set(tks.map(t => t.visitante_id).filter(Boolean))];
        let visitMap = {};
        if (visitanteIds.length > 0) {
          const { data: visitData } = await supabase.rpc('get_visitantes');
          (visitData || []).forEach(v => { visitMap[v.id_visitante] = v; });
        }
        ticketsEnriquecidos = tks.map(t => ({
          ...t,
          _personaNombre: t.visitante_id && visitMap[t.visitante_id]
            ? `${visitMap[t.visitante_id].nombre} ${visitMap[t.visitante_id].apellido}`
            : '—'
        }));
      }

      // 4. Vehículos registrados con JOINs a catálogos
      const { data: vhs } = await supabase
        .from('vehiculos')
        .select(`
          id_vehiculo, placa, Fecha_Registro, id_persona,
          marcas_vehiculo ( nombre ),
          colores_vehiculo ( nombre ),
          personas ( nombre, apellido )
        `)
        .order('Fecha_Registro', { ascending: false });

      // 5. Visitantes registrados — via RPC SECURITY DEFINER (bypassea RLS en visitantes+personas)
      const { data: visitantesData, error: visitErr } = await supabase.rpc('get_visitantes');
      if (visitErr) console.warn('get_visitantes RPC error:', visitErr.message);

      // 6. Personal del sistema via RPC (bypassea RLS en usuarios+personas)
      const { data: orgUsers } = await supabase.rpc('get_usuarios_org');
      const personal = (orgUsers || []).map(u => ({
        id_persona:  u.id_persona,
        nombre:      u.nombre,
        apellido:    u.apellido,
      }));

      // 7. Catálogos
      const { data: marcas }  = await supabase.from('marcas_vehiculo').select('*').order('nombre');
      const { data: colores } = await supabase.from('colores_vehiculo').select('*').order('nombre');

      setPlazasLibres(plazas || []);
      setTickets(ticketsEnriquecidos);
      setTicketsActivos(ticketsEnriquecidos.filter(t => t.Estado === 'Activo').length);
      setVehiculos(vhs || []);
      setVisitantesReg(visitantesData || []);
      setPersonasSistema(personal);
      setMarcasCat(marcas || []);
      setColoresCat(colores || []);
    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const registrarLog = async (tipo, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      // eventos: id_tipo_evento (FK), no Tipo_Evento (texto)
      // Buscar id del tipo de evento
      const { data: tipoData } = await supabase
        .from('tipo_evento').select('id_tipo_evento').ilike('nombre', tipo).maybeSingle();
      await supabase.from('eventos').insert([{
        Fecha_Hora:      new Date().toISOString(),
        id_tipo_evento:  tipoData?.id_tipo_evento || null,
        Descripcion:     descripcion,
        Id_Plaza:        idPlaza,
        id_persona:      currentPersonaId,
        origen_evento:   'Panel Web - Vehículos y Tickets'
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const checkExpiredTickets = async () => {
    try {
      const { data: epLibre } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre_estado','Libre').maybeSingle();
      const idLibre = epLibre?.id_estado ?? 1;
      const { data: vencidos } = await supabase
        .from('tickets').select('Id_Ticket, Id_Plaza_Asignada')
        .eq('Estado', 'Activo')
        .not('Fecha_Hora_Vencimiento', 'is', null)
        .lt('Fecha_Hora_Vencimiento', new Date().toISOString());
      if (!vencidos || vencidos.length === 0) return;
      for (const t of vencidos) {
        await supabase.from('tickets').update({ Estado: 'Vencido' }).eq('Id_Ticket', t.Id_Ticket);
        await supabase.from('plazas').update({ id_estado: idLibre }).eq('Id_Plaza', t.Id_Plaza_Asignada);
      }
      if (vencidos.length > 0) loadData();
    } catch (e) { console.warn('checkExpiredTickets:', e.message); }
  };

  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención','La placa es obligatoria.','warning');
    if (!visitanteForm.id_plaza)     return Swal.fire('Atención','Seleccione una plaza.','warning');
    setLoading(true);
    try {
      // Buscar o crear visitante
      let visitanteId = visitanteForm.id_visitante;
      if (!visitanteId) {
        if (!visitanteForm.id_persona_visitante) {
          setLoading(false);
          return Swal.fire('Atención','Seleccione la persona del visitante.','warning');
        }
        // Crear visitante vinculando a persona existente
        const { data: newV, error: vErr } = await supabase
          .from('visitantes')
          .insert([{ id_persona: visitanteForm.id_persona_visitante }])
          .select().single();
        if (vErr) throw vErr;
        visitanteId = newV.id_visitante;
      }

      const ahora     = new Date().toISOString();
      const minutos   = parseInt(visitanteForm.duracion) || 0;
      const vencimiento = minutos > 0 ? new Date(Date.now() + minutos*60000).toISOString() : null;

      const { data: epOcupada } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre_estado','Ocupada').maybeSingle();
      const idOcupada = epOcupada?.id_estado ?? 2;

      const { data: nuevoTicket, error: tErr } = await supabase
        .from('tickets')
        .insert([{
          id_vehiculo:            null,
          Placa_Capturada:        visitanteForm.placa.toUpperCase(),
          Id_Plaza_Asignada:      parseInt(visitanteForm.id_plaza),
          visitante_id:           visitanteId,
          Estado:                 'Activo',
          Fecha_Hora_Emision:     ahora,
          Fecha_Hora_Vencimiento: vencimiento,
          Color_Vehiculo:         visitanteForm.Color_Vehiculo || null,
          Marca_Vehiculo:         visitanteForm.Marca_Vehiculo || null,
          ...(currentOrgId ? { organizacion_id: currentOrgId } : {})
        }])
        .select('*, plazas(Numero_Plaza)')
        .single();
      if (tErr) throw tErr;

      await supabase.from('plazas')
        .update({ id_estado: idOcupada })
        .eq('Id_Plaza', visitanteForm.id_plaza);

      await registrarLog('TICKET_EMITIDO',
        `Ticket emitido: ${visitanteForm.placa.toUpperCase()} — Plaza ${nuevoTicket?.plazas?.Numero_Plaza}.`,
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
      html: `<b>${ticket.Placa_Capturada}</b> — Plaza <b>${ticket.plazas?.Numero_Plaza}</b>`,
      icon: 'question', showCancelButton: true,
      confirmButtonColor: '#16a34a', confirmButtonText: 'Sí, registrar salida'
    });
    if (!result.isConfirmed) return;
    try {
      const ahora = new Date().toISOString();
      const { data: epLibre } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre_estado','Libre').maybeSingle();
      const idLibre = epLibre?.id_estado ?? 1;

      const { error, count } = await supabase
        .from('tickets').update({ Estado: 'Usado' }, { count: 'exact' })
        .eq('Id_Ticket', ticket.Id_Ticket);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo actualizar el ticket. Verifica políticas RLS en Supabase.');

      await supabase.from('plazas').update({ id_estado: idLibre }).eq('Id_Plaza', ticket.Id_Plaza_Asignada);
      await registrarLog('SALIDA_VEHICULO',
        `Salida: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}. Tiempo: ${calcTiempo(ticket.Fecha_Hora_Emision, ahora)}.`,
        ticket.Id_Plaza_Asignada);

      Swal.fire('¡Salida Registrada!', `Plaza ${ticket.plazas?.Numero_Plaza} liberada.`, 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Anular ticket?',
      html: `Ticket <b>#${String(ticket.Id_Ticket).padStart(5,'0')}</b> — Placa <b>${ticket.Placa_Capturada}</b>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', confirmButtonText: 'Sí, anular'
    });
    if (!result.isConfirmed) return;
    try {
      const { data: epLibre } = await supabase
        .from('estado_plaza').select('id_estado').ilike('nombre_estado','Libre').maybeSingle();
      const idLibre = epLibre?.id_estado ?? 1;

      const { error, count } = await supabase
        .from('tickets').update({ Estado: 'Anulado' }, { count: 'exact' })
        .eq('Id_Ticket', ticket.Id_Ticket);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo anular. Verifica políticas RLS en Supabase.');

      await supabase.from('plazas').update({ id_estado: idLibre }).eq('Id_Plaza', ticket.Id_Plaza_Asignada);
      await registrarLog('TICKET_ANULADO',
        `Ticket anulado: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}.`,
        ticket.Id_Plaza_Asignada);

      Swal.fire('Anulado', 'Ticket anulado y plaza liberada.', 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEliminarVehiculo = async (vehiculo) => {
    const { data: tActivos } = await supabase
      .from('tickets').select('Id_Ticket')
      .eq('id_vehiculo', vehiculo.id_vehiculo).eq('Estado', 'Activo');
    if (tActivos && tActivos.length > 0)
      return Swal.fire('No se puede eliminar',`Tiene ${tActivos.length} ticket(s) activo(s). Registre la salida primero.`,'warning');

    const r = await Swal.fire({
      title: '¿Eliminar vehículo?', html: `Placa: <b>${vehiculo.placa}</b>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar'
    });
    if (!r.isConfirmed) return;
    try {
      await supabase.from('registros_acceso').delete().eq('vehiculo_id', vehiculo.id_vehiculo);
      await supabase.from('tickets').delete().eq('id_vehiculo', vehiculo.id_vehiculo).neq('Estado','Activo');
      const { error, count } = await supabase
        .from('vehiculos').delete({ count: 'exact' }).eq('id_vehiculo', vehiculo.id_vehiculo);
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
        .from('vehiculos')
        .update({
          placa:    editVehForm.placa.toUpperCase(),
          id_marca: editVehForm.id_marca ? parseInt(editVehForm.id_marca) : null,
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
    try {
      const { error } = await supabase.from('vehiculos').insert([{
        id_persona: vehPersonalForm.persona_id,
        placa:      vehPersonalForm.placa.toUpperCase(),
        id_marca:   vehPersonalForm.id_marca ? parseInt(vehPersonalForm.id_marca) : null,
        id_color:   vehPersonalForm.id_color ? parseInt(vehPersonalForm.id_color) : null
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
    Activo:  'bg-green-100 text-green-700 border border-green-200',
    Vencido: 'bg-amber-100 text-amber-700 border border-amber-200',
    Anulado: 'bg-red-100 text-red-700 border border-red-200',
    Usado:   'bg-gray-100 text-gray-600 border border-gray-200'
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
              {/* Visitante registrado */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">¿Visitante ya registrado?</label>
                <select className="w-full border rounded-lg p-2 text-sm bg-gray-50"
                  value={visitanteForm.id_visitante ?? ''}
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      const v = visitantesReg.find(vis => vis.id_visitante === parseInt(val));
                      if (v) setVisitanteForm(f => ({
                        ...f,
                        id_visitante: v.id_visitante,
                        id_persona_visitante: v.id_persona,
                        nombre:   v.personas?.nombre   || '',
                        apellido: v.personas?.apellido || ''
                      }));
                    } else {
                      setVisitanteForm(f => ({ ...f, id_visitante: null, id_persona_visitante: '', nombre: '', apellido: '' }));
                    }
                  }}>
                  <option value="">— Nuevo visitante —</option>
                  {visitantesReg.map(v => (
                    <option key={v.id_visitante} value={v.id_visitante}>
                      {v.personas?.nombre} {v.personas?.apellido}
                    </option>
                  ))}
                </select>
              </div>

              {/* Si es nuevo, seleccionar persona del sistema */}
              {!visitanteForm.id_visitante && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Persona *</label>
                  <select className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    value={visitanteForm.id_persona_visitante}
                    onChange={e => {
                      const p = personasSistema.find(x => x.id_persona === e.target.value);
                      setVisitanteForm(f => ({
                        ...f,
                        id_persona_visitante: e.target.value,
                        nombre:   p?.nombre   || '',
                        apellido: p?.apellido || ''
                      }));
                    }}
                    required={!visitanteForm.id_visitante}>
                    <option value="">— Seleccionar persona —</option>
                    {personasSistema.map(p => (
                      <option key={p.id_persona} value={p.id_persona}>{p.nombre} {p.apellido}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>
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
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FaClipboardCheck className="text-green-600" /> Lista de Tickets de Hoy
            </h3>
            <button onClick={loadData} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100">
              <FaSyncAlt />
            </button>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FaTicketAlt className="mx-auto text-4xl mb-3 opacity-20" />
              <p>No hay tickets registrados hoy.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-left">Ticket</th>
                    <th className="px-5 py-3 text-left">Visitante</th>
                    <th className="px-5 py-3 text-left">Placa</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                    <th className="px-5 py-3 text-left">Vehículo</th>
                    <th className="px-5 py-3 text-left">Plaza</th>
                    <th className="px-5 py-3 text-left">Entrada</th>
                    <th className="px-5 py-3 text-left">Tiempo</th>
                    <th className="px-5 py-3 text-left">Vence</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tickets.map(t => {
                    const cls = estadoBadge[t.Estado] || 'bg-gray-100 text-gray-500';
                    return (
                      <tr key={t.Id_Ticket} className="hover:bg-gray-50 transition-all">
                        <td className="px-5 py-4 text-xs text-gray-400 font-mono">
                          #{String(t.Id_Ticket).padStart(5,'0')}
                        </td>
                        <td className="px-5 py-4 font-medium text-gray-800">{t._personaNombre}</td>
                        <td className="px-5 py-4">
                          <span className="bg-gray-900 text-white font-mono text-xs px-2 py-1 rounded">
                            {t.Placa_Capturada}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`font-bold text-xs px-2 py-1 rounded-full ${cls}`}>{t.Estado}</span>
                        </td>
                        <td className="px-5 py-4 text-gray-500 text-xs">
                          {[t.Marca_Vehiculo, t.Color_Vehiculo].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs border border-green-200">
                            {t.plazas?.Numero_Plaza}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-500">
                          {new Date(t.Fecha_Hora_Emision).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'})}
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-amber-600">
                          {t.Estado === 'Activo'
                            ? calcTiempo(t.Fecha_Hora_Emision, new Date().toISOString())
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4 text-xs">
                          {t.Fecha_Hora_Vencimiento ? (() => {
                            const msLeft = new Date(t.Fecha_Hora_Vencimiento) - Date.now();
                            const pulsar = t.Estado === 'Activo' && msLeft < 10*60000;
                            return (
                              <span className={`font-bold ${pulsar ? 'text-red-600 animate-pulse' : 'text-gray-500'}`}>
                                {new Date(t.Fecha_Hora_Vencimiento).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}
                              </span>
                            );
                          })() : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => setTicketParaImprimir(t)} title="Ver/Imprimir"
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition">
                              <FaPrint size={15} />
                            </button>
                            {t.Estado === 'Activo' && (<>
                              <button onClick={() => handleCerrarTicket(t)} title="Registrar salida"
                                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition shadow">
                                <FaSignOutAlt size={12} /> Salida
                              </button>
                              <button onClick={() => handleAnularTicket(t)} title="Anular ticket"
                                className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg font-bold text-xs transition">
                                <FaBan size={12} /> Anular
                              </button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                        {v.personas?.nombre} {v.personas?.apellido}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded text-xs">
                          {v.placa}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        {[v.marcas_vehiculo?.nombre, v.colores_vehiculo?.nombre].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400">
                        {new Date(v.Fecha_Registro).toLocaleDateString('es-DO')}
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

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
import {
  FaTicketAlt, FaUserPlus, FaPrint, FaSignOutAlt,
  FaClipboardCheck, FaSyncAlt, FaBan
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

function TicketPrintView({ ticket, onClose, esReimpresion = false }) {
  const handlePrint = () => window.print();
  const calcTiempoTicket = () => {
    if (ticket.Estado === 'Cerrado' && ticket._horaSalida) {
      const diff = Math.floor((new Date(ticket._horaSalida) - new Date(ticket.Fecha_Hora_Emision)) / 60000);
      return diff < 60 ? `${diff} min` : `${Math.floor(diff / 60)}h ${diff % 60}min`;
    }
    return null;
  };
  const tiempoEstancia = calcTiempoTicket();
  const qrData = `TICKET-${ticket.Id_Ticket}-${ticket.Placa_Capturada}`;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-green-700 text-white p-5 text-center relative">
          <h2 className="text-2xl font-extrabold tracking-widest">UCE PARKING</h2>
          <p className="text-green-200 text-xs mt-1">TICKET DE ACCESO / VISITANTE</p>
          {esReimpresion && <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded rotate-12 border border-yellow-600 shadow">⚠ REIMPRESIÓN</div>}
        </div>
        <div id="ticket-print-area" className="p-6 space-y-3 text-sm">
          <Row label="N° Ticket" value={`#${String(ticket.Id_Ticket).padStart(6, '0')}`} bold />
          {esReimpresion && <p className="text-center text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">⚠ COPIA — TICKET REIMPRESO</p>}
          <hr />
          <Row label="Visitante" value={`${ticket._visitanteNombre ?? ticket.visitantes?.personas?.nombre ?? ticket.personas?.nombre ?? '—'} ${ticket._visitanteApellido ?? ticket.visitantes?.personas?.apellido ?? ticket.personas?.apellido ?? ''}`} />
          {(ticket._visitanteCedula || ticket.visitantes?.personas?.cedula || ticket.personas?.cedula || ticket._cedula) && (
            <Row label="Cédula" value={ticket._visitanteCedula || ticket.visitantes?.personas?.cedula || ticket.personas?.cedula || ticket._cedula} />
          )}
          <Row label="Placa" value={ticket.Placa_Capturada} bold mono />
          <Row label="Marca" value={ticket._marca || ticket.vehiculos?.marcas_vehiculo?.nombre || '—'} />
          <Row label="Modelo" value={ticket._modelo || ticket.vehiculos?.modelos_vehiculo?.nombre || '—'} />
          <Row label="Color" value={ticket._color || ticket.vehiculos?.colores_vehiculo?.nombre || '—'} />
          <hr />
          <Row label="Plaza Asignada" value={ticket.plazas?.Numero_Plaza || `#${ticket.Id_Plaza_Asignada}`} bold />
          <Row label="Hora de Entrada" value={new Date(ticket.Fecha_Hora_Emision).toLocaleString('es-DO')} />
          {(ticket.estado_ticket?.nombre_estado === 'Cerrado' || ticket.Estado === 'Cerrado') && ticket._horaSalida && (
            <><Row label="Hora de Salida" value={new Date(ticket._horaSalida).toLocaleString('es-DO')} />{tiempoEstancia && <Row label="Duración" value={tiempoEstancia} bold />}</>
          )}
          <Row label="Estado" value={ticket.Estado || ticket.estado_ticket?.nombre_estado || '—'} />
          <hr />
          <div className="flex justify-center py-2"><QRCodeSVG value={qrData} size={120} level="M" /></div>
          <p className="text-center text-[10px] text-gray-400 mt-1">Presente este código QR al salir del parqueo.</p>
        </div>
        <div className="flex gap-3 p-4 border-t print:hidden">
          <button onClick={handlePrint} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"><FaPrint /> Imprimir</button>
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg font-bold">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, mono }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono bg-gray-900 text-white px-2 py-0.5 rounded' : ''}`}>{value}</span>
    </div>
  );
}

const calcTiempo = (inicio, fin) => {
  const diff = Math.floor((new Date(fin) - new Date(inicio)) / 60000);
  return diff < 60 ? `${diff} min` : `${Math.floor(diff / 60)}h ${diff % 60}min`;
};

export default function Tickets() {
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Parqueo', 'crear');
  const canEdit   = tienePermiso('Módulo Parqueo', 'editar');

  const [loading,                 setLoading]                 = useState(false);
  const [orgId,                   setOrgId]                   = useState(null); // organizacion_id del usuario activo
  const [activeTab,               setActiveTab]               = useState(canCreate ? 'entrada' : 'activos');
  const [tickets,                 setTickets]                 = useState([]);
  const [ticketsActivos,          setTicketsActivos]          = useState(0);
  const [visitantesRegistrados,   setVisitantesRegistrados]   = useState([]);
  const [plazasLibres,            setPlazasLibres]            = useState([]);
  const [currentPersonaId,        setCurrentPersonaId]        = useState(null);
  const [listaMarcas,             setListaMarcas]             = useState([]);
  const [listaModelos,            setListaModelos]            = useState([]);
  const [listaColores,            setListaColores]            = useState([]);
  const [ticketParaImprimir,      setTicketParaImprimir]      = useState(null);
  const [visitanteForm, setVisitanteForm] = useState({
    id_visitante: null, nombre: '', apellido: '', cedula: '', telefono: '', sexo: 'M',
    placa: '', id_marca: '', id_modelo: '', id_color: '', id_plaza: '', duracion: '60'
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase
          .from('usuarios').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) {
          setCurrentPersonaId(uData.id_persona);
          const { data: empData } = await supabase
            .from('empleados').select('organizacion_id')
            .eq('id_persona', uData.id_persona).maybeSingle();
          if (empData?.organizacion_id) setOrgId(empData.organizacion_id);
        }
      }
    };
    init();
    loadData();
    const intervalo = setInterval(() => checkExpiredTickets(), 60_000);
    const ch = supabase.channel('rt_tickets_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
  }, []);

  const loadData = async () => {
    try {
      const { data: plazas } = await supabase.from('plazas').select('*').eq('id_estado', 1).order('Numero_Plaza');
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      // Quitamos el embed de visitantes para evitar PGRST201 (FK duplicada visitante_id/id_visitante)
      // Los nombres se resuelven client-side desde visitantesRegistrados
      const { data: tks, error: tksErr } = await supabase
        .from('tickets')
        .select('*, estado_ticket(nombre_estado), personas(nombre, apellido), plazas(Numero_Plaza), vehiculos(marcas_vehiculo(nombre), colores_vehiculo(nombre), modelos_vehiculo(nombre))')
        .gte('Fecha_Hora_Emision', hoy.toISOString())
        .order('Fecha_Hora_Emision', { ascending: false });
      if (tksErr) console.error('[Tickets] Error cargando tickets:', tksErr.message, tksErr.code);

      const { data: visitantesData, error: visErr } = await supabase
        .from('visitantes')
        .select('id_visitante, created_at, personas(id_persona, nombre, apellido, cedula, telefono, sexo)')
        .order('created_at', { ascending: false });
      if (visErr) console.error('[Tickets] Error cargando visitantes:', visErr.message, visErr.code);
      console.log('[Tickets] Visitantes cargados:', visitantesData?.length ?? 0, visitantesData);

      const { data: catMarcas } = await supabase.from('marcas_vehiculo').select('id_marca, nombre').order('nombre');
      const { data: catModelos } = await supabase.from('modelos_vehiculo').select('id_modelo, nombre, id_marca').order('nombre');
      const { data: catColores } = await supabase.from('colores_vehiculo').select('id_color, nombre').order('nombre');
      // Contar globalmente los tickets activos sin limitarse al día actual
      const { count: countActivos } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('Estado', 'Activo');
      
      setPlazasLibres(plazas || []);
      setTickets(tks || []);
      setTicketsActivos(countActivos || 0);
      setVisitantesRegistrados(visitantesData || []);
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const registrarLog = async (tipo, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre_tipo', tipo).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Tickets').maybeSingle();
      await supabase.from('eventos').insert([{ 
        Fecha_Hora: new Date().toISOString(), 
        Descripcion: descripcion, 
        Id_Plaza: idPlaza, 
        id_persona: currentPersonaId, 
        id_tipo_evento: te?.id_tipo || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const checkExpiredTickets = async () => {
    try {
      const ahora = new Date().toISOString();
      // Usar campo texto Estado (no id_estado numérico)
      const { data: vencidos } = await supabase
        .from('tickets').select('Id_Ticket, Id_Plaza_Asignada')
        .eq('Estado', 'Activo')
        .not('Fecha_Hora_Vencimiento', 'is', null)
        .lt('Fecha_Hora_Vencimiento', ahora);
      if (!vencidos || vencidos.length === 0) return;
      for (const t of vencidos) {
        // Sincronizar ambas columnas de estado al vencer
        await supabase.from('tickets').update({ id_estado: 3, Estado: 'Vencido' }).eq('Id_Ticket', t.Id_Ticket);
        await supabase.from('plazas').update({ id_estado: 1 }).eq('Id_Plaza', t.Id_Plaza_Asignada);
      }
      if (vencidos.length > 0) loadData();
    } catch (e) { console.warn('checkExpiredTickets error:', e.message); }
  };

  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención', 'La placa es obligatoria.', 'warning');
    const placaLimpia = visitanteForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 6) return Swal.fire('Atención', 'La placa no debe superar los 6 caracteres.', 'warning');
    if (!visitanteForm.id_plaza) return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');
    setLoading(true);
    try {
      let visitanteId = visitanteForm.id_visitante;
      if (!visitanteId) {
        if (!visitanteForm.nombre.trim() || !visitanteForm.apellido.trim()) {
          setLoading(false);
          return Swal.fire('Atención', 'Nombre y Apellido son obligatorios.', 'warning');
        }
        // RPC SECURITY DEFINER — bypasea la política WITH CHECK en 'personas'
        // La política RLS impide INSERT directo desde el cliente
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('crear_visitante', {
          p_nombre:   visitanteForm.nombre.trim(),
          p_apellido: visitanteForm.apellido.trim(),
          p_cedula:   visitanteForm.cedula   || null,
          p_telefono: visitanteForm.telefono || null,
          p_sexo:     visitanteForm.sexo     || 'M',
        });
        if (rpcErr) {
          // Si la RPC aún no existe en la BD, mostrar el SQL a ejecutar
          if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('function')) {
            setLoading(false);
            return Swal.fire({
              title: 'SQL requerido en Supabase',
              html: `La función <code>crear_visitante</code> no existe.<br><br>
                     Ejecuta el script <b>Bloque 4</b> del artifact SQL en el editor de Supabase.`,
              icon: 'warning'
            });
          }
          throw rpcErr;
        }
        visitanteId = rpcResult; // la RPC retorna el id_visitante directamente
      }


      // NUEVO: Resolver vehículo ANTES de crear el ticket
      const placa = visitanteForm.placa.toUpperCase();
      const { data: vEx } = await supabase.from('vehiculos').select('id_vehiculo').eq('placa', placa).maybeSingle();
      let vehiculoId = vEx?.id_vehiculo;
      if (!vehiculoId) {
        const { data: vNuevo, error: vNErr } = await supabase.from('vehiculos').insert({ 
          placa, 
          id_marca: visitanteForm.id_marca ? parseInt(visitanteForm.id_marca) : null, 
          id_modelo: visitanteForm.id_modelo ? parseInt(visitanteForm.id_modelo) : null, 
          id_color: visitanteForm.id_color ? parseInt(visitanteForm.id_color) : null,
          organizacion_id: orgId
        }).select('id_vehiculo').single();
        if (vNErr) throw vNErr;
        vehiculoId = vNuevo?.id_vehiculo;
      }

      const ahora = new Date().toISOString();
      const minutos = parseInt(visitanteForm.duracion) || 0;
      const vencimiento = minutos > 0 ? new Date(Date.now() + minutos * 60000).toISOString() : null;
      
      const { data: nuevoTicket, error: tErr } = await supabase.from('tickets').insert([{ 
        id_vehiculo: vehiculoId, 
        Placa_Capturada: placa, 
        Id_Plaza_Asignada: parseInt(visitanteForm.id_plaza), 
        id_visitante: visitanteId, 
        Estado: 'Activo',
        id_estado: 1,
        Fecha_Hora_Emision: ahora, 
        Fecha_Hora_Vencimiento: vencimiento,
        ...(orgId ? { organizacion_id: orgId } : {})
      }]).select('*, estado_ticket(nombre_estado), plazas(Numero_Plaza)').single();
      
      if (tErr) throw tErr;

      // Enriquecer manualmente el ticket con datos del visitante para el print view
      // (no usamos embed de visitantes por el PGRST201 de la FK duplicada)
      const visitanteSeleccionado = visitantesRegistrados.find(v => v.id_visitante === visitanteId);
      nuevoTicket._visitanteNombre = visitanteForm.nombre || visitanteSeleccionado?.personas?.nombre || '';
      nuevoTicket._visitanteApellido = visitanteForm.apellido || visitanteSeleccionado?.personas?.apellido || '';
      nuevoTicket._visitanteCedula = visitanteForm.cedula || visitanteSeleccionado?.personas?.cedula || null;
      nuevoTicket._marca = listaMarcas.find(m => m.id_marca === parseInt(visitanteForm.id_marca))?.nombre || null;
      nuevoTicket._modelo = listaModelos.find(m => m.id_modelo === parseInt(visitanteForm.id_modelo))?.nombre || null;
      nuevoTicket._color = listaColores.find(c => c.id_color === parseInt(visitanteForm.id_color))?.nombre || null;
      nuevoTicket._cedula = visitanteForm.cedula || null;

      await supabase.from('plazas').update({ id_estado: 2 }).eq('Id_Plaza', visitanteForm.id_plaza);
      await registrarLog('TICKET_EMITIDO', `Ticket emitido: ${visitanteForm.placa.toUpperCase()} — Plaza ${nuevoTicket?.plazas?.Numero_Plaza}.`, parseInt(visitanteForm.id_plaza));
      setTicketParaImprimir(nuevoTicket);
      setVisitanteForm({ id_visitante: null, nombre: '', apellido: '', cedula: '', telefono: '', sexo: 'M', placa: '', id_marca: '', id_modelo: '', id_color: '', id_plaza: '', duracion: '60' });
      setActiveTab('activos');
      loadData();
      // Registro acceso + barrera
      try {
        const plazaId = parseInt(visitanteForm.id_plaza);
        if (vehiculoId) {
          const { data: raActivo } = await supabase.from('registros_acceso').select('id_registro').eq('id_vehiculo', vehiculoId).is('salida_at', null).maybeSingle();
          if (raActivo) await supabase.from('registros_acceso').update({ salida_at: new Date().toISOString() }).eq('id_registro', raActivo.id_registro);
          await supabase.from('registros_acceso').insert({ 
            entrada_at: new Date().toISOString(), 
            id_vehiculo: vehiculoId, 
            ticket_id: nuevoTicket.Id_Ticket, 
            Id_Plaza: plazaId, 
            id_dispositivo_entrada: null,
            organizacion_id: orgId
          });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) fetch('http://localhost:4000/api/access/open-main', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } }).catch(() => {});
      } catch (e) { console.warn('Barrera/Acceso error no crítico:', e.message); }
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  const handleCerrarTicket = async (ticket) => {
    const result = await Swal.fire({ title: '¿Registrar salida?', html: `<b>${ticket.Placa_Capturada}</b> — Plaza <b>${ticket.plazas?.Numero_Plaza}</b>`, icon: 'question', showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: 'Sí, registrar salida' });
    if (!result.isConfirmed) return;
    const ahora = new Date().toISOString();
    try {
      // Sincronizar ambas columnas de estado al cerrar
      const { error: tkErr, count: tkCount } = await supabase.from('tickets').update({ id_estado: 2, Estado: 'Cerrado' }, { count: 'exact' }).eq('Id_Ticket', ticket.Id_Ticket);
      if (tkErr) throw tkErr;
      const vt = visitantesRegistrados.find(v => v.id_visitante === ticket.id_visitante);
      const nombreCompleto = vt ? `${vt.personas?.nombre || ''} ${vt.personas?.apellido || ''}`.trim() : (ticket.personas?.nombre || 'Visitante');

      await Promise.all([
        supabase.from('plazas').update({ id_estado: 1 }).eq('Id_Plaza', ticket.Id_Plaza_Asignada),
        (async () => { const { data: ra } = await supabase.from('registros_acceso').select('id_registro').eq('ticket_id', ticket.Id_Ticket).is('salida_at', null).maybeSingle(); if (ra) await supabase.from('registros_acceso').update({ salida_at: ahora }).eq('id_registro', ra.id_registro); })(),
        registrarLog('SALIDA_VEHICULO', `Salida: ${nombreCompleto} — Vehículo: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}. Tiempo: ${calcTiempo(ticket.Fecha_Hora_Emision, ahora)}.`, ticket.Id_Plaza_Asignada),
        (async () => { try { const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) fetch('http://localhost:4000/api/access/open-main', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } }).catch(() => {}); } catch (_) {} })()
      ]);
      // Desactivado a petición del usuario: No lanzar modal de factura de salida automáticamente.
      // setTicketParaImprimir({ ...ticket, Estado: 'Cerrado', _horaSalida: ahora, _esReimpresion: false });
      Swal.fire('¡Salida Registrada!', `La plaza ${ticket.plazas?.Numero_Plaza} quedó libre.`, 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({ title: '¿Anular ticket?', html: `Ticket <b>#${String(ticket.Id_Ticket).padStart(5, '0')}</b>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, anular' });
    if (!result.isConfirmed) return;
    try {
      // Sincronizar ambas columnas de estado al anular
      const { error: tkErr, count: tkCount } = await supabase.from('tickets').update({ id_estado: 4, Estado: 'Anulado' }, { count: 'exact' }).eq('Id_Ticket', ticket.Id_Ticket);
      if (tkErr) throw tkErr;
      await supabase.from('plazas').update({ id_estado: 1 }).eq('Id_Plaza', ticket.Id_Plaza_Asignada);
      await registrarLog('TICKET_ANULADO', `Ticket anulado: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}.`, ticket.Id_Plaza_Asignada);
      Swal.fire('Anulado', 'El ticket fue anulado y la plaza quedó libre.', 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const tabBtn = (id, label, icon) => (
    <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${activeTab === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
      {icon} {label}
      {id === 'activos' && ticketsActivos > 0 && <span className="ml-1 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{ticketsActivos}</span>}
    </button>
  );

  return (
    <Layout>
      {ticketParaImprimir && <TicketPrintView ticket={ticketParaImprimir} onClose={() => setTicketParaImprimir(null)} esReimpresion={ticketParaImprimir._esReimpresion || false} />}
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Tickets de Acceso</h2>
        <p className="text-gray-500 mt-1">Emisión y control de tickets de visitantes.</p>
      </header>
      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {canCreate && tabBtn('entrada', 'Nueva Entrada', <FaTicketAlt />)}
        {tabBtn('activos', 'Tickets Activos', <FaClipboardCheck />)}
      </div>

      {canCreate && activeTab === 'entrada' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800"><FaUserPlus className="text-green-600" /> Emisión de Ticket</h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">¿Visitante ya registrado?</label>
                <select className="w-full border rounded-lg p-2 text-sm focus:ring-green-500 bg-gray-50" value={visitanteForm.id_visitante ?? ''} onChange={(e) => { const val = e.target.value; if (val) { const v = visitantesRegistrados.find(vis => vis.id_visitante === parseInt(val)); if (v) setVisitanteForm(f => ({ ...f, id_visitante: v.id_visitante, nombre: v.personas?.nombre || '', apellido: v.personas?.apellido || '', cedula: v.personas?.cedula || '', telefono: v.personas?.telefono || '', sexo: v.personas?.sexo || 'M' })); } else { setVisitanteForm(f => ({ ...f, id_visitante: null, nombre: '', apellido: '', cedula: '', telefono: '', sexo: 'M' })); } }}>
                  <option value="">— Nuevo visitante —</option>
                  {visitantesRegistrados.map(v => <option key={v.id_visitante} value={v.id_visitante}>{v.personas?.nombre} {v.personas?.apellido}{v.personas?.telefono ? ` — ${v.personas.telefono}` : ''}</option>)}
                </select>
              </div>
              <div className={`grid grid-cols-2 gap-3 ${visitanteForm.id_visitante ? 'opacity-50 pointer-events-none' : ''}`}>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase">Nombre *</label><input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Juan" value={visitanteForm.nombre} onChange={e => setVisitanteForm(f => ({ ...f, nombre: e.target.value }))} required={!visitanteForm.id_visitante} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase">Apellido *</label><input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Pérez" value={visitanteForm.apellido} onChange={e => setVisitanteForm(f => ({ ...f, apellido: e.target.value }))} required={!visitanteForm.id_visitante} /></div>
              </div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Teléfono</label><input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="809-000-0000" value={visitanteForm.telefono} onChange={e => setVisitanteForm(f => ({ ...f, telefono: e.target.value }))} /></div>
              <div className={visitanteForm.id_visitante ? 'opacity-50 pointer-events-none' : ''}>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Cédula</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm mt-0.5 font-mono tracking-widest"
                  placeholder="000-0000000-0"
                  value={visitanteForm.cedula}
                  maxLength={13}
                  onChange={e => {
                    // formatea: 000-0000000-0
                    const digits = e.target.value.replace(/\D/g, '');
                    let fmt = digits;
                    if (digits.length > 3) fmt = digits.slice(0, 3) + '-' + digits.slice(3);
                    if (digits.length > 10) fmt = digits.slice(0, 3) + '-' + digits.slice(3, 10) + '-' + digits.slice(10, 11);
                    setVisitanteForm(f => ({ ...f, cedula: fmt }));
                  }}
                />
              </div>
              <hr className="border-dashed" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Datos del Vehículo</p>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (máx. 6 caracteres)</label><input className="w-full border-2 border-green-300 focus:border-green-500 rounded-lg p-2 text-sm font-mono font-bold uppercase mt-0.5 text-center tracking-widest text-lg" placeholder="ABC123" value={visitanteForm.placa} maxLength={7} onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (val.length <= 6) setVisitanteForm(f => ({ ...f, placa: val })); }} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={visitanteForm.id_marca} onChange={e => setVisitanteForm(f => ({ ...f, id_marca: e.target.value, id_modelo: '' }))}><option value="">— Seleccionar —</option>{listaMarcas.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}</select></div>
                <div><label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={visitanteForm.id_modelo} onChange={e => setVisitanteForm(f => ({ ...f, id_modelo: e.target.value }))} disabled={!visitanteForm.id_marca}><option value="">— Seleccionar —</option>{listaModelos.filter(m => m.id_marca === parseInt(visitanteForm.id_marca)).map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}</select></div>
              </div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Color</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={visitanteForm.id_color} onChange={e => setVisitanteForm(f => ({ ...f, id_color: e.target.value }))}><option value="">— Seleccionar —</option>{listaColores.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}</select></div>
              <hr className="border-dashed" />
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Plaza Asignada *</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5 focus:ring-green-500" value={visitanteForm.id_plaza} onChange={e => setVisitanteForm(f => ({ ...f, id_plaza: e.target.value }))} required><option value="">— Seleccionar plaza libre —</option>{plazasLibres.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}</select>{plazasLibres.length === 0 && <p className="text-red-500 text-xs mt-1">⚠️ No hay plazas libres disponibles.</p>}</div>
              <hr className="border-dashed" />
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Duración *</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={visitanteForm.duracion} onChange={e => setVisitanteForm(f => ({ ...f, duracion: e.target.value }))}><option value="0">Sin límite</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="240">4 horas</option><option value="480">8 horas</option><option value="1440">24 horas</option></select></div>
              {visitanteForm.duracion !== '0' && visitanteForm.duracion && <p className="text-xs text-amber-600 font-medium">⏰ Vence a las {new Date(Date.now() + parseInt(visitanteForm.duracion) * 60000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</p>}
              <button type="submit" disabled={loading || plazasLibres.length === 0} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-base transition flex items-center justify-center gap-2 shadow">
                <FaTicketAlt /> {loading ? 'Procesando...' : 'EMITIR TICKET'}
              </button>
            </form>
          </section>
          <section className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow p-6"><h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><FaClipboardCheck className="text-green-600" /> Resumen Actual</h3><div className="flex justify-center"><div className="bg-green-50 rounded-xl p-6 border border-green-100 text-center w-48"><p className="text-4xl font-extrabold text-green-700">{ticketsActivos}</p><p className="text-xs text-green-600 font-medium mt-1">Tickets Activos</p></div></div></div>
          </section>
        </div>
      )}

      {activeTab === 'activos' && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FaClipboardCheck className="text-green-600" /> Lista de Tickets del Día</h3>
            <button onClick={loadData} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition"><FaSyncAlt /></button>
          </div>
          {tickets.length === 0
            ? <div className="text-center py-16 text-gray-400"><FaTicketAlt className="mx-auto text-4xl mb-3 opacity-20" /><p>No hay tickets registrados hoy.</p></div>
            : (
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
                      const estadoNombre = t.estado_ticket?.nombre_estado || t.Estado || '—';
                      const estadoStyles = { Activo: "bg-green-100 text-green-700 border border-green-200", Vencido: "bg-amber-100 text-amber-700 border border-amber-200", Anulado: "bg-red-100 text-red-700 border border-red-200", Cerrado: "bg-gray-100 text-gray-600 border border-gray-200" };
                      // Lookup client-side del visitante (evita PGRST201 de FK duplicada)
                      const visitanteT = visitantesRegistrados.find(v => v.id_visitante === t.id_visitante);
                      const nombreVisitante = visitanteT?.personas?.nombre ?? t._visitanteNombre ?? t.personas?.nombre ?? '—';
                      const apellidoVisitante = visitanteT?.personas?.apellido ?? t._visitanteApellido ?? t.personas?.apellido ?? '';
                      return (
                        <tr key={t.Id_Ticket} className="hover:bg-gray-50 transition-all">
                          <td className="px-5 py-4 text-xs text-gray-400 font-mono">#{String(t.Id_Ticket).padStart(5, '0')}</td>
                          <td className="px-5 py-4 font-medium text-gray-800">{nombreVisitante} {apellidoVisitante}</td>
                          <td className="px-5 py-4"><span className="bg-gray-900 text-white font-mono text-xs px-2 py-1 rounded">{t.Placa_Capturada}</span></td>
                          <td className="px-5 py-4"><span className={`font-bold text-xs px-2 py-1 rounded-full ${estadoStyles[estadoNombre] || 'bg-gray-100 text-gray-500'}`}>{estadoNombre}</span></td>
                          <td className="px-5 py-4 text-gray-500 text-xs">{[t._marca || t.vehiculos?.marcas_vehiculo?.nombre, t._modelo || t.vehiculos?.modelos_vehiculo?.nombre, t._color || t.vehiculos?.colores_vehiculo?.nombre].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="px-5 py-4"><span className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs border border-green-200">{t.plazas?.Numero_Plaza}</span></td>
                          <td className="px-5 py-4 text-xs text-gray-500">{new Date(t.Fecha_Hora_Emision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-5 py-4 text-xs font-bold text-amber-600">{estadoNombre === 'Activo' ? calcTiempo(t.Fecha_Hora_Emision, new Date().toISOString()) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-4 text-xs">{t.Fecha_Hora_Vencimiento ? <span className={`font-bold ${estadoNombre === 'Activo' && (new Date(t.Fecha_Hora_Vencimiento) - Date.now()) < 600000 ? 'text-red-600 animate-pulse' : 'text-gray-500'}`}>{new Date(t.Fecha_Hora_Vencimiento).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={async () => {
                                const vt = visitantesRegistrados.find(v => v.id_visitante === t.id_visitante);
                                let salida = null;
                                if (estadoNombre === 'Cerrado') {
                                    const { data: ra } = await supabase.from('registros_acceso').select('salida_at').eq('ticket_id', t.Id_Ticket).not('salida_at', 'is', null).maybeSingle();
                                    salida = ra?.salida_at || t.Fecha_Hora_Vencimiento || null;
                                }
                                setTicketParaImprimir({
                                  ...t,
                                  _esReimpresion: true,
                                  _horaSalida: salida,
                                  _visitanteNombre: vt?.personas?.nombre || t.personas?.nombre || '',
                                  _visitanteApellido: vt?.personas?.apellido || t.personas?.apellido || '',
                                  _visitanteCedula: vt?.personas?.cedula || t.personas?.cedula || null,
                                });
                              }} title="Reimprimir" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"><FaPrint size={15} /></button>
                              {estadoNombre === 'Activo' && canEdit && (<>
                                <button onClick={() => handleCerrarTicket(t)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition shadow"><FaSignOutAlt size={12} /> Salida</button>
                                <button onClick={() => handleAnularTicket(t)} className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg font-bold text-xs transition"><FaBan size={12} /> Anular</button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </Layout>
  );
}

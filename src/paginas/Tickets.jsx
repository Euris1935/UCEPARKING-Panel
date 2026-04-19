
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
import {
  FaTicketAlt, FaUserPlus, FaPrint, FaSignOutAlt,
  FaClipboardCheck, FaSyncAlt, FaBan, FaTimes, FaUserTag
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import SearchableSelect from '../componentes/SearchableSelect';

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
  const qrData = `TICKET-${ticket.id_ticket}-${ticket.placa_capturada}`;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-green-700 text-white p-5 text-center relative">
          <h2 className="text-2xl font-extrabold tracking-widest">UCE PARKING</h2>
          <p className="text-green-200 text-xs mt-1">TICKET DE ACCESO / VISITANTE</p>
          {esReimpresion && <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded rotate-12 border border-yellow-600 shadow">⚠ REIMPRESIÓN</div>}
        </div>
        <div id="ticket-print-area" className="p-6 space-y-3 text-sm">
          <Row label="N° Ticket" value={`#${String(ticket.id_ticket).padStart(6, '0')}`} bold />
          {esReimpresion && <p className="text-center text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">⚠ COPIA — TICKET REIMPRESO</p>}
          <hr />
          <Row label="Visitante" value={ticket._personaNombre || 'V. General'} />
          {(ticket._visitanteCedula || ticket.visitante?.persona?.cedula || ticket.persona?.cedula || ticket._cedula) && (
            <Row label="Cédula" value={ticket._visitanteCedula || ticket.visitante?.persona?.cedula || ticket.persona?.cedula || ticket._cedula} />
          )}
          <Row label="Placa" value={ticket.placa_capturada} bold mono />
          <Row label="Marca" value={ticket._marca || ticket.vehiculo?.marca?.nombre || '—'} />
          <Row label="Modelo" value={ticket._modelo || ticket.vehiculo?.modelo?.nombre || '—'} />
          <Row label="Color" value={ticket._color || ticket.vehiculo?.color?.nombre || '—'} />
          <hr />
          <Row label="Entrada" value={new Date(ticket.fecha_hora_emision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })} />
          {ticket._horaSalida && (
            <Row 
              label="Salida" 
              value={new Date(ticket._horaSalida).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })} 
              labelClass="text-red-600"
              valueClass="text-red-600 font-mono"
            />
          )}
          <Row label="Plaza" value={ticket.plaza?.numero_plaza || `#${ticket.id_plaza_asignada}`} bold />
          <Row label="Estado" value={ticket._statusName || '—'} />
          {ticket.Descripcion && ticket.Descripcion.trim() && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Observaciones</p>
              <p className="text-xs text-gray-700">{ticket.Descripcion}</p>
            </div>
          )}
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
  const [isRefreshing,            setIsRefreshing]            = useState(false);
  const [orgId,                   setOrgId]                   = useState(null);
  const [activeTab,               setActiveTab]               = useState(canCreate ? 'entrada' : 'activos');
  const [tickets,                 setTickets]                 = useState([]);
  const [searchTerm,              setSearchTerm]              = useState('');
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
    placa: '', id_marca: '', id_modelo: '', id_color: '', id_plaza: '', duracion: '60', descripcion: ''
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase
          .from('usuario').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) {
          setCurrentPersonaId(uData.id_persona);
          const { data: empData } = await supabase
            .from('empleado').select('organizacion_id')
            .eq('id_persona', uData.id_persona).maybeSingle();
          if (empData?.organizacion_id) setOrgId(empData.organizacion_id);
        }
      }
    };
    init();
    loadData();
    const intervalo = setInterval(() => checkExpiredTickets(), 60_000);
    const ch = supabase.channel('rt_tickets_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zona' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibrePlaza = epLibre?.id_estado || 1;

      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

      const { data: rawPlazas } = await supabase
        .from('plaza')
        .select('*, zona:id_zona(estado_zona(nombre))')
        .eq('id_estado', idEstLibrePlaza)
        .order('numero_plaza');
      
      // Blindaje: Solo considerar libres las que id_estado=Libre Y NO tienen contrato activo
      const { data: asigsActivas } = await supabase.from('asignacion').select('id_plaza').eq('id_estado', 1);
      const plazasAsignadasIds = new Set(asigsActivas?.map(a => a.id_plaza) || []);

      const plazas = (rawPlazas || []).filter(p => {
        const est = p.zona?.estado_zona?.nombre || 'Activa';
        return est === 'Activa' && !plazasAsignadasIds.has(p.id_plaza);
      });

      const { data: stCat } = await supabase.from('estado_ticket').select('id_estado, nombre');
      const stMap = {}; (stCat || []).forEach(s => { stMap[s.id_estado] = s.nombre; });

      const { data: vhData } = await supabase.from('vehiculo').select('id_vehiculo, placa, id_modelo, id_color, modelo(nombre, marca(nombre)), color(nombre)');
      const vhMap = {}; 
      (vhData || []).forEach(v => {
        vhMap[v.id_vehiculo] = {
          marca: v.modelo?.marca?.nombre,
          modelo: v.modelo?.nombre,
          color: v.color?.nombre
        };
      });

      const { data: vRaw } = await supabase.from('visitante').select('id_visitante, id_persona, created_at');
      let vMap = {};
      if (vRaw && vRaw.length > 0) {
        const pIds = vRaw.map(v => v.id_persona).filter(Boolean);
        const { data: pData } = await supabase.from('persona').select('*').in('id_persona', pIds);
        const pMap = {}; (pData || []).forEach(p => { pMap[p.id_persona] = p; });
        vRaw.forEach(v => {
          vMap[v.id_visitante] = { ...v, persona: pMap[v.id_persona] };
        });
      }

      const { data: tks } = await supabase
        .from('ticket')
        .select('*, plaza:id_plaza_asignada(numero_plaza)')
        .gte('fecha_hora_emision', hoy.toISOString())
        .order('fecha_hora_emision', { ascending: false });

      const closedIds = (tks || []).filter(t => stMap[t.id_estado]?.toLowerCase() === 'cerrado').map(t => t.id_ticket);
      let exitMap = {};
      if (closedIds.length > 0) {
        const { data: exits } = await supabase.from('acceso').select('ticket_id, salida_at').in('ticket_id', closedIds).not('salida_at', 'is', null);
        (exits || []).forEach(e => { exitMap[e.ticket_id] = e.salida_at; });
      }

      const ticketsEnriquecidos = (tks || []).map(t => {
        const vInfo = vMap[t.id_visitante];
        const vhInfo = vhMap[t.id_vehiculo] || {};
        return {
          ...t,
          _statusName: stMap[t.id_estado] || '—',
          _personaNombre: vInfo ? `${vInfo.persona?.nombre || ''} ${vInfo.persona?.apellido || ''}` : '—',
          _marca: vhInfo.marca || null,
          _modelo: vhInfo.modelo || null,
          _color: vhInfo.color || null,
          _horaSalida: exitMap[t.id_ticket] || null
        };
      });

      const { data: catMarcas } = await supabase.from('marca').select('id_marca, nombre').order('nombre');
      const { data: catModelos } = await supabase.from('modelo').select('id_modelo, nombre, id_marca').order('nombre');
      const { data: catColores } = await supabase.from('color').select('id_color, nombre').order('nombre');

      setPlazasLibres(plazas || []);
      setTickets(ticketsEnriquecidos);
      setTicketsActivos(ticketsEnriquecidos.filter(t => t._statusName?.toLowerCase() === 'activo').length);
      setVisitantesRegistrados(Object.values(vMap).sort((a,b) => (a.persona?.nombre || '').localeCompare(b.persona?.nombre || '')));
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
    } catch (err) { console.error('Error cargando datos:', err); } finally { setIsRefreshing(false); }
  };

  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Tickets').maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_plaza: idPlaza, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id_tipo || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const checkExpiredTickets = async () => {
    try {
      const ahora = new Date().toISOString();
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibrePlaza = epLibre?.id_estado || 1;
      const { data: stActivo } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
      const idEstActivoTk = stActivo?.id_estado || 1;
      const { data: stVencido } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Vencido').maybeSingle();
      const idEstVencidoTk = stVencido?.id_estado || 3;

      const { data: vencidos } = await supabase
        .from('ticket').select('id_ticket, id_plaza_asignada')
        .eq('id_estado', idEstActivoTk)
        .not('fecha_hora_vencimiento', 'is', null)
        .lt('fecha_hora_vencimiento', ahora);
      if (!vencidos || vencidos.length === 0) return;
      for (const t of vencidos) {
        await supabase.from('ticket').update({ id_estado: idEstVencidoTk }).eq('id_ticket', t.id_ticket);
        await supabase.from('plaza').update({ id_estado: idEstLibrePlaza }).eq('id_plaza', t.id_plaza_asignada);
      }
      if (vencidos.length > 0) loadData();
    } catch (e) { console.warn('checkExpiredTickets error:', e.message); }
  };

  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    
    if (!orgId) {
      return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
    }

    if (!visitanteForm.placa.trim()) return Swal.fire('Atención', 'La placa es obligatoria.', 'warning');
    const placaLimpia = visitanteForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 7) return Swal.fire('Atención', 'La placa no debe superar los 7 caracteres (1 letra y 6 números).', 'warning');
    if (!visitanteForm.id_plaza) return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');
    if (!visitanteForm.descripcion.trim()) return Swal.fire('Atención', 'La descripción u observaciones son obligatorias.', 'warning');
    setLoading(true);
    try {
      let visitanteId = visitanteForm.id_visitante;
      if (!visitanteId) {
        if (!visitanteForm.nombre.trim() || !visitanteForm.apellido.trim()) {
          setLoading(false);
          return Swal.fire('Atención', 'Nombre y Apellido son obligatorios.', 'warning');
        }
        
        const { data: newP, error: pErr } = await supabase
          .from('persona')
          .insert([{
            nombre: visitanteForm.nombre.trim(),
            apellido: visitanteForm.apellido.trim(),
            cedula: visitanteForm.cedula || null,
            telefono: visitanteForm.telefono || null,
            sexo: visitanteForm.sexo || 'M'
          }])
          .select('id_persona').single();
        if (pErr) throw pErr;

        const { data: newV, error: vErr } = await supabase
          .from('visitante')
          .insert([{ id_persona: newP.id_persona }])
          .select('id_visitante').single();
        if (vErr) throw vErr;
        
        visitanteId = newV.id_visitante;
      }

      const placa = visitanteForm.placa.toUpperCase();
      const { data: vEx } = await supabase.from('vehiculo').select('id_vehiculo').eq('placa', placa).maybeSingle();
      let vehiculoId = vEx?.id_vehiculo;
      if (!vehiculoId) {
        const { data: vNuevo, error: vNErr } = await supabase.from('vehiculo').insert({ 
          placa, 
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
      
      const { data: stActivo } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
      const idEstActivoTk = stActivo?.id_estado || 1;
      const { data: epOcupada } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Ocupada').maybeSingle();
      const idEstOcupPlaza = epOcupada?.id_estado || 2;

      const { data: nuevoTicket, error: tErr } = await supabase.from('ticket').insert([{ 
        id_vehiculo: vehiculoId, 
        placa_capturada: placa, 
        id_plaza_asignada: parseInt(visitanteForm.id_plaza), 
        id_visitante: visitanteId, 
        id_estado: idEstActivoTk,
        fecha_hora_emision: ahora, 
        fecha_hora_vencimiento: vencimiento,
        descripcion: visitanteForm.descripcion.trim() || '',
        organizacion_id: orgId
      }]).select('*, estado_ticket(nombre), plaza(numero_plaza)').single();
      
      if (tErr) throw tErr;

      const visitanteSeleccionado = visitantesRegistrados.find(v => v.id_visitante === visitanteId);
      const nombreFinal = visitanteForm.nombre || visitanteSeleccionado?.persona?.nombre || '';
      const apellidoFinal = visitanteForm.apellido || visitanteSeleccionado?.persona?.apellido || '';
      
      nuevoTicket._personaNombre = `${nombreFinal} ${apellidoFinal}`.trim() || 'V. General';
      nuevoTicket._visitanteCedula = visitanteForm.cedula || visitanteSeleccionado?.persona?.cedula || null;
      nuevoTicket._marca = listaMarcas.find(m => m.id_marca === parseInt(visitanteForm.id_marca))?.nombre || null;
      nuevoTicket._modelo = listaModelos.find(m => m.id_modelo === parseInt(visitanteForm.id_modelo))?.nombre || null;
      nuevoTicket._color = listaColores.find(c => c.id_color === parseInt(visitanteForm.id_color))?.nombre || null;
      nuevoTicket._cedula = visitanteForm.cedula || null;

      await supabase.from('plaza').update({ id_estado: idEstOcupPlaza }).eq('id_plaza', visitanteForm.id_plaza);
      const nombreVisitanteLog = `${nuevoTicket._visitanteNombre} ${nuevoTicket._visitanteApellido}`.trim() || 'Visitante';
      await registrarLog('TICKET_EMITIDO', `Ticket emitido: ${nombreVisitanteLog} — Vehículo: ${visitanteForm.placa.toUpperCase()} — Plaza ${nuevoTicket?.plaza?.numero_plaza}.`, parseInt(visitanteForm.id_plaza));
      setTicketParaImprimir(nuevoTicket);
      setVisitanteForm({ id_visitante: null, nombre: '', apellido: '', cedula: '', telefono: '', sexo: 'M', placa: '', id_marca: '', id_modelo: '', id_color: '', id_plaza: '', duracion: '60', descripcion: '' });
      setActiveTab('activos');
      loadData();
      try {
        const plazaId = parseInt(visitanteForm.id_plaza);
        if (vehiculoId) {
          const { data: raActivo } = await supabase.from('acceso').select('id_registro').eq('id_vehiculo', vehiculoId).is('salida_at', null).maybeSingle();
          if (raActivo) await supabase.from('acceso').update({ salida_at: new Date().toISOString() }).eq('id_registro', raActivo.id_registro);
          await supabase.from('acceso').insert({ 
            entrada_at: new Date().toISOString(), 
            id_vehiculo: vehiculoId, 
            ticket_id: nuevoTicket.id_ticket, 
            id_plaza: plazaId, 
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
    const result = await Swal.fire({ title: '¿Registrar salida?', html: `<b>${ticket.placa_capturada}</b> — Plaza <b>${ticket.plaza?.numero_plaza || ''}</b>`, icon: 'question', showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: 'Sí, registrar salida' });
    if (!result.isConfirmed) return;
    const ahora = new Date().toISOString();
    try {
      const { data: stCerrado } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Cerrado').maybeSingle();
      const idEstCerrTk = stCerrado?.id_estado || 2;
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibPlaza = epLibre?.id_estado || 1;

      const { error: tkErr } = await supabase.from('ticket').update({ id_estado: idEstCerrTk }).eq('id_ticket', ticket.id_ticket);
      if (tkErr) throw tkErr;
      
      const vt = visitantesRegistrados.find(v => v.id_visitante === ticket.id_visitante);
      const nombreCompleto = vt ? `${vt.persona?.nombre || ''} ${vt.persona?.apellido || ''}`.trim() : 'Visitante';

      const ticketCerrado = {
        ...ticket,
        _statusName: 'Cerrado',
        _horaSalida: ahora,
        _personaNombre: nombreCompleto,
        _esReimpresion: true
      };

      await Promise.all([
        supabase.from('plaza').update({ id_estado: idEstLibPlaza }).eq('id_plaza', ticket.id_plaza_asignada),
        (async () => { const { data: ra } = await supabase.from('acceso').select('id_registro').eq('ticket_id', ticket.id_ticket).is('salida_at', null).maybeSingle(); if (ra) await supabase.from('acceso').update({ salida_at: ahora }).eq('id_registro', ra.id_registro); })(),
        registrarLog('SALIDA_VEHICULO', `Salida: ${nombreCompleto} — Vehículo: ${ticket.placa_capturada} — Plaza ${ticket.plaza?.numero_plaza}. Tiempo: ${calcTiempo(ticket.fecha_hora_emision, ahora)}.`, ticket.id_plaza_asignada),
        (async () => { try { const { data: { session } } = await supabase.auth.getSession(); if (session?.access_token) fetch('http://localhost:4000/api/access/open-main', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` } }).catch(() => {}); } catch (_) {} })()
      ]);
      
      setTicketParaImprimir(ticketCerrado);
      Swal.fire('¡Salida Registrada!', `La plaza ${ticket.plaza?.numero_plaza} quedó libre.`, 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({ title: '¿Anular ticket?', html: `Ticket <b>#${String(ticket.id_ticket).padStart(5, '0')}</b>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, anular' });
    if (!result.isConfirmed) return;
    try {
      const { data: stAnulado } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Anulado').maybeSingle();
      const idEstAnuTk = stAnulado?.id_estado || 4;
      const { data: epLibre } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstLibPlaza = epLibre?.id_estado || 1;

      const { error: tkErr } = await supabase.from('ticket').update({ id_estado: idEstAnuTk }).eq('id_ticket', ticket.id_ticket);
      if (tkErr) throw tkErr;
      await Promise.all([
        supabase.from('plaza').update({ id_estado: idEstLibPlaza }).eq('id_plaza', ticket.id_plaza_asignada),
        supabase.from('acceso').update({ salida_at: new Date().toISOString() }).eq('ticket_id', ticket.id_ticket).is('salida_at', null)
      ]);
      await registrarLog('TICKET_ANULADO', `Ticket anulado: ${ticket.placa_capturada} — Plaza ${ticket.plaza?.numero_plaza}.`, ticket.id_plaza_asignada);
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
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2"><FaUserPlus className="text-green-600" /> Emisión de Ticket</h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">¿Visitante ya registrado?</label>
                <SearchableSelect
                  options={visitantesRegistrados.map(v => ({ value: v.id_visitante, label: `${v.persona?.nombre} ${v.persona?.apellido}${v.persona?.telefono ? ` — ${v.persona.telefono}` : ''}` }))}
                  value={visitanteForm.id_visitante ?? ''}
                  onChange={(val) => { 
                    if (val) { 
                      const v = visitantesRegistrados.find(vis => String(vis.id_visitante) === String(val)); 
                      if (v) setVisitanteForm(f => ({ ...f, id_visitante: v.id_visitante, nombre: v.persona?.nombre || '', apellido: v.persona?.apellido || '', cedula: v.persona?.cedula || '', telefono: v.persona?.telefono || '', sexo: v.persona?.sexo || 'M' })); 
                    } else { 
                      setVisitanteForm(f => ({ ...f, id_visitante: null, nombre: '', apellido: '', cedula: '', telefono: '', sexo: 'M' })); 
                    } 
                  }}
                  placeholder="— Nuevo visitante —"
                  className="bg-gray-50/50"
                  focusRingClass="focus:ring-green-500"
                  selectedItemClass="bg-green-100 text-green-800"
                />
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
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (1 Letra + 6 Números)</label><input className="w-full border-2 border-green-300 focus:border-green-500 rounded-lg p-2 text-sm font-mono font-bold uppercase mt-0.5 text-center tracking-widest text-lg" placeholder="L 010536" value={visitanteForm.placa} maxLength={8} onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const letterMatch = val.match(/[A-Z]/); let nuevaPlaca = ''; if (letterMatch) { const letter = letterMatch[0]; const digits = val.replace(/[A-Z]/g, '').replace(/[^0-9]/g, '').slice(0, 6); nuevaPlaca = digits ? `${letter} ${digits}` : letter; } setVisitanteForm(f => ({ ...f, placa: nuevaPlaca })); }} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <SearchableSelect options={listaMarcas.map(m => ({ value: m.id_marca, label: m.nombre }))} value={visitanteForm.id_marca} onChange={(val) => setVisitanteForm(f => ({ ...f, id_marca: val, id_modelo: '' }))} placeholder="— Seleccionar —" focusRingClass="focus:ring-green-500" selectedItemClass="bg-green-100 text-green-800" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                  <SearchableSelect options={listaModelos.filter(m => m.id_marca === parseInt(visitanteForm.id_marca)).map(m => ({ value: m.id_modelo, label: m.nombre }))} value={visitanteForm.id_modelo} onChange={(val) => setVisitanteForm(f => ({ ...f, id_modelo: val }))} disabled={!visitanteForm.id_marca} placeholder="— Seleccionar —" focusRingClass="focus:ring-green-500" selectedItemClass="bg-green-100 text-green-800" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                <SearchableSelect options={listaColores.map(c => ({ value: c.id_color, label: c.nombre }))} value={visitanteForm.id_color} onChange={(val) => setVisitanteForm(f => ({ ...f, id_color: val }))} placeholder="— Seleccionar —" focusRingClass="focus:ring-green-500" selectedItemClass="bg-green-100 text-green-800" />
              </div>
              <hr className="border-dashed" />
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Plaza Asignada *</label>
                <SearchableSelect options={plazasLibres.map(p => ({ value: p.id_plaza, label: p.numero_plaza }))} value={visitanteForm.id_plaza} onChange={(val) => setVisitanteForm(f => ({ ...f, id_plaza: val }))} placeholder="— Seleccionar plaza libre —" focusRingClass="focus:ring-green-500" selectedItemClass="bg-green-100 text-green-800" />
                {plazasLibres.length === 0 && <p className="text-red-500 text-xs mt-1">⚠️ No hay plazas libres disponibles.</p>}
              </div>
              <hr className="border-dashed" />
              <div><label className="text-[10px] font-bold text-gray-400 uppercase">Duración *</label><select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={visitanteForm.duracion} onChange={e => setVisitanteForm(f => ({ ...f, duracion: e.target.value }))}><option value="0">Sin límite</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="240">4 horas</option><option value="480">8 horas</option><option value="1440">24 horas</option></select></div>
              {visitanteForm.duracion !== '0' && visitanteForm.duracion && <p className="text-xs text-amber-600 font-medium">⏰ Vence a las {new Date(Date.now() + parseInt(visitanteForm.duracion) * 60000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</p>}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Descripción / Observaciones</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm mt-0.5 resize-none focus:ring-1 focus:ring-green-400 outline-none"
                  rows={3}
                  placeholder="Ej: Visita al depto. de RRHH, vehículo particular..."
                  value={visitanteForm.descripcion}
                  onChange={e => setVisitanteForm(f => ({ ...f, descripcion: e.target.value }))}
                  maxLength={300}
                  required
                />
                {visitanteForm.descripcion.length > 0 && (
                  <p className="text-[10px] text-gray-400 text-right mt-0.5">{visitanteForm.descripcion.length}/300</p>
                )}
              </div>
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
          <div className="flex flex-col md:flex-row items-center justify-between p-5 border-b gap-4 bg-gray-50/50">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FaClipboardCheck className="text-green-600" /> Lista de Tickets del Día</h3>
              <p className="text-[10px] text-gray-500 font-medium">Gestiona y visualiza todos los movimientos de hoy</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <input 
                  type="text" 
                  placeholder="Buscar por placa o nombre..." 
                  className="w-full pl-8 pr-4 py-2 text-xs border rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <FaSyncAlt className="absolute left-3 top-2.5 text-gray-300 text-[10px]" />
              </div>
              <button 
                onClick={() => { setSearchTerm(''); loadData(); }} 
                disabled={isRefreshing} 
                title="Sincronizar datos"
                className="bg-white border text-gray-500 hover:text-green-600 p-2.5 rounded-xl hover:shadow-sm transition disabled:opacity-50"
              >
                  <FaSyncAlt className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {tickets.length === 0
            ? <div className="text-center py-16 text-gray-400"><FaTicketAlt className="mx-auto text-4xl mb-3 opacity-20" /><p>No hay tickets registrados hoy.</p></div>
            : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">
                    <tr>
                      <th className="px-5 py-4 text-left">Ticket</th>
                      <th className="px-5 py-4 text-left">Visitante</th>
                      <th className="px-5 py-4 text-left">Placa</th>
                      <th className="px-5 py-4 text-left">Estado</th>
                      <th className="px-5 py-4 text-left">Plaza</th>
                      <th className="px-5 py-4 text-left">Entrada</th>
                      <th className="px-5 py-4 text-left">Salida/Vence</th>
                      <th className="px-5 py-4 text-left">Tiempo</th>
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
                        const sName = t._statusName || '—';
                        const sLower = sName.toLowerCase();
                        const cls = {
                          activo:  'bg-green-100 text-green-700 ring-1 ring-green-200',
                          vencido: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
                          anulado: 'bg-red-100 text-red-700 ring-1 ring-red-200',
                          cerrado: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                        }[sLower] || 'bg-gray-100 text-gray-500';

                        return (
                          <tr key={t.id_ticket} className="hover:bg-gray-50/80 transition-all select-none group">
                            <td className="px-5 py-4 text-xs text-gray-400 font-mono">
                              #{String(t.id_ticket).padStart(5, '0')}
                            </td>
                            <td className="px-5 py-4 font-semibold text-gray-700">
                              {t._personaNombre}
                            </td>
                            <td className="px-5 py-4">
                              <span className="bg-gray-900 text-white font-mono text-[10px] px-2 py-1 rounded-md shadow-sm">{t.placa_capturada}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${cls}`}>
                                {sName}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-xs font-bold text-gray-600">
                              {t.plaza?.numero_plaza || '—'}
                            </td>
                            <td className="px-5 py-4 text-[11px] text-gray-500 font-medium">
                              {new Date(t.fecha_hora_emision).toLocaleString('es-DO', { day: 'numeric', month: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })}
                            </td>
                            <td className="px-5 py-4 text-[11px] text-gray-400">
                              {(t._statusName?.toLowerCase() === 'cerrado' && t._horaSalida)
                                ? new Date(t._horaSalida).toLocaleString('es-DO', { day: 'numeric', month: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
                                : t.fecha_hora_vencimiento 
                                  ? new Date(t.fecha_hora_vencimiento).toLocaleString('es-DO', { day: 'numeric', month: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
                                  : '—'}
                            </td>
                            <td className="px-5 py-4 text-xs font-bold text-amber-600">
                              {sLower === 'activo'
                                ? <span className="animate-pulse">{calcTiempo(t.fecha_hora_emision, new Date().toISOString())}</span>
                                : (t._horaSalida ? <span className="text-gray-400 font-normal">{calcTiempo(t.fecha_hora_emision, t._horaSalida)}</span> : '—')}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <div className="flex gap-1 justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => setTicketParaImprimir({ ...t, _esReimpresion: true })} 
                                  title="Reimprimir Comprobante" 
                                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition"
                                >
                                  <FaPrint size={14} />
                                </button>
                                {sLower === 'activo' && (
                                  <>
                                    <button 
                                      onClick={() => handleCerrarTicket(t)} 
                                      title="Registrar Salida" 
                                      className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold transition shadow-sm"
                                    >
                                      <FaSignOutAlt size={11} /> SALIDA
                                    </button>
                                    <button 
                                      onClick={() => handleAnularTicket(t)} 
                                      title="Anular Ticket" 
                                      className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-xl text-[10px] font-bold transition"
                                    >
                                      <FaTimes size={11} />
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
            )
          }
        </div>
      )}
    </Layout>
  );
}

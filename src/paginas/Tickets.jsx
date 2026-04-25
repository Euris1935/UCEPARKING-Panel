import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { QRCodeSVG } from 'qrcode.react';
import {
  FaTicketAlt, FaUserPlus, FaPrint, FaSignOutAlt,
  FaClipboardCheck, FaSyncAlt, FaBan, FaTimes, FaHistory
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

// ─────────────────────────────────────────────────────────────
// NOTA DE CAMBIOS:
// - Tabla `visitante` ELIMINADA de la BD → datos inline en ticket
// - ticket NO tiene: id_visitante, id_persona, salida_at
// - ticket SÍ tiene: visitante_nombre, visitante_apellido,
//                    visitante_telefono, visitante_sexo, descripcion
// - El SELECT y el INSERT fueron adaptados en consecuencia
// ─────────────────────────────────────────────────────────────

function TicketPrintView({ ticket, onClose, esReimpresion = false }) {
  const handlePrint = () => window.print();

  const calcTiempoTicket = () => {
    if (ticket._statusName === 'Cerrado' && ticket._horaSalida) {
      const diff = Math.floor((new Date(ticket._horaSalida) - new Date(ticket.fecha_hora_emision)) / 60000);
      return diff < 60 ? `${diff} min` : `${Math.floor(diff / 60)}h ${diff % 60}min`;
    }
    return null;
  };

  const qrData = `TICKET-${ticket.id_ticket}-${ticket.placa_capturada}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:p-0 print:bg-transparent">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[95vh] print:max-h-none print:shadow-none overflow-hidden print:overflow-visible">
        <div className="bg-green-700 text-white p-5 text-center relative shrink-0">
          <h2 className="text-2xl font-extrabold tracking-widest">UCE PARKING</h2>
          <p className="text-green-200 text-xs mt-1">TICKET DE ACCESO / VISITANTE</p>
          {esReimpresion && (
            <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-2 py-0.5 rounded rotate-12 border border-yellow-600 shadow">
              ⚠ REIMPRESIÓN
            </div>
          )}
        </div>
        <div id="ticket-print-area" className="p-5 space-y-3 text-base flex-1 overflow-y-auto print:overflow-visible">
          <Row label="N° Ticket" value={`#${String(ticket.id_ticket).padStart(6, '0')}`} bold />
          {esReimpresion && (
            <p className="text-center text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              ⚠ COPIA — TICKET REIMPRESO
            </p>
          )}
          <hr />
          {/* CAMBIO: visitante_nombre/apellido directo de ticket */}
          <Row label="Visitante" value={`${ticket.visitante_nombre || ''} ${ticket.visitante_apellido || ''}`.trim() || 'Visitante General'} />
          {ticket.visitante_telefono && <Row label="Teléfono" value={ticket.visitante_telefono} />}
          <Row label="Placa" value={ticket.placa_capturada} bold mono />
          <Row label="Marca"  value={ticket._marcaNombre  || '—'} />
          <Row label="Modelo" value={ticket._modeloNombre || '—'} />
          <Row label="Color"  value={ticket._colorNombre  || '—'} />
          <hr />
          <Row label="Entrada" value={new Date(ticket.fecha_hora_emision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })} />
          {ticket._horaSalida && (
            <Row label="Salida" value={new Date(ticket._horaSalida).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })} />
          )}
          <Row label="Plaza"  value={ticket.plaza?.numero_plaza || `#${ticket.id_plaza_asignada}`} bold />
          <Row label="Estado" value={ticket._statusName || '—'} />
          {ticket.descripcion?.trim() && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Motivo de visita</p>
              <p className="text-xs text-gray-700">{ticket.descripcion}</p>
            </div>
          )}
          <hr />
          <div className="flex justify-center py-2">
            <QRCodeSVG value={qrData} size={120} level="M" />
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-1">
            Presente este código QR al salir del parqueo.
          </p>
        </div>
        <div className="flex gap-3 p-4 border-t print:hidden">
          <button onClick={handlePrint} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
            <FaPrint /> Imprimir
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg font-bold">
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

const calcTiempo = (inicio, fin) => {
  const diff = Math.floor((new Date(fin) - new Date(inicio)) / 60000);
  return diff < 60 ? `${diff} min` : `${Math.floor(diff / 60)}h ${diff % 60}min`;
};

export default function Tickets() {
  const { tienePermiso } = useRbac();
  const { orgId } = useOrg();
  const canCreate = tienePermiso('Módulo Parqueo', 'crear');
  const canEdit   = tienePermiso('Módulo Parqueo', 'editar');

  const [loading,              setLoading]              = useState(false);
  const [isRefreshing,         setIsRefreshing]         = useState(false);
  const [activeTab,            setActiveTab]            = useState('entrada');
  const [tickets,              setTickets]              = useState([]);
  const [searchTerm,           setSearchTerm]           = useState('');
  const [ticketsActivos,       setTicketsActivos]       = useState(0);
  const [plazasLibres,         setPlazasLibres]         = useState([]);
  const [currentPersonaId,     setCurrentPersonaId]     = useState(null);
  const [listaMarcas,          setListaMarcas]          = useState([]);
  const [listaModelos,         setListaModelos]         = useState([]);
  const [listaColores,         setListaColores]         = useState([]);
  const [ticketParaImprimir,   setTicketParaImprimir]   = useState(null);

  // CAMBIO: formulario sin id_visitante — datos inline
  const [visitanteForm, setVisitanteForm] = useState({
    nombre: '', apellido: '', telefono: '', sexo: '',
    placa: '', id_marca: '', id_modelo: '', id_color: '',
    id_plaza: '', duracion: '60', descripcion: ''
  });

  useEffect(() => {
    if (orgId) {
      loadData();
      const intervalo = setInterval(() => checkExpiredTickets(), 60_000);
      const ch = supabase.channel('rt_tickets_page')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza'  }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zona'   }, loadData)
        .subscribe();
      return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
    }
  }, [orgId, activeTab]);

  const loadData = async () => {
    if (!orgId) return;
    setIsRefreshing(true);
    try {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const hoyISO = hoy.toISOString();

      // CAMBIO: SELECT sin JOIN a visitante — campos inline
      let query = supabase.from('ticket').select(`
        id_ticket,
        placa_capturada,
        fecha_hora_emision,
        fecha_hora_vencimiento,
        id_plaza_asignada,
        id_estado,
        qr_token,
        organizacion_id,
        id_marca_capturada,
        id_modelo_capturado,
        id_color_capturado,
        visitante_nombre,
        visitante_apellido,
        visitante_telefono,
        visitante_sexo,
        descripcion,
        plaza:id_plaza_asignada(numero_plaza),
        marca:id_marca_capturada(nombre),
        modelo:id_modelo_capturado(nombre),
        color:id_color_capturado(nombre)
      `).eq('organizacion_id', orgId);

      if (activeTab === 'historial') {
        query = query.lt('fecha_hora_emision', hoyISO);
      } else {
        query = query.gte('fecha_hora_emision', hoyISO);
      }

      const [
        { data: tks },
        { data: stCat },
        { data: catMarcas },
        { data: catModelos },
        { data: catColores },
        { data: epLibre }
      ] = await Promise.all([
        query.order('fecha_hora_emision', { ascending: false }),
        supabase.from('estado_ticket').select('id_estado, nombre'),
        supabase.from('marca').select('id_marca, nombre').order('nombre'),
        supabase.from('modelo').select('id_modelo, nombre, id_marca').order('nombre'),
        supabase.from('color').select('id_color, nombre').order('nombre'),
        supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle()
      ]);

      const idEstLibrePlaza = epLibre?.id_estado || 1;
      const stMap = {};
      (stCat || []).forEach(s => { stMap[s.id_estado] = s.nombre; });

      // CAMBIO: enriquecer desde campos inline
      const ticketsEnriquecidos = (tks || []).map(t => ({
        ...t,
        _statusName:   stMap[t.id_estado] || '—',
        _personaNombre: `${t.visitante_nombre || ''} ${t.visitante_apellido || ''}`.trim() || 'Visitante',
        _marcaNombre:  t.marca?.nombre  || null,
        _modeloNombre: t.modelo?.nombre || null,
        _colorNombre:  t.color?.nombre  || null,
        _horaSalida:   (stMap[t.id_estado]?.toLowerCase() === 'cerrado' || stMap[t.id_estado]?.toLowerCase() === 'vencido') ? t.fecha_hora_vencimiento : null
      }));

      // Carga dinámica de ocupación para filtrar el selector
      const ahoraISO = new Date().toISOString();
      const buffer15min = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const [
        { data: rawPlazas },
        { data: asigsActivas },
        { data: tksActivos },
        { data: accActivos },
        { data: resActivas },
        { data: resZonas }
      ] = await Promise.all([
        supabase.from('plaza').select('*, zona:id_zona(nombre, estado_zona(nombre))').eq('organizacion_id', orgId),
        supabase.from('asignacion').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1),
        supabase.from('ticket').select('id_plaza_asignada').eq('organizacion_id', orgId).eq('id_estado', 1),
        supabase.from('acceso').select('id_plaza').eq('organizacion_id', orgId).is('salida_at', null),
        supabase.from('reserva').select('id_plaza').eq('organizacion_id', orgId).eq('id_estado', 1).lte('fecha_hora_inicio', ahoraISO).gte('fecha_hora_fin', ahoraISO),
        supabase.from('reserva_zona').select('id_zona').eq('organizacion_id', orgId).eq('id_estado', 1).lte('fecha_hora_inicio', buffer15min).gte('fecha_hora_fin', ahoraISO)
      ]);

      if (!rawPlazas) return;

      const plazasOcupadasDinamicas = new Set();
      (tksActivos || []).forEach(t => { if (t.id_plaza_asignada) plazasOcupadasDinamicas.add(t.id_plaza_asignada); });
      (accActivos || []).forEach(a => { if (a.id_plaza) plazasOcupadasDinamicas.add(a.id_plaza); });
      (resActivas || []).forEach(r => { if (r.id_plaza) plazasOcupadasDinamicas.add(r.id_plaza); });
      if (resZonas?.length > 0) {
        resZonas.forEach(rz => {
          rawPlazas.filter(p => p.id_zona === rz.id_zona).forEach(p => plazasOcupadasDinamicas.add(p.id_plaza));
        });
      }

      const plazasAsignadasIds = new Set((asigsActivas || []).map(a => a.id_plaza));

      const plazasFiltradas = (rawPlazas || []).filter(p => {
        const estZona = p.zona?.estado_zona?.nombre || 'Activa';
        const esLibreDB = p.id_estado === idEstLibrePlaza;
        const noEstaOcupadaDinamica = !plazasOcupadasDinamicas.has(p.id_plaza);
        const noEsAsignada = !plazasAsignadasIds.has(p.id_plaza);
        
        return estZona === 'Activa' && esLibreDB && noEstaOcupadaDinamica && noEsAsignada;
      });

      // Obtener currentPersonaId
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
        setCurrentPersonaId(ud?.id_persona);
      }

      setPlazasLibres(plazasFiltradas || []);
      setTickets(ticketsEnriquecidos);
      setTicketsActivos(ticketsEnriquecidos.filter(t => t._statusName?.toLowerCase() === 'activo').length);
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const registrarLog = async (tipo_nombre, descripcion, idPlaza = null) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo_evento').select('id_tipo').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Tickets').maybeSingle();
      await supabase.from('evento').insert([{
        fecha_hora:       new Date().toISOString(),
        descripcion,
        id_plaza:         idPlaza,
        id_persona:       currentPersonaId,
        id_tipo:          te?.id_tipo  || null,
        id_origen_evento: oe?.id_origen || null,
        organizacion_id:  orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const checkExpiredTickets = async () => {
    try {
      const ahora = new Date().toISOString();
      const { data: epLibre   } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const { data: stActivo  } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
      const { data: stVencido } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Vencido').maybeSingle();

      const idEstLibrePlaza  = epLibre?.id_estado   || 1;
      const idEstActivoTk   = stActivo?.id_estado   || 1;
      const idEstVencidoTk  = stVencido?.id_estado  || 3;

      const { data: vencidos } = await supabase
        .from('ticket')
        .select('id_ticket, id_plaza_asignada')
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

  // ── EMITIR TICKET ────────────────────────────────────────────────────────
  // CAMBIO PRINCIPAL: sin tabla visitante, datos inline en ticket
  const handleEmitirTicket = async (e) => {
    e.preventDefault();

    if (!orgId) return Swal.fire('Error', 'No se detectó la organización. Recargue la página.', 'error');
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención', 'La placa es obligatoria.', 'warning');
    if (!visitanteForm.id_plaza)      return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');
    if (!visitanteForm.descripcion.trim()) return Swal.fire('Atención', 'El motivo de la visita es obligatorio.', 'warning');

    setLoading(true);
    try {
      const placa     = visitanteForm.placa.toUpperCase();
      const ahora     = new Date().toISOString();
      const minutos   = parseInt(visitanteForm.duracion) || 0;
      const vencimiento = minutos > 0 ? new Date(Date.now() + minutos * 60000).toISOString() : null;

      const { data: stActivo  } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Activo').maybeSingle();
      const { data: epOcupada } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Ocupad%').maybeSingle();
      const idEstActivoTk  = stActivo?.id_estado  || 1;
      const idEstOcupPlaza = epOcupada?.id_estado || 2;

      // CAMBIO: INSERT directo con campos inline — sin crear visitante ni persona
      const { data: nuevoTicket, error: tErr } = await supabase
        .from('ticket')
        .insert([{
          placa_capturada:      placa,
          id_plaza_asignada:    parseInt(visitanteForm.id_plaza),
          id_estado:            idEstActivoTk,
          fecha_hora_emision:   ahora,
          fecha_hora_vencimiento: vencimiento,
          organizacion_id:      orgId,
          // Visitante inline
          visitante_nombre:     visitanteForm.nombre.trim()   || null,
          visitante_apellido:   visitanteForm.apellido.trim() || null,
          visitante_telefono:   visitanteForm.telefono.trim() || null,
          visitante_sexo:       visitanteForm.sexo             || null,
          // Motivo de la visita
          descripcion:          visitanteForm.descripcion.trim() || null,
          // Catálogos del vehículo
          id_marca_capturada:   visitanteForm.id_marca  ? parseInt(visitanteForm.id_marca)  : null,
          id_modelo_capturado:  visitanteForm.id_modelo ? parseInt(visitanteForm.id_modelo) : null,
          id_color_capturado:   visitanteForm.id_color  ? parseInt(visitanteForm.id_color)  : null,
        }])
        .select(`
          id_ticket, placa_capturada, fecha_hora_emision, fecha_hora_vencimiento,
          id_plaza_asignada, id_estado, descripcion,
          visitante_nombre, visitante_apellido, visitante_telefono, visitante_sexo,
          plaza:id_plaza_asignada(numero_plaza),
          marca:id_marca_capturada(nombre),
          modelo:id_modelo_capturado(nombre),
          color:id_color_capturado(nombre)
        `)
        .single();

      if (tErr) throw tErr;

      // Ocupar plaza
      await supabase.from('plaza').update({ id_estado: idEstOcupPlaza }).eq('id_plaza', parseInt(visitanteForm.id_plaza));

      // Log
      const visitanteLog = `${visitanteForm.nombre} ${visitanteForm.apellido}`.trim() || 'Visitante';
      await registrarLog('Ticket Emitido', `Ticket emitido: ${visitanteLog} — Vehículo: ${placa}.`, parseInt(visitanteForm.id_plaza));

      // Abrir barrera
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch('http://localhost:4000/api/access/open-main', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => {});
        }
      } catch (_) {}

      // Preparar para impresión
      setTicketParaImprimir({
        ...nuevoTicket,
        _statusName:   'Activo',
        _personaNombre: visitanteLog,
        _marcaNombre:  nuevoTicket.marca?.nombre  || null,
        _modeloNombre: nuevoTicket.modelo?.nombre || null,
        _colorNombre:  nuevoTicket.color?.nombre  || null,
        _horaSalida:   null,
      });

      // Limpiar formulario
      setVisitanteForm({
        nombre: '', apellido: '', telefono: '', sexo: 'M',
        placa: '', id_marca: '', id_modelo: '', id_color: '',
        id_plaza: '', duracion: '60', descripcion: ''
      });

      setActiveTab('activos');
      loadData();

      Swal.fire({ title: 'Ticket Emitido', text: 'La barrera se está abriendo.', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
    setLoading(false);
  };

  // ── CERRAR TICKET (registrar salida) ─────────────────────────────────────
  // CAMBIO: ticket no tiene salida_at — solo cambiamos id_estado a Cerrado
  const handleCerrarTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Registrar salida?',
      html: `<b>${ticket.placa_capturada}</b> — Plaza <b>${ticket.plaza?.numero_plaza || ''}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      confirmButtonText: 'Sí, registrar salida'
    });
    if (!result.isConfirmed) return;

    const ahora = new Date().toISOString();
    try {
      const { data: stCerrado } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Cerrado').maybeSingle();
      const { data: epLibre   } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstCerrTk  = stCerrado?.id_estado || 2;
      const idEstLibPlaza = epLibre?.id_estado  || 1;

      // CAMBIO: solo actualizar id_estado — no existe salida_at en ticket
      const { error: tkErr } = await supabase
        .from('ticket')
        .update({ id_estado: idEstCerrTk, fecha_hora_vencimiento: ahora })
        .eq('id_ticket', ticket.id_ticket);
      if (tkErr) throw tkErr;

      await supabase.from('plaza').update({ id_estado: idEstLibPlaza }).eq('id_plaza', ticket.id_plaza_asignada);

      const visitanteNombre = `${ticket.visitante_nombre || ''} ${ticket.visitante_apellido || ''}`.trim() || 'Visitante';

      await Promise.all([
        registrarLog(
          'Ticket Cerrado',
          `Salida: ${visitanteNombre} — Vehículo: ${ticket.placa_capturada}. Tiempo: ${calcTiempo(ticket.fecha_hora_emision, ahora)}.`,
          ticket.id_plaza_asignada
        ),
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              fetch('http://localhost:4000/api/access/open-main', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
              }).catch(() => {});
            }
          } catch (_) {}
        })()
      ]);

      // Para impresión del comprobante de salida
      setTicketParaImprimir({
        ...ticket,
        _statusName:   'Cerrado',
        _horaSalida:   ahora,
        _esReimpresion: true,
        _personaNombre: visitanteNombre,
      });

      Swal.fire('¡Salida Registrada!', `La plaza ${ticket.plaza?.numero_plaza} quedó libre.`, 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // ── ANULAR TICKET ────────────────────────────────────────────────────────
  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Anular ticket?',
      html: `Ticket <b>#${String(ticket.id_ticket).padStart(5, '0')}</b>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, anular'
    });
    if (!result.isConfirmed) return;

    try {
      const { data: stAnulado } = await supabase.from('estado_ticket').select('id_estado').ilike('nombre', 'Anulado').maybeSingle();
      const { data: epLibre   } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Libre').maybeSingle();
      const idEstAnuTk   = stAnulado?.id_estado || 4;
      const idEstLibPlaza = epLibre?.id_estado  || 1;

      const { error: tkErr } = await supabase
        .from('ticket')
        .update({ id_estado: idEstAnuTk })
        .eq('id_ticket', ticket.id_ticket);
      if (tkErr) throw tkErr;

      await supabase.from('plaza').update({ id_estado: idEstLibPlaza }).eq('id_plaza', ticket.id_plaza_asignada);
      await registrarLog('Ticket Vencido', `Ticket anulado: ${ticket.placa_capturada} — Plaza ${ticket.plaza?.numero_plaza}.`, ticket.id_plaza_asignada);

      Swal.fire('Anulado', 'El ticket fue anulado y la plaza quedó libre.', 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const tabBtn = (id, label, icon) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${
        activeTab === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon} {label}
      {id === 'activos' && ticketsActivos > 0 && (
        <span className="ml-1 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{ticketsActivos}</span>
      )}
    </button>
  );

  return (
    <Layout>
      {ticketParaImprimir && (
        <TicketPrintView
          ticket={ticketParaImprimir}
          onClose={() => setTicketParaImprimir(null)}
          esReimpresion={ticketParaImprimir._esReimpresion || false}
        />
      )}

      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Tickets de Acceso</h2>
        <p className="text-gray-500 mt-1">Emisión y control de tickets de visitantes.</p>
      </header>

      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada', 'Nueva Entrada', <FaTicketAlt />)}
        {tabBtn('activos', 'Tickets Activos', <FaClipboardCheck />)}
        {tabBtn('historial', 'Historial', <FaHistory />)}
      </div>

      {/* ── TAB ENTRADA ── */}
      {activeTab === 'entrada' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <FaUserPlus className="text-green-600" /> Emisión de Ticket
            </h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">

              {/* Datos del visitante — CAMBIO: sin selector de visitante existente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre *</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    placeholder="Juan"
                    value={visitanteForm.nombre}
                    onChange={e => setVisitanteForm(f => ({ ...f, nombre: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Apellido *</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    placeholder="Pérez"
                    value={visitanteForm.apellido}
                    onChange={e => setVisitanteForm(f => ({ ...f, apellido: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Teléfono</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    placeholder="809-000-0000"
                    value={visitanteForm.telefono}
                    onChange={e => setVisitanteForm(f => ({ ...f, telefono: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Sexo</label>
                  <select
                    className="w-full border rounded-lg p-2 text-sm mt-0.5 bg-white"
                    value={visitanteForm.sexo}
                    onChange={e => setVisitanteForm(f => ({ ...f, sexo: e.target.value }))}
                    required
                  >
                    <option value="">Seleccionar sexo</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </div>
              </div>

              <hr className="border-dashed" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Datos del Vehículo</p>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (1 Letra + 6 Números)</label>
                <input
                  className="w-full border-2 border-green-300 focus:border-green-500 rounded-lg p-2 text-sm font-mono font-bold uppercase mt-0.5 text-center tracking-widest text-lg"
                  placeholder="L 010536"
                  value={visitanteForm.placa}
                  maxLength={8}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const letterMatch = val.match(/[A-Z]/);
                    let nuevaPlaca = '';
                    if (letterMatch) {
                      const letter = letterMatch[0];
                      const digits = val.replace(/[A-Z]/g, '').replace(/[^0-9]/g, '').slice(0, 6);
                      nuevaPlaca = digits ? `${letter} ${digits}` : letter;
                    }
                    setVisitanteForm(f => ({ ...f, placa: nuevaPlaca }));
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <SearchableSelect
                    options={listaMarcas.map(m => ({ value: m.id_marca, label: m.nombre }))}
                    value={visitanteForm.id_marca}
                    onChange={val => setVisitanteForm(f => ({ ...f, id_marca: val, id_modelo: '' }))}
                    placeholder="— Seleccionar —"
                    focusRingClass="focus:ring-green-500"
                    selectedItemClass="bg-green-100 text-green-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                  <SearchableSelect
                    options={listaModelos.filter(m => m.id_marca === parseInt(visitanteForm.id_marca)).map(m => ({ value: m.id_modelo, label: m.nombre }))}
                    value={visitanteForm.id_modelo}
                    onChange={val => setVisitanteForm(f => ({ ...f, id_modelo: val }))}
                    disabled={!visitanteForm.id_marca}
                    placeholder="— Seleccionar —"
                    focusRingClass="focus:ring-green-500"
                    selectedItemClass="bg-green-100 text-green-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                <SearchableSelect
                  options={listaColores.map(c => ({ value: c.id_color, label: c.nombre }))}
                  value={visitanteForm.id_color}
                  onChange={val => setVisitanteForm(f => ({ ...f, id_color: val }))}
                  placeholder="— Seleccionar —"
                  focusRingClass="focus:ring-green-500"
                  selectedItemClass="bg-green-100 text-green-800"
                />
              </div>

              <hr className="border-dashed" />

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Plaza Asignada *</label>
                <SearchableSelect
                  options={(() => {
                    const options = [];
                    const zonas = [...new Set(plazasLibres.map(p => p.zona?.nombre))].sort();
                    zonas.forEach(zName => {
                      options.push({ label: zName || 'Sin Zona', isGroup: true });
                      plazasLibres
                        .filter(p => p.zona?.nombre === zName)
                        .forEach(p => options.push({ value: p.id_plaza, label: p.numero_plaza }));
                    });
                    return options;
                  })()}
                  value={visitanteForm.id_plaza}
                  onChange={val => setVisitanteForm(f => ({ ...f, id_plaza: val }))}
                  placeholder="— Seleccionar plaza libre —"
                  focusRingClass="focus:ring-green-500"
                  selectedItemClass="bg-green-100 text-green-800"
                  groupLabelClass="text-green-600 bg-green-50"
                />
                {plazasLibres.length === 0 && (
                  <p className="text-red-500 text-xs mt-1">⚠️ No hay plazas libres disponibles.</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Duración *</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  value={visitanteForm.duracion}
                  onChange={e => setVisitanteForm(f => ({ ...f, duracion: e.target.value }))}
                >
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
                    ⏰ Vence a las {new Date(Date.now() + parseInt(visitanteForm.duracion) * 60000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              {/* CAMBIO: descripcion = motivo de la visita */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Motivo de la Visita *</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm mt-0.5 resize-none focus:ring-1 focus:ring-green-400 outline-none"
                  rows={3}
                  placeholder="Ej: Visita al depto. de RRHH, reunión administrativa..."
                  value={visitanteForm.descripcion}
                  onChange={e => setVisitanteForm(f => ({ ...f, descripcion: e.target.value }))}
                  maxLength={300}
                  required
                />
                {visitanteForm.descripcion.length > 0 && (
                  <p className="text-[10px] text-gray-400 text-right mt-0.5">{visitanteForm.descripcion.length}/300</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || plazasLibres.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-base transition flex items-center justify-center gap-2 shadow"
              >
                <FaTicketAlt /> {loading ? 'Procesando...' : 'EMITIR TICKET'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-3">
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

      {/* ── TAB ACTIVOS / HISTORIAL ── */}
      {(activeTab === 'activos' || activeTab === 'historial') && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden text-nowrap">
          <div className="flex flex-col md:flex-row items-center justify-between p-5 border-b gap-4 bg-gray-50/50">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FaClipboardCheck className="text-green-600" />
                {activeTab === 'historial' ? 'Historial de Tickets Emitidos' : 'Lista de Tickets del Día'}
              </h3>
              <p className="text-[10px] text-gray-500 font-medium">
                {activeTab === 'historial'
                  ? 'Visualiza todos los registros cargados en el sistema'
                  : 'Gestiona y visualiza todos los movimientos de hoy'}
              </p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Buscar por placa o nombre..."
                  className="w-full pl-8 pr-4 py-2 text-xs border rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
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

          {tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FaTicketAlt className="mx-auto text-4xl mb-3 opacity-20" />
              <p>No hay tickets registrados {activeTab === 'historial' ? 'anteriormente' : 'hoy'}.</p>
            </div>
          ) : (
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
                    <th className="px-5 py-4 text-left">Vence</th>
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
                      const sName  = t._statusName || '—';
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
                          {/* CAMBIO: _personaNombre viene de visitante_nombre + visitante_apellido */}
                          <td className="px-5 py-4 font-semibold text-gray-700">{t._personaNombre}</td>
                          <td className="px-5 py-4">
                            <span className="bg-gray-900 text-white font-mono text-[10px] px-2 py-1 rounded-md shadow-sm">
                              {t.placa_capturada}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${cls}`}>
                              {sName}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-600">{t.plaza?.numero_plaza || '—'}</td>
                          <td className="px-5 py-4 text-[11px] text-gray-500 font-medium">
                            {new Date(t.fecha_hora_emision).toLocaleString('es-DO', {
                              day: 'numeric', month: 'numeric', year: '2-digit',
                              hour: 'numeric', minute: '2-digit', hour12: true
                            })}
                          </td>
                          <td className="px-5 py-4 text-[11px] text-gray-400">
                            {t.fecha_hora_vencimiento
                              ? new Date(t.fecha_hora_vencimiento).toLocaleString('es-DO', {
                                  day: 'numeric', month: 'numeric', year: '2-digit',
                                  hour: 'numeric', minute: '2-digit', hour12: true
                                })
                              : '—'}
                          </td>
                          <td className={`px-5 py-4 text-xs font-bold ${sLower === 'activo' ? 'text-amber-600' : 'text-gray-500'}`}>
                            {sLower === 'activo'
                              ? <span className="animate-pulse">{calcTiempo(t.fecha_hora_emision, new Date().toISOString())}</span>
                              : (t._horaSalida ? calcTiempo(t.fecha_hora_emision, t._horaSalida) : '—')}
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
                              {activeTab !== 'historial' && sLower === 'activo' && (
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
          )}
        </div>
      )}
    </Layout>
  );
}
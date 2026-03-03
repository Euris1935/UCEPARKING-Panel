
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
  FaCar, FaTicketAlt, FaUserPlus, FaSave, FaTrash, FaEdit,
  FaPrint, FaSignOutAlt, FaClipboardCheck, FaSyncAlt, FaBan
} from 'react-icons/fa';

/* ─────────────────────────────────────────────
   Sub-componente: Vista de Ticket para Impresión
───────────────────────────────────────────── */
function TicketPrintView({ ticket, onClose }) {
  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Cabecera */}
        <div className="bg-green-700 text-white p-5 text-center">
          <h2 className="text-2xl font-extrabold tracking-widest">UCE PARKING</h2>
          <p className="text-green-200 text-xs mt-1">TICKET DE ACCESO / VISITANTE</p>
        </div>

        {/* Cuerpo */}
        <div id="ticket-print-area" className="p-6 space-y-3 text-sm">
          <Row label="N° Ticket" value={`#${String(ticket.Id_Ticket).padStart(6, '0')}`} bold />
          <hr />
          <Row label="Visitante" value={`${ticket.visitantes?.nombre ?? ticket.personas?.nombre ?? '—'} ${ticket.visitantes?.apellido ?? ticket.personas?.apellido ?? ''}`} />
          <Row label="Placa" value={ticket.Placa_Capturada} bold mono />
          <Row label="Marca" value={ticket.Marca_Vehiculo || ticket.vehiculos?.Marca || '—'} />
          <Row label="Color" value={ticket.Color_Vehiculo || ticket.vehiculos?.Color || '—'} />
          <hr />
          <Row label="Plaza Asignada" value={ticket.plazas?.Numero_Plaza || `#${ticket.Id_Plaza_Asignada}`} bold />
          <Row label="Hora de Entrada" value={new Date(ticket.Fecha_Hora_Emision).toLocaleString('es-DO')} />
          <Row label="Estado" value={ticket.Estado} />
          <hr />
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Por favor presente este ticket al salir del parqueo.
          </p>
        </div>

        {/* Acciones — ocultas al imprimir */}
        <div className="flex gap-3 p-4 border-t print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"
          >
            <FaPrint /> Imprimir
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg font-bold"
          >
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

/* ─────────────────────────────────────────────
   Componente Principal
───────────────────────────────────────────── */
export default function VehiculosTickets() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('entrada'); // 'entrada' | 'activos' | 'flota'

  // Datos
  const [tickets, setTickets] = useState([]);
  const [ticketsActivos, setTicketsActivos] = useState(0); // solo para el badge
  const [vehiculos, setVehiculos] = useState([]);
  const [personasSistema, setPersonasSistema] = useState([]);
  const [visitantesRegistrados, setVisitantesRegistrados] = useState([]);
  const [plazasLibres, setPlazasLibres] = useState([]);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);

  // Ticket para imprimir
  const [ticketParaImprimir, setTicketParaImprimir] = useState(null);

  // Formulario Visitante
  const [visitanteForm, setVisitanteForm] = useState({
    id_visitante: null, nombre: '', apellido: '', telefono: '', sexo: 'M',
    placa: '', marca: '', color: '', id_plaza: '', duracion: '60'
  });

  // Formulario Vehículo Personal
  const [vehiculoPersonalForm, setVehiculoPersonalForm] = useState({
    persona_id: '', placa: '', marca: '', color: ''
  });

  // Edición de vehículo registrado
  const [editandoVehiculo, setEditandoVehiculo] = useState(null);
  const [editVehiculoForm, setEditVehiculoForm] = useState({ placa: '', marca: '', color: '' });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('usuarios').select('persona_id').eq('id', user.id).single();
        if (data) setCurrentPersonaId(data.persona_id);
      }
    };
    init();
    loadData();

    // Verificar tickets vencidos cada minuto
    const intervalo = setInterval(() => checkExpiredTickets(), 60_000);

    // Suscripción tiempo real a tickets y plazas
    const ch = supabase.channel('rt_vt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plazas' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(intervalo); };
  }, []);

  const loadData = async () => {
    try {
      // Plazas libres
      const { data: plazas } = await supabase.from('plazas').select('*').ilike('Estado_Actual', 'libre');

      // Tickets de hoy (todos los estados para mostrar historial del día)
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const { data: tks } = await supabase
        .from('tickets')
        .select('*, visitantes(nombre, apellido), personas(nombre, apellido), plazas(Numero_Plaza), vehiculos(Marca, Color)')
        .gte('Fecha_Hora_Emision', hoy.toISOString())
        .order('Fecha_Hora_Emision', { ascending: false });

      // Vehículos registrados
      const { data: vhs } = await supabase
        .from('vehiculos')
        .select('*, personas(nombre, apellido)')
        .order('Fecha_Registro', { ascending: false });

      // ── Visitantes desde la tabla dedicada ──
      const { data: visitantesData } = await supabase
        .from('visitantes')
        .select('*')
        .order('created_at', { ascending: false });

      // ── Personal del sistema: 2 queries separadas para evitar FK inexistente entre usuarios y roles ──
      const { data: usuariosRaw } = await supabase.from('usuarios').select('persona_id');
      const personaIdsUsuarios = (usuariosRaw || []).filter(u => u.persona_id).map(u => u.persona_id);

      let personasDeUsuarios = [];
      if (personaIdsUsuarios.length > 0) {
        const { data: pData } = await supabase
          .from('personas').select('id, nombre, apellido').in('id', personaIdsUsuarios);
        personasDeUsuarios = (pData || []).map(p => ({ ...p, rol: 'Usuario' }));
      }

      // ── Empleados ──
      const { data: empleadosData } = await supabase
        .from('empleados').select('persona_id, personas(id, nombre, apellido)');
      const personalEmpleados = (empleadosData || [])
        .filter(e => e.personas).map(e => ({ ...e.personas, rol: 'Empleado' }));

      // Unificar — empleados sobrescriben si la persona es también usuario
      const mapaPersonas = new Map();
      personasDeUsuarios.forEach(p => { if (p.id) mapaPersonas.set(p.id, p); });
      personalEmpleados.forEach(p => { if (p.id) mapaPersonas.set(p.id, p); });
      const listaPersonal = Array.from(mapaPersonas.values());


      setPlazasLibres(plazas || []);
      setTickets(tks || []);
      setTicketsActivos((tks || []).filter(t => t.Estado === 'Activo').length);
      setVehiculos(vhs || []);
      setVisitantesRegistrados(visitantesData || []);
      setPersonasSistema(listaPersonal);

    } catch (err) { console.error('Error cargando datos:', err); }
  };

  /* ── Helpers ── */
  const registrarLog = async (tipo, descripcion, idPlaza = null, idDispositivo = null) => {
    if (!currentPersonaId) return;
    try {
      await supabase.from('eventos').insert([{
        Fecha_Hora: new Date().toISOString(),
        Tipo_Evento: tipo,
        Descripcion: descripcion,
        Id_Plaza: idPlaza,
        id_persona: currentPersonaId,
        id_dispositivo: idDispositivo,
        origen_evento: 'Panel Web - Vehículos y Tickets'
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  /* ── Verificar y marcar tickets vencidos ── */
  const checkExpiredTickets = async () => {
    try {
      const ahora = new Date().toISOString();
      // Buscar tickets activos cuya hora de vencimiento ya pasó
      const { data: vencidos } = await supabase
        .from('tickets')
        .select('Id_Ticket, Id_Plaza_Asignada')
        .eq('Estado', 'Activo')
        .not('Fecha_Hora_Vencimiento', 'is', null)
        .lt('Fecha_Hora_Vencimiento', ahora);

      if (!vencidos || vencidos.length === 0) return;

      for (const t of vencidos) {
        // Marcar ticket como Vencido (sin id_estado para evitar FK)
        await supabase.from('tickets')
          .update({ Estado: 'Vencido' })
          .eq('Id_Ticket', t.Id_Ticket);

        // Liberar plaza
        await supabase.from('plazas')
          .update({ Estado_Actual: 'LIBRE', id_estado: 1 })
          .eq('Id_Plaza', t.Id_Plaza_Asignada);
      }

      if (vencidos.length > 0) loadData();
    } catch (e) { console.warn('checkExpiredTickets error:', e.message); }
  };

  /* ── Emitir Ticket (RF2, RF7, RF8, RF10) ── */
  const handleEmitirTicket = async (e) => {
    e.preventDefault();
    if (!visitanteForm.placa.trim()) return Swal.fire('Atención', 'La placa es obligatoria.', 'warning');
    if (!visitanteForm.id_plaza) return Swal.fire('Atención', 'Seleccione una plaza.', 'warning');

    setLoading(true);
    try {
      let visitanteId = visitanteForm.id_visitante;

      // 1. Crear visitante en la tabla 'visitantes' si es nuevo
      if (!visitanteId) {
        if (!visitanteForm.nombre.trim() || !visitanteForm.apellido.trim()) {
          setLoading(false);
          return Swal.fire('Atención', 'Nombre y Apellido del visitante son obligatorios.', 'warning');
        }
        const { data: newV, error: vErr } = await supabase
          .from('visitantes')
          .insert([{
            nombre: visitanteForm.nombre.trim(),
            apellido: visitanteForm.apellido.trim(),
            telefono: visitanteForm.telefono || null,
            sexo: visitanteForm.sexo
          }])
          .select()
          .single();
        if (vErr) throw vErr;
        visitanteId = newV.id;
      }

      const ahora = new Date().toISOString();
      const minutos = parseInt(visitanteForm.duracion) || 0;
      const vencimiento = minutos > 0
        ? new Date(Date.now() + minutos * 60000).toISOString()
        : null;

      // 3. Crear Ticket (RF8) — el vehículo de visitante no se guarda en la tabla vehiculos
      const { data: nuevoTicket, error: tErr } = await supabase
        .from('tickets')
        .insert([{
          Id_Vehiculo: null,
          Placa_Capturada: visitanteForm.placa.toUpperCase(),
          Id_Plaza_Asignada: parseInt(visitanteForm.id_plaza),
          visitante_id: visitanteId,
          Estado: 'Activo',
          id_estado: 1,
          Fecha_Hora_Emision: ahora,
          Fecha_Hora_Vencimiento: vencimiento,
          Color_Vehiculo: visitanteForm.color || null,
          Marca_Vehiculo: visitanteForm.marca || null
        }])
        .select('*, visitantes(nombre, apellido), plazas(Numero_Plaza)')
        .single();
      if (tErr) throw tErr;

      // 4. Actualizar plaza a Ocupada
      await supabase.from('plazas').update({
        Estado_Actual: 'OCUPADA',
        id_estado: 2
      }).eq('Id_Plaza', visitanteForm.id_plaza);

      // 6. Log automático (RF10)
      await registrarLog(
        'TICKET_EMITIDO',
        `Ticket emitido: ${visitanteForm.placa.toUpperCase()} — ${visitanteForm.nombre} ${visitanteForm.apellido} — Plaza ${nuevoTicket?.plazas?.Numero_Plaza || visitanteForm.id_plaza}.`,
        parseInt(visitanteForm.id_plaza)
      );

      // 7. Mostrar ticket para imprimir (RF2)
      setTicketParaImprimir(nuevoTicket);

      setVisitanteForm({ id_visitante: null, nombre: '', apellido: '', telefono: '', sexo: 'M', placa: '', marca: '', color: '', id_plaza: '', duracion: '60' });
      setActiveTab('activos');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  /* ── Cerrar Ticket / Salida (RF8) ── */
  const handleCerrarTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Registrar salida?',
      html: `<b>${ticket.Placa_Capturada}</b> — Plaza <b>${ticket.plazas?.Numero_Plaza}</b>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      confirmButtonText: 'Sí, registrar salida'
    });
    if (!result.isConfirmed) return;

    const ahora = new Date().toISOString();
    try {
      // 1. Cambiar estado del ticket a Usado
      const { error: tkErr, count: tkCount } = await supabase
        .from('tickets')
        .update({ Estado: 'Usado' }, { count: 'exact' })
        .eq('Id_Ticket', ticket.Id_Ticket);
      if (tkErr) throw tkErr;
      if (tkCount === 0) throw new Error('No se pudo actualizar el ticket (0 filas). Agrega la política UPDATE en tickets en Supabase.');

      // 2. Liberar plaza
      await supabase.from('plazas').update({
        Estado_Actual: 'LIBRE',
        id_estado: 1
      }).eq('Id_Plaza', ticket.Id_Plaza_Asignada);

      // 3. Registrar salida en registros_acceso (solo si el ticket tiene un vehículo vinculado)
      if (ticket.Id_Vehiculo) {
        await supabase.from('registros_acceso')
          .update({ salida_at: ahora, tipo_evento: 'SALIDA' })
          .eq('vehiculo_id', ticket.Id_Vehiculo)
          .is('salida_at', null);
      }

      // 4. Log (RF10)
      await registrarLog(
        'SALIDA_VEHICULO',
        `Salida registrada: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}. Tiempo: ${calcTiempo(ticket.Fecha_Hora_Emision, ahora)}.`,
        ticket.Id_Plaza_Asignada
      );

      Swal.fire('¡Salida Registrada!', `La plaza ${ticket.plazas?.Numero_Plaza} quedó libre.`, 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── Anular Ticket ── */
  const handleAnularTicket = async (ticket) => {
    const result = await Swal.fire({
      title: '¿Anular ticket?',
      html: `Ticket <b>#${String(ticket.Id_Ticket).padStart(5, '0')}</b> — Placa <b>${ticket.Placa_Capturada}</b><br><small class="text-gray-500">La plaza quedará libre y el ticket quedará como Anulado.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, anular'
    });
    if (!result.isConfirmed) return;

    const ahora = new Date().toISOString();
    try {
      const { error: tkErr, count: tkCount } = await supabase
        .from('tickets')
        .update({ Estado: 'Anulado' }, { count: 'exact' })
        .eq('Id_Ticket', ticket.Id_Ticket);
      if (tkErr) throw tkErr;
      if (tkCount === 0) throw new Error('No se pudo anular el ticket (0 filas). Agrega la política UPDATE en tickets en Supabase.');

      await supabase.from('plazas').update({
        Estado_Actual: 'LIBRE',
        id_estado: 1
      }).eq('Id_Plaza', ticket.Id_Plaza_Asignada);

      await registrarLog(
        'TICKET_ANULADO',
        `Ticket anulado: ${ticket.Placa_Capturada} — Plaza ${ticket.plazas?.Numero_Plaza}.`,
        ticket.Id_Plaza_Asignada
      );

      Swal.fire('Anulado', 'El ticket fue anulado y la plaza quedó libre.', 'success');
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── Eliminar Vehículo de Flota (maneja FKs) ── */
  const handleEliminarVehiculo = async (vehiculo) => {
    // 1. Verificar tickets activos vinculados
    const { data: ticketsActivos } = await supabase
      .from('tickets')
      .select('Id_Ticket')
      .eq('Id_Vehiculo', vehiculo.id)
      .eq('Estado', 'Activo');

    if (ticketsActivos && ticketsActivos.length > 0) {
      return Swal.fire(
        'No se puede eliminar',
        `Este vehículo tiene ${ticketsActivos.length} ticket(s) activo(s). Registre la salida primero.`,
        'warning'
      );
    }

    const r = await Swal.fire({
      title: '¿Eliminar vehículo?',
      html: `Placa: <b>${vehiculo.placa}</b><br><small>Se eliminarán también sus registros de acceso históricos.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar'
    });
    if (!r.isConfirmed) return;

    try {
      // 2. Eliminar primero registros de acceso históricos (FK dep)
      const { error: raErr } = await supabase.from('registros_acceso').delete().eq('vehiculo_id', vehiculo.id);
      if (raErr) console.warn('registros_acceso delete:', raErr.message);

      // 3. Eliminar tickets completados/cancelados (FK dep)
      const { error: tkErr } = await supabase.from('tickets').delete().eq('Id_Vehiculo', vehiculo.id).neq('Estado', 'Activo');
      if (tkErr) console.warn('tickets delete:', tkErr.message);

      // 4. Eliminar el vehículo y verificar que realmente se eliminó
      const { error, count } = await supabase
        .from('vehiculos')
        .delete({ count: 'exact' })
        .eq('id', vehiculo.id);

      if (error) throw error;
      if (count === 0) {
        throw new Error(
          'No se pudo eliminar el vehículo (0 filas afectadas). ' +
          'Puede haber una política de seguridad (RLS) que lo impida, o el ID no coincide. ' +
          'Verifica los permisos en Supabase.'
        );
      }

      Swal.fire('Eliminado', 'Vehículo eliminado correctamente.', 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error al eliminar', err.message, 'error');
    }
  };

  /* ── Editar Vehículo de Flota ── */
  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    try {
      const { error, count } = await supabase
        .from('vehiculos')
        .update(
          { placa: editVehiculoForm.placa.toUpperCase(), Marca: editVehiculoForm.marca || null, Color: editVehiculoForm.color || null },
          { count: 'exact' }
        )
        .eq('id', editandoVehiculo.id);

      if (error) throw error;
      if (count === 0) {
        throw new Error(
          'No se pudo actualizar el vehículo (0 filas afectadas). ' +
          'Puede haber una política de seguridad (RLS) que lo impida. ' +
          'Verifica los permisos UPDATE en la tabla vehiculos en Supabase.'
        );
      }

      Swal.fire('Actualizado', 'Vehículo actualizado correctamente.', 'success');
      setEditandoVehiculo(null);
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── Registrar Vehículo Personal ── */
  const handleVehiculoPersonalSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('vehiculos').insert([{
        persona_id: vehiculoPersonalForm.persona_id,
        placa: vehiculoPersonalForm.placa.toUpperCase(),
        Marca: vehiculoPersonalForm.marca || null,
        Color: vehiculoPersonalForm.color || null
      }]);
      if (error) throw error;
      Swal.fire('Registrado', 'Vehículo vinculado correctamente.', 'success');
      setVehiculoPersonalForm({ persona_id: '', placa: '', marca: '', color: '' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── Utils ── */
  const calcTiempo = (inicio, fin) => {
    const diff = Math.floor((new Date(fin) - new Date(inicio)) / 60000);
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}min`;
  };

  const tabBtn = (id, label, icon) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-4 transition-all ${activeTab === id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
        }`}
    >
      {icon} {label}
      {id === 'activos' && ticketsActivos > 0 && (
        <span className="ml-1 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{ticketsActivos}</span>
      )}
    </button>
  );

  /* ═══════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════ */
  return (
    <Layout>
      {/* Ticket modal de impresión */}
      {ticketParaImprimir && (
        <TicketPrintView ticket={ticketParaImprimir} onClose={() => setTicketParaImprimir(null)} />
      )}

      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Vehículos y Tickets</h2>
        <p className="text-gray-500 mt-1">Control de acceso, emisión de tickets y gestión de la flota.</p>
      </header>

      {/* Pestañas */}
      <div className="flex gap-2 border-b border-gray-200 mb-8">
        {tabBtn('entrada', 'Nueva Entrada', <FaTicketAlt />)}
        {tabBtn('activos', 'Tickets Activos', <FaClipboardCheck />)}
        {tabBtn('flota', 'Flota Registrada', <FaCar />)}
      </div>

      {/* ─── TAB 1: Nueva Entrada ─── */}
      {activeTab === 'entrada' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Formulario */}
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
              <FaUserPlus className="text-green-600" /> Emisión de Ticket
            </h3>
            <form onSubmit={handleEmitirTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">¿Visitante ya registrado?</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm focus:ring-green-500 bg-gray-50"
                  value={visitanteForm.id_visitante ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      const v = visitantesRegistrados.find(vis => vis.id === parseInt(val));
                      if (v) setVisitanteForm(f => ({ ...f, id_visitante: v.id, nombre: v.nombre, apellido: v.apellido, telefono: v.telefono || '', sexo: v.sexo || 'M' }));
                    } else {
                      setVisitanteForm(f => ({ ...f, id_visitante: null, nombre: '', apellido: '', telefono: '', sexo: 'M' }));
                    }
                  }}
                >
                  <option value="">— Nuevo visitante —</option>
                  {visitantesRegistrados.map(v => (
                    <option key={v.id} value={v.id}>{v.nombre} {v.apellido}{v.telefono ? ` — ${v.telefono}` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Datos personales */}
              <div className={`grid grid-cols-2 gap-3 ${visitanteForm.id_visitante ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre *</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    placeholder="Juan"
                    value={visitanteForm.nombre}
                    onChange={e => setVisitanteForm(f => ({ ...f, nombre: e.target.value }))}
                    required={!visitanteForm.id_visitante}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Apellido *</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm mt-0.5"
                    placeholder="Pérez"
                    value={visitanteForm.apellido}
                    onChange={e => setVisitanteForm(f => ({ ...f, apellido: e.target.value }))}
                    required={!visitanteForm.id_visitante}
                  />
                </div>
              </div>


              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Telefono</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm mt-0.5"
                  placeholder="809-000-0000"
                  value={visitanteForm.telefono}
                  onChange={e => setVisitanteForm(f => ({ ...f, telefono: e.target.value }))}
                />
              </div>
              <hr className="border-dashed" />

              {/* Datos del vehículo (RF7) */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Datos del Vehículo (RF7)</p>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input
                  className="w-full border-2 border-green-300 focus:border-green-500 rounded-lg p-2 text-sm font-mono font-bold uppercase mt-0.5 text-center tracking-widest text-lg"
                  placeholder="ABC-1234"
                  value={visitanteForm.placa}
                  onChange={e => setVisitanteForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Toyota" value={visitanteForm.marca} onChange={e => setVisitanteForm(f => ({ ...f, marca: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Rojo" value={visitanteForm.color} onChange={e => setVisitanteForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>

              <hr className="border-dashed" />

              {/* Plaza */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Plaza Asignada *</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm mt-0.5 focus:ring-green-500"
                  value={visitanteForm.id_plaza}
                  onChange={e => setVisitanteForm(f => ({ ...f, id_plaza: e.target.value }))}
                  required
                >
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

              {/* Emisión y Vencimiento */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tiempo del Ticket</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Hora de Emisión</label>
                  <input
                    readOnly
                    className="w-full border rounded-lg p-2 text-sm mt-0.5 bg-gray-50 text-gray-500 cursor-not-allowed"
                    value={new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Duración *</label>
                  <select
                    className="w-full border rounded-lg p-2 text-sm mt-0.5 focus:ring-green-500"
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
                </div>
              </div>
              {visitanteForm.duracion !== '0' && visitanteForm.duracion && (
                <p className="text-xs text-amber-600 font-medium -mt-1">
                  ⏰ Vence a las {new Date(Date.now() + parseInt(visitanteForm.duracion) * 60000).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || plazasLibres.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-base transition flex items-center justify-center gap-2 shadow"
              >
                <FaTicketAlt /> {loading ? 'Procesando...' : 'EMITIR TICKET'}
              </button>
            </form>
          </section>

          {/* Panel informativo */}
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
              <FaClipboardCheck className="text-green-600" />
              Lista de Tickets
            </h3>
            <button onClick={loadData} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition">
              <FaSyncAlt />
            </button>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FaTicketAlt className="mx-auto text-4xl mb-3 opacity-20" />
              <p>No hay vehículos en el parqueo actualmente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 text-left">Ticket</th>
                    <th className="px-5 py-3 text-left">Visitante</th>
                    <th className="px-5 py-3 text-left">Placa</th>
                    <th class="px-5 py-3 text-left">Estado</th>
                    <th className="px-5 py-3 text-left">Vehículo</th>
                    <th className="px-5 py-3 text-left">Plaza</th>
                    <th className="px-5 py-3 text-left">Entrada</th>
                    <th className="px-5 py-3 text-left">Tiempo</th>
                    <th className="px-5 py-3 text-left">Vence</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tickets.map(t => (
                    <tr key={t.Id_Ticket} className="hover:bg-gray-50 transition-all">
                      <td className="px-5 py-4 text-xs text-gray-400 font-mono">
                        #{String(t.Id_Ticket).padStart(5, '0')}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-800">
                        {t.visitantes?.nombre ?? t.personas?.nombre} {t.visitantes?.apellido ?? t.personas?.apellido}
                      </td>
                      <td className="px-5 py-4">
                        <span className="bg-gray-900 text-white font-mono text-xs px-2 py-1 rounded">
                          {t.Placa_Capturada}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const s = { Activo: { c: "bg-green-100 text-green-700 border border-green-200", l: "Activo" }, Vencido: { c: "bg-amber-100 text-amber-700 border border-amber-200", l: "Vencido" }, Anulado: { c: "bg-red-100 text-red-700 border border-red-200", l: "Anulado" }, Usado: { c: "bg-gray-100 text-gray-600 border border-gray-200", l: "Usado" } };
                          const e = s[t.Estado] || { c: "bg-gray-100 text-gray-500", l: t.Estado };
                          return <span className={"font-bold text-xs px-2 py-1 rounded-full " + e.c}>{e.l}</span>;
                        })()}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        {[t.Marca_Vehiculo || t.vehiculos?.Marca, t.Color_Vehiculo || t.vehiculos?.Color].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs border border-green-200">
                          {t.plazas?.Numero_Plaza}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-500">
                        {new Date(t.Fecha_Hora_Emision).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-amber-600">
                        {t.Estado === 'Activo'
                          ? calcTiempo(t.Fecha_Hora_Emision, new Date().toISOString())
                          : t.Fecha_Hora_Vencimiento && t.Estado === 'Vencido'
                            ? calcTiempo(t.Fecha_Hora_Emision, t.Fecha_Hora_Vencimiento)
                            : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {t.Fecha_Hora_Vencimiento ? (() => {
                          const msLeft = new Date(t.Fecha_Hora_Vencimiento) - Date.now();
                          const activo = t.Estado === 'Activo';
                          // Parpadea solo si está activo Y ya venció o está por vencer (<10 min)
                          const pulsar = activo && msLeft < 10 * 60000;
                          return (
                            <span className={`font-bold ${pulsar ? 'text-red-600 animate-pulse' : 'text-gray-500'
                              }`}>
                              {new Date(t.Fecha_Hora_Vencimiento).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          );
                        })() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setTicketParaImprimir(t)}
                            title="Ver / Imprimir ticket"
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                          >
                            <FaPrint size={15} />
                          </button>
                          {t.Estado === 'Activo' && (<>
                            <button
                              onClick={() => handleCerrarTicket(t)}
                              title="Registrar salida"
                              className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition shadow"
                            >
                              <FaSignOutAlt size={12} /> Salida
                            </button>
                            <button
                              onClick={() => handleAnularTicket(t)}
                              title="Anular ticket"
                              className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg font-bold text-xs transition"
                            >
                              <FaBan size={12} /> Anular
                            </button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: Flota Registrada ─── */}
      {activeTab === 'flota' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Formulario registro vehículo personal */}
          <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
              <FaCar className="text-purple-600" /> Vincular Vehículo Personal
            </h3>
            <form onSubmit={handleVehiculoPersonalSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Propietario *</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm mt-0.5 focus:ring-purple-500"
                  value={vehiculoPersonalForm.persona_id}
                  onChange={e => setVehiculoPersonalForm(f => ({ ...f, persona_id: e.target.value }))}
                  required
                >
                  <option value="">— Seleccionar persona —</option>
                  {personasSistema.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} {p.apellido} ({p.rol})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input
                  className="w-full border-2 border-purple-200 rounded-lg p-2 text-sm font-mono uppercase tracking-widest text-center text-base mt-0.5"
                  placeholder="ABC-1234"
                  value={vehiculoPersonalForm.placa}
                  onChange={e => setVehiculoPersonalForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Toyota" value={vehiculoPersonalForm.marca} onChange={e => setVehiculoPersonalForm(f => ({ ...f, marca: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Azul" value={vehiculoPersonalForm.color} onChange={e => setVehiculoPersonalForm(f => ({ ...f, color: e.target.value }))} />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow"
              >
                <FaSave /> VINCULAR VEHÍCULO
              </button>
            </form>
          </section>

          {/* Tabla flota */}
          <section className="lg:col-span-3 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FaCar className="text-purple-600" /> Flota Registrada
                <span className="ml-2 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{vehiculos.length} vehículos</span>
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
                    <tr key={v.id} className="hover:bg-gray-50 transition-all">
                      <td className="px-5 py-4 font-medium text-gray-800">
                        {v.personas?.nombre} {v.personas?.apellido}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded text-xs">{v.placa}</span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        {[v.Marca, v.Color].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400">
                        {new Date(v.Fecha_Registro).toLocaleDateString('es-DO')}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => { setEditandoVehiculo(v); setEditVehiculoForm({ placa: v.placa, marca: v.Marca || '', color: v.Color || '' }); }}
                            className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition"
                            title="Editar vehículo"
                          >
                            <FaEdit size={14} />
                          </button>
                          <button
                            onClick={() => handleEliminarVehiculo(v)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                            title="Eliminar vehículo"
                          >
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
                <input
                  className="w-full border-2 border-purple-200 rounded-lg p-2 font-mono uppercase tracking-widest text-center text-base mt-0.5"
                  value={editVehiculoForm.placa}
                  onChange={e => setEditVehiculoForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Toyota"
                    value={editVehiculoForm.marca}
                    onChange={e => setEditVehiculoForm(f => ({ ...f, marca: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                  <input className="w-full border rounded-lg p-2 text-sm mt-0.5" placeholder="Azul"
                    value={editVehiculoForm.color}
                    onChange={e => setEditVehiculoForm(f => ({ ...f, color: e.target.value }))}
                  />
                </div>
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

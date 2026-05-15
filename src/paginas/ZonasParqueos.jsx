import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { 
  FaSearch, FaEdit, FaTrash, FaParking, FaMapMarkerAlt, FaPlus, FaSave, 
  FaArrowsAltH, FaArrowsAltV, FaSync, FaSyncAlt, FaCar, FaWheelchair, FaMapMarkedAlt, FaTruck, FaBolt
} from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';
import { ESTADO_ZONA, ESTADO_PLAZA } from '../lib/constants';
import MapaZona from '../componentes/MapaZona';

export default function ZonasParqueo() {
  const { tienePermiso } = useRbac();
  const { orgId } = useOrg();
  const canCreate = tienePermiso('Zonas de Parqueo', 'crear');
  const canEdit = tienePermiso('Zonas de Parqueo', 'editar');
  const canDelete = tienePermiso('Zonas de Parqueo', 'eliminar');

  const [zonas, setZonas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZone, setEditingZone] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const initialZoneState = { 
    Nombre_Zona: '', 
    Capacidad_Total: '', 
    id_tipo: '', 
    id_estado: '', 
    descripcion: '',
    latitud: '',
    longitud: '',
    direccion: '',
    nivel_piso: 0,
    area_geografica: ''
  };
  const [zoneForm, setZoneForm] = useState(initialZoneState);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState(null);
  const [localOrgId, setLocalOrgId] = useState(null);
  
  // Catálogos
  const [tiposZona, setTiposZona] = useState([]);
  const [estadosZona, setEstadosZona] = useState([]);
  const [tiposPlaza, setTiposPlaza] = useState([]);

  // --- ESTADOS DE PLAZAS ---
  const [plazas, setPlazas] = useState([]);
  const [showPlazaModal, setShowPlazaModal] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState(null);
  const initialPlazaState = { Numero_Plaza: '', Id_Zona: '', id_tipo: '', Amplitud: '2.50', Longitud: '5.00' };
  const [plazaForm, setPlazaForm] = useState(initialPlazaState);

  useEffect(() => { 
    if (orgId) loadData(); 
  }, [orgId]);

  useEffect(() => {
    async function loadUserSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: usr } = await supabase.from('usuario').select('id_persona, organizacion_id').eq('id', session.user.id).single();
        if (usr) {
          setCurrentPersonaId(usr.id_persona);
          setLocalOrgId(usr.organizacion_id);
          const { data: empData } = await supabase.from('empleado')
            .select('id_empleado')
            .eq('id_persona', usr.id_persona)
            .eq('organizacion_id', usr.organizacion_id)
            .limit(1);
          const emp = empData && empData.length > 0 ? empData[0] : null;
          if (emp) setCurrentEmpleadoId(emp.id_empleado);
        }
      }
    }
    loadUserSession();
  }, []);

  const loadData = async () => {
    if (!orgId) return;
    try {
      // 1. Catálogos ordenados alfabéticamente
      const [
        { data: tzData },
        { data: ezData },
        { data: tpData }
      ] = await Promise.all([
        supabase.from('tipo_zona').select('*').order('nombre'),
        supabase.from('estado_zona').select('*').order('nombre'),
        supabase.from('tipo_plaza').select('*').order('nombre')
      ]);
      setTiposZona(tzData || []);
      // Filtrar estados para excluir "Mantenimiento" (se gestiona desde el módulo de Mantenimiento)
      const estadosZonaFiltrados = (ezData || []).filter(e => !e.nombre.toLowerCase().includes('mantenimiento'));
      setEstadosZona(estadosZonaFiltrados);
      setTiposPlaza(tpData || []);

      // 2. Zonas ordenadas alfabéticamente
      const { data: zData } = await supabase
        .from('zona')
        .select(`
          *,
          tipo:tipo_zona!id_tipo(nombre),
          estado:estado_zona!id_estado(nombre),
          creador:empleado!id_empleado_creador(persona:id_persona(nombre, apellido))
        `)
        .eq('organizacion_id', orgId)
        .order('nombre');
      
      setZonas(zData || []);

      // 3. Plazas ordenadas por número
      const { data: pData } = await supabase.from('plaza').select(`*, estado_plaza!id_estado(nombre)`).eq('organizacion_id', orgId).order('numero_plaza');
      const plazasOrdenadas = (pData || []).sort((a, b) => 
        (a.numero_plaza || '').localeCompare(b.numero_plaza || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setPlazas(plazasOrdenadas);
    } catch (error) { console.error("Error cargando datos:", error); }
  };

  // La función registrarLog local ha sido eliminada para usar la global importada.

  /* ── Helper: obtiene las iniciales de las palabras del nombre ──
     Ej: "Zona Especial" → "ZE", "Piso 1 Norte" → "P1N"
     Palabras de 2 caracteres o menos (artículos, preposiciones) se excluyen si hay otras más largas.
  */
  const generarIniciales = (nombre) => {
    const palabras = nombre.trim().split(/\s+/);
    // Intentar excluir palabras triviales si hay al menos 2 palabras sustantivas
    const triviales = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en'];
    let sustantivas = palabras.filter(p => !triviales.includes(p.toLowerCase()));
    if (sustantivas.length === 0) sustantivas = palabras;
    return sustantivas.map(p => p[0].toUpperCase()).join('');
  };

  /**
   * Determina el id_tipo_plaza recomendado según el nombre del tipo de zona
   */
  const mapearTipoZonaATipoPlaza = (idTipoZona) => {
    const idZ = parseInt(idTipoZona);
    if (idZ === 3) return 2; // VIP (Zona 3 -> Plaza 2)
    if (idZ === 4) return 3; // Discapacitados (Zona 4 -> Plaza 3)
    if (idZ === 6) return 4; // Carga (Zona 6 -> Plaza 4)
    if (idZ === 8) return 1; // General (Zona 8 -> Plaza 1)
    return 1; // Por defecto Normal (incluye Motos, Cubierta, etc.)
  };

  /* ── Generar plazas en lote para una zona ── */
  const generarPlazasEnLote = async (idZona, nombreZona, capacidadTotal, idLibre, idTipoPlaza = 1) => {
    const prefijo = generarIniciales(nombreZona);
    // Obtener plazas existentes para no duplicar
    const { data: existentes } = await supabase.from('plaza').select('numero_plaza').eq('id_zona', idZona);
    const codigosExistentes = new Set((existentes || []).map(p => p.numero_plaza));

    const lote = [];
    let seq = 1;
    let insertadas = 0;
    while (insertadas < capacidadTotal) {
      const codigo = `${prefijo}-${String(seq).padStart(2, '0')}`;
      if (!codigosExistentes.has(codigo)) {
        lote.push({
          numero_plaza: codigo,
          id_zona: idZona,
          id_estado: idLibre,
          id_tipo: idTipoPlaza,
          amplitud: 2.50,
          longitud: 5.00,
          organizacion_id: orgId
        });
        insertadas++;
      }
      seq++;
      if (seq > capacidadTotal * 3) break; // Salvaguarda ante bucle infinito
    }

    const { error } = await supabase.from('plaza').insert(lote);
    if (error) throw error;
    return { prefijo, total: lote.length };
  };

  /* ── Acciones de zonas ── */
  const handleSubmitZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.Nombre_Zona.trim()) return Swal.fire('Error', "Nombre obligatorio.", 'warning');
    if (parseInt(zoneForm.Capacidad_Total) <= 0) return Swal.fire('Error', "Capacidad debe ser > 0.", 'warning');

    const activeOrgId = orgId || localOrgId;
    if (!activeOrgId) return Swal.fire('Error', 'No se pudo detectar la organización asociada a su cuenta.', 'error');

    const estaCreando = !editingZone;
    
    // 1. Determinar ID del estado si no se seleccionó
    let finalIdEstado = zoneForm.id_estado ? parseInt(zoneForm.id_estado) : null;
    if (estaCreando && !finalIdEstado) {
      finalIdEstado = ESTADO_ZONA.ACTIVA;
    }

    const payload = { 
      nombre: zoneForm.Nombre_Zona.trim(), 
      capacidad_total: parseInt(zoneForm.Capacidad_Total),
      id_tipo: zoneForm.id_tipo ? parseInt(zoneForm.id_tipo) : null,
      id_estado: finalIdEstado,
      descripcion: zoneForm.descripcion ? zoneForm.descripcion.trim() : null,
      organizacion_id: activeOrgId,
      latitud: zoneForm.latitud ? parseFloat(zoneForm.latitud) : null,
      longitud: zoneForm.longitud ? parseFloat(zoneForm.longitud) : null,
      direccion: zoneForm.direccion ? zoneForm.direccion.trim() : null,
      nivel_piso: parseInt(zoneForm.nivel_piso),
      area_geografica: zoneForm.area_geografica ? zoneForm.area_geografica.trim() : null
    };

    if (estaCreando) {
      payload.id_empleado_creador = currentEmpleadoId;
    }

    const estaCreandoConst = estaCreando;

    // Si es nueva zona, previsualizar el código y pedir confirmación
    if (estaCreandoConst) {
      const prefijo = generarIniciales(zoneForm.Nombre_Zona);
      const cap = parseInt(zoneForm.Capacidad_Total);
      const ejemplos = Array.from({ length: Math.min(cap, 3) }, (_, i) =>
        `${prefijo}-${String(i + 1).padStart(2, '0')}`).join(', ');

      const confirm = await Swal.fire({
        title: '¿Generar plazas automáticamente?',
        html: `Se crearán <b>${cap} plazas</b> con códigos:<br/>
               <code class="text-sm bg-gray-100 px-2 py-1 rounded">${ejemplos}${cap > 3 ? ` ... ${prefijo}-${String(cap).padStart(2, '0')}` : ''}</code>`,
        icon: 'question',
        showCloseButton: true,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Crear zona y plazas',
        cancelButtonText: 'Solo crear la zona'
      });

      // Si el usuario cerró la alerta con la X o ESC, no hacemos nada
      if (confirm.isDismissed && confirm.dismiss !== Swal.DismissReason.cancel) {
        return;
      }

      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        // 1. Crear la zona y obtener su ID
        const { data: zonaCreada, error: errZ } = await supabase
          .from('zona').insert([payload]).select().single();
        if (errZ) throw errZ;

        if (confirm.isConfirmed) {
          const idLibre = ESTADO_PLAZA.LIBRE;
          const idTipoPlazaInferido = mapearTipoZonaATipoPlaza(payload.id_tipo);
          const { total } = await generarPlazasEnLote(zonaCreada.id_zona, zonaCreada.nombre, cap, idLibre, idTipoPlazaInferido);
          
          registrarLog({
            tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA,
            descripcion: `Nueva zona "${payload.nombre}" creada con ${total} plazas automáticas (Capacidad: ${cap})`,
            id_persona: currentPersonaId,
            organizacion_id: activeOrgId,
            origen: 'Panel Web - Parqueos'
          });

          Swal.fire('Éxito', `Zona creada con ${total} plazas generadas automáticamente.`, 'success');
        } else {
          registrarLog({
            tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA,
            descripcion: `Nueva zona "${payload.nombre}" creada sin plazas iniciales (Capacidad: ${cap})`,
            id_persona: currentPersonaId,
            organizacion_id: activeOrgId,
            origen: 'Panel Web - Parqueos'
          });
          Swal.fire('Zona creada', 'Puedes agregar plazas manualmente cuando quieras.', 'success');
        }

        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }

    } else {
      try {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        
        // Antes de actualizar, verificar capacidad para el aviso automático
        const oldCap = editingZone.capacidad_total;
        const newCap = parseInt(zoneForm.Capacidad_Total);
        const currentPlazasCount = plazas.filter(p => p.id_zona === editingZone.id_zona).length;

        const { error } = await supabase.from('zona').update(payload).eq('id_zona', editingZone.id_zona);
        if (error) throw error;

        // --- Plan PISZ: Propagación en cascada del tipo de plaza si cambia el tipo de zona ---
        if (payload.id_tipo && parseInt(payload.id_tipo) !== editingZone.id_tipo) {
            const nuevoTipoPlaza = mapearTipoZonaATipoPlaza(payload.id_tipo);
            await supabase.from('plaza').update({ id_tipo: nuevoTipoPlaza }).eq('id_zona', editingZone.id_zona);
        }

        // 2. Propagación en cascada si el estado es Mantenimiento o Cerrada
        const nuevoEstado = estadosZona.find(e => e.id_estado === payload.id_estado);
        const stNombre = nuevoEstado?.nombre || '';

        if (stNombre.toLowerCase().includes('mantenimiento') || stNombre.toLowerCase().includes('cerrada')) {
            const { data: stPlaza } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', stNombre).maybeSingle();
            if (stPlaza) {
                const idLibre = ESTADO_PLAZA.LIBRE;
                // Dejamos marcadas como mantenimiento/cerrada solo las que estaban libres
                await supabase.from('plaza').update({ id_estado: stPlaza.id_estado }).eq('id_zona', editingZone.id_zona).eq('id_estado', idLibre);
            }
        } else if (stNombre === 'Activa') {
            // Si volvemos a Activa, liberamos las que estaban bloqueadas administrativamente
            const stLibre = ESTADO_PLAZA.LIBRE;
            const { data: stMant } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'En Mantenimiento').maybeSingle();
            const { data: stCerr } = await supabase.from('estado_plaza').select('id_estado').ilike('nombre', 'Cerrada Temporalmente').maybeSingle();
            
            const idsParaLiberar = [];
            if (stMant) idsParaLiberar.push(stMant.id_estado);
            if (stCerr) idsParaLiberar.push(stCerr.id_estado);
            
            if (idsParaLiberar.length > 0) {
                await supabase.from('plaza')
                    .update({ id_estado: stLibre })
                    .eq('id_zona', editingZone.id_zona)
                    .in('id_estado', idsParaLiberar);
            }
        }
        
        const descCambios = generarDescripcionCambio(editingZone, payload, `Cambios en zona ${editingZone.nombre}`);

        registrarLog({
            tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA,
            descripcion: descCambios,
            id_persona: currentPersonaId,
            organizacion_id: activeOrgId,
            origen: 'Panel Web - Parqueos'
        });

        // 3. Manejo inteligente de capacidad
        if (newCap > currentPlazasCount) {
            const faltantes = newCap - currentPlazasCount;
            const confirmGen = await Swal.fire({
                title: 'Capacidad Aumentada',
                text: `Has aumentado la capacidad. ¿Deseas generar las ${faltantes} plazas faltantes automáticamente ahora?`,
                icon: 'question',
                showCloseButton: true,
                showCancelButton: true,
                confirmButtonText: 'Sí, generar',
                cancelButtonText: 'No por ahora'
            });

            // Si cierra con X o ESC, no guardamos los cambios de capacidad (opcional, pero más seguro)
            if (confirmGen.isDismissed && confirmGen.dismiss !== Swal.DismissReason.cancel) {
                return;
            }
            if (confirmGen.isConfirmed) {
                const idLibre = ESTADO_PLAZA.LIBRE;
                const idTipoPlazaInferido = mapearTipoZonaATipoPlaza(payload.id_tipo);
                await generarPlazasEnLote(editingZone.id_zona, zoneForm.Nombre_Zona, newCap, idLibre, idTipoPlazaInferido);
                Swal.fire('Éxito', `Zona actualizada y ${faltantes} plazas generadas.`, 'success');
            } else {
                Swal.fire('Éxito', 'Zona actualizada correctamente.', 'success');
            }
        } else if (newCap < currentPlazasCount) {
            Swal.fire({
                title: 'Aviso de Capacidad',
                text: `Has reducido la capacidad numérica, pero las ${currentPlazasCount} plazas físicas existentes permanecerán en el sistema para proteger su historial.`,
                icon: 'info'
            });
        } else {
            Swal.fire('Éxito', 'Zona actualizada.', 'success');
        }

        /* Log ya registrado arriba con el objeto completo */
        setZoneForm(initialZoneState);
        setEditingZone(null);
        loadData();
      } catch (error) { Swal.fire('Error', error.message, 'error'); }
    }
  };

  /* ── Generar plazas para zona existente (botón en tabla) ── */
  const handleGenerarPlazasExistente = async (zona) => {
    const plazasActuales = plazas.filter(p => p.id_zona === zona.id_zona).length;
    const faltantes = zona.capacidad_total - plazasActuales;

    if (faltantes <= 0) {
      return Swal.fire('Sin cambios', `Esta zona ya tiene ${plazasActuales} plazas (capacidad: ${zona.capacidad_total}).`, 'info');
    }

    const prefijo = generarIniciales(zona.nombre);
    const confirm = await Swal.fire({
      title: `¿Generar ${faltantes} plazas faltantes?`,
      html: `La zona <b>${zona.nombre}</b> tiene ${plazasActuales}/${zona.capacidad_total} plazas.<br/>
             Se agregarán las ${faltantes} restantes con prefijo <code>${prefijo}</code>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ' Generar'
    });
    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({ title: 'Generando...', didOpen: () => Swal.showLoading() });
      const idLibre = ESTADO_PLAZA.LIBRE;
      const idTipoPlazaInferido = mapearTipoZonaATipoPlaza(zona.id_tipo);

      const { total } = await generarPlazasEnLote(zona.id_zona, zona.nombre, zona.capacidad_total, idLibre, idTipoPlazaInferido);
      Swal.fire('Listo', `Se generaron ${total} plazas nuevas.`, 'success');
      
      registrarLog({
        tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA,
        descripcion: `Generación masiva de ${total} plazas para la zona: ${zona.nombre}`,
        id_persona: currentPersonaId,
        organizacion_id: orgId || localOrgId,
        origen: 'Panel Web - Parqueos'
      });
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  const filteredZonas = zonas.filter(z => (z.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({ 
      Nombre_Zona: zone.nombre, 
      Capacidad_Total: zone.capacidad_total?.toString() || '',
      id_tipo: zone.id_tipo?.toString() || '',
      id_estado: zone.id_estado?.toString() || '',
      descripcion: zone.descripcion || '',
      latitud: zone.latitud?.toString() || '',
      longitud: zone.longitud?.toString() || '',
      direccion: zone.direccion || '',
      nivel_piso: zone.nivel_piso ?? 0,
      area_geografica: zone.area_geografica || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteZone = async (zoneId) => {
    const result = await Swal.fire({
      title: '¿Eliminar zona?',
      text: "Se borrarán TODAS las plazas de esta zona.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar todo'
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({ title: 'Eliminando...', didOpen: () => Swal.showLoading() });
        
        // 1. Obtener IDs de las plazas de esta zona para limpiar dependencias si es necesario
        const { data: plazasZona } = await supabase.from('plaza').select('id_plaza').eq('id_zona', zoneId);
        const idsPlazas = (plazasZona || []).map(p => p.id_plaza);

        if (idsPlazas.length > 0) {
          // 2. Limpiar referencias en 'pantalla' (que dependen directamente de zona e id_plaza)
          await supabase.from('pantalla').update({ id_zona: null, id_plaza: null }).eq('id_zona', zoneId);
          // 3. Intentar borrar las plazas. Nota: Si tienen accesos/tickets, esto fallará por FK.
          const { error: errP } = await supabase.from('plaza').delete().eq('id_zona', zoneId);
          if (errP) throw new Error(`No se pueden borrar las plazas: ${errP.message}`);
        }

        // 4. Borrar la zona
        const { error: errZ } = await supabase.from('zona').delete().eq('id_zona', zoneId);
        if (errZ) throw new Error(`Error al borrar zona: ${errZ.message}`);

        Swal.fire('Eliminado', 'Zona y plazas eliminadas con éxito.', 'success');
        registrarLog({ tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA, descripcion: `Eliminación de zona ID: ${zoneId}`, id_persona: currentPersonaId, organizacion_id: orgId || localOrgId, origen: 'Panel Web - Parqueos' });
        loadData();
      } catch (error) {
        console.error('Error delete:', error);
        if (error.message.toLowerCase().includes('foreign key') || error.message.toLowerCase().includes('violates')) {
          const confirmInac = await Swal.fire({
            title: 'No se puede eliminar',
            text: 'Esta zona tiene historial (accesos, tickets o dispositivos) vinculado y no puede borrarse. ¿Deseas marcarla como Inactiva para que desaparezca de las vistas operativas?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, Desactivar',
            cancelButtonText: 'Cancelar'
          });

          if (confirmInac.isConfirmed) {
            try {
              await supabase.from('zona').update({ id_estado: ESTADO_ZONA.INACTIVA }).eq('id_zona', zoneId);
              Swal.fire('Zona Desactivada', 'La zona ha sido marcada como Inactiva y sus plazas se han ocultado.', 'success');
              
              registrarLog({
                tipo_nombre: EVENT_TYPES.ZONA_MODIFICADA,
                descripcion: `Zona ID ${zoneId} desactivada administrativamente debido a restricciones de integridad (historial activo).`,
                id_persona: currentPersonaId,
                organizacion_id: orgId || localOrgId,
                origen: 'Panel Web - Parqueos'
              });
              loadData();
            } catch (errInac) {
              Swal.fire('Error', errInac.message, 'error');
            }
          }
        } else {
          Swal.fire('Error de Borrado', error.message, 'error');
        }
      }
    }
  };

  const openPlazaModal = (plaza = null) => {
    if (plaza) {
      setEditingPlaza(plaza);
      setPlazaForm({
        Numero_Plaza: plaza.numero_plaza,
        Id_Zona: plaza.id_zona,
        id_tipo: plaza.id_tipo ? String(plaza.id_tipo) : '',
        Amplitud: plaza.amplitud || '2.50',
        Longitud: plaza.longitud || '5.00'
      });
    } else {
      setEditingPlaza(null);
      setPlazaForm(initialPlazaState);
    }
    setShowPlazaModal(true);
  };

  const handleZonaChange = (idZonaStr) => {
    const idZona = parseInt(idZonaStr);
    if (!idZona) {
      setPlazaForm({ ...plazaForm, Id_Zona: '', Numero_Plaza: '' });
      return;
    }

    const zonaActual = zonas.find(z => z.id_zona === idZona);
    if (!zonaActual) return;

    const prefijo = generarIniciales(zonaActual.nombre);
    const plazasExistentes = plazas.filter(p => p.id_zona === idZona);

    let maxSeq = 0;
    plazasExistentes.forEach(p => {
      // Extraer número de formato "PREFIJO-01" o al final del string
      const partes = p.numero_plaza.split('-');
      if (partes.length > 1) {
        const num = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      } else {
        const numMatch = p.numero_plaza.match(/\d+$/);
        if (numMatch) {
          const num = parseInt(numMatch[0], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
    });

    // Empezar en la siguiente secuencia
    const nextSeq = maxSeq + 1;
    const nextCodigo = `${prefijo}-${String(nextSeq).padStart(2, '0')}`;
    const idTipoPlazaInferido = mapearTipoZonaATipoPlaza(zonaActual.id_tipo);

    setPlazaForm({ 
        ...plazaForm, 
        Id_Zona: idZonaStr, 
        Numero_Plaza: nextCodigo,
        id_tipo: String(idTipoPlazaInferido)
    });
  };

  const handleSubmitPlaza = async (e) => {
    e.preventDefault();
    if (!plazaForm.Numero_Plaza || !plazaForm.Id_Zona) return Swal.fire('Error', 'Completa los campos.', 'warning');

    try {
      const payload = {
        numero_plaza: plazaForm.Numero_Plaza,
        id_zona: parseInt(plazaForm.Id_Zona),
        id_tipo: plazaForm.id_tipo ? parseInt(plazaForm.id_tipo) : 1,
        amplitud: parseFloat(plazaForm.Amplitud),
        longitud: parseFloat(plazaForm.Longitud),
        organizacion_id: orgId
      };

      if (editingPlaza) {
        const { error } = await supabase.from('plaza')
          .update(payload)
          .eq('id_plaza', editingPlaza.id_plaza);
        if (error) throw error;
        Swal.fire('Actualizada', `Plaza actualizada correctamente.`, 'success');
      } else {
        const idLibre = ESTADO_PLAZA.LIBRE;

        const { error } = await supabase.from('plaza').insert([{
          ...payload,
          id_estado: idLibre
        }]);
        if (error) throw error;

        // ── Actualizar Capacidad_Total si el nuevo total supera el valor guardado ──
        const idZona = parseInt(plazaForm.Id_Zona);
        const { count } = await supabase.from('plaza').select('id_plaza', { count: 'exact', head: true }).eq('id_zona', idZona);
        const zonaActual = zonas.find(z => z.id_zona === idZona);
        if (zonaActual && count > zonaActual.capacidad_total) {
          await supabase.from('zona').update({ capacidad_total: count }).eq('id_zona', idZona);
        }

        Swal.fire('Creada', `Plaza ${plazaForm.Numero_Plaza} creada.`, 'success');
      }

      setShowPlazaModal(false);
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };


  const handleDeletePlaza = async (plaza) => {
    const result = await Swal.fire({
      title: '¿Borrar plaza?',
      text: "Esta acción es irreversible.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Borrar'
    });

    if (result.isConfirmed) {
      try {
        const { error: errP } = await supabase.from('plaza').delete().eq('id_plaza', plaza.id_plaza);
        if (errP) throw errP;
        
        // Sincronizar automáticamente la capacidad a la baja tras el borrado
        const { count } = await supabase.from('plaza').select('id_plaza', { count: 'exact', head: true }).eq('id_zona', plaza.id_zona);
        await supabase.from('zona').update({ capacidad_total: count || 0 }).eq('id_zona', plaza.id_zona);

        loadData();
        Swal.fire('Eliminada', 'La plaza ha sido borrada.', 'success');
      } catch (error) {
        Swal.fire('Error', `No se pudo borrar la plaza: ${error.message}`, 'error');
      }
    }
  };

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Configuración de Parqueo</h2>
          <p className="text-gray-500 mt-1">Gestión estructural y mapa de plazas.</p>
        </div>
        <div className="flex gap-3">
          <button
              onClick={() => openPlazaModal(null)}
              className="bg-primary hover:bg-opacity-90 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95"
            >
              <FaPlus /> NUEVA PLAZA
            </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 items-start">
        {/* --- FORMULARIO DE GESTIÓN (A LA IZQUIERDA - Estilo Foto - Verde) --- */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-gray-800 uppercase tracking-tighter">
                <FaParking className="text-emerald-500" /> 
                {editingZone ? 'Editar Zona' : 'Registrar Nueva Zona'}
              </h3>
              
              <form className="space-y-5" onSubmit={handleSubmitZone}>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Nombre de Zona *</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-medium text-gray-700" 
                    placeholder="Ej: Sótano A, Nivel 1"
                    value={zoneForm.Nombre_Zona} 
                    onChange={(e) => setZoneForm({ ...zoneForm, Nombre_Zona: e.target.value })} 
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Capacidad Numérica *</label>
                  <input 
                    type="number" 
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700" 
                    placeholder="Cantidad total de plazas"
                    value={zoneForm.Capacidad_Total} 
                    onChange={(e) => setZoneForm({ ...zoneForm, Capacidad_Total: e.target.value })} 
                  />
                </div>



                <div className="grid grid-cols-1 gap-5">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tipo de Zona</label>
                    <SearchableSelect 
                      options={tiposZona.map(t => ({ value: t.id_tipo, label: t.nombre }))}
                      value={zoneForm.id_tipo}
                      onChange={(val) => setZoneForm({ ...zoneForm, id_tipo: val })}
                      placeholder="— Seleccionar Tipo —"
                      focusRingClass="focus:ring-emerald-500"
                      selectedItemClass="bg-emerald-100 text-emerald-800"
                    />
                  </div>
                  {editingZone && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Estado de Zona</label>
                      <SearchableSelect 
                        options={estadosZona.map(e => ({ value: e.id_estado, label: e.nombre }))}
                        value={zoneForm.id_estado}
                        onChange={(val) => setZoneForm({ ...zoneForm, id_estado: val })}
                        placeholder="— Seleccionar Estado —"
                        focusRingClass="focus:ring-emerald-500"
                        selectedItemClass="bg-emerald-100 text-emerald-800"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Latitud</label>
                    <input 
                      type="number" step="0.0000001"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700" 
                      placeholder="Ej: 18.4861"
                      value={zoneForm.latitud} 
                      onChange={(e) => setZoneForm({ ...zoneForm, latitud: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Longitud</label>
                    <input 
                      type="number" step="0.0000001"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700" 
                      placeholder="Ej: -69.9312"
                      value={zoneForm.longitud} 
                      onChange={(e) => setZoneForm({ ...zoneForm, longitud: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Nivel / Piso</label>
                    <select 
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700 font-medium"
                      value={zoneForm.nivel_piso} 
                      onChange={(e) => setZoneForm({ ...zoneForm, nivel_piso: e.target.value })}
                    >
                      <option value={-2}>Sótano 2</option>
                      <option value={-1}>Sótano 1</option>
                      <option value={0}>Planta baja</option>
                      <option value={1}>Piso 1</option>
                      <option value={2}>Piso 2</option>
                      <option value={3}>Piso 3</option>
                      <option value={4}>Piso 4</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Dirección / Referencia</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700" 
                      placeholder="Ej: Edificio A, entrada sur"
                      value={zoneForm.direccion} 
                      onChange={(e) => setZoneForm({ ...zoneForm, direccion: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMapModal(true)}
                    className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl font-bold text-xs uppercase tracking-widest border border-indigo-200 transition-all flex items-center justify-center gap-2"
                  >
                    <FaMapMarkedAlt /> Ubicación Geospacial (Mapa)
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Perímetro Geográfico (WKT Polygon)</label>
                  <textarea 
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-600 resize-none font-mono" 
                    placeholder="Ej: POLYGON((-69.9 18.4, -69.8 18.4, ...))"
                    value={zoneForm.area_geografica} 
                    onChange={(e) => setZoneForm({ ...zoneForm, area_geografica: e.target.value })} 
                  />
                  <p className="text-[9px] text-gray-400 mt-1 italic">Próximamente: Integración con Leaflet.draw para dibujo sobre mapa.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Descripción de la Zona</label>
                  <textarea 
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 outline-none transition-all text-gray-700 resize-none font-medium" 
                    placeholder="— Notas adicionales sobre la zona (Ej: Ubicación, restricciones) —"
                    value={zoneForm.descripcion} 
                    onChange={(e) => setZoneForm({ ...zoneForm, descripcion: e.target.value })} 
                  />
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all transform active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wider">
                    <FaSave /> {editingZone ? "GUARDAR CAMBIOS" : "CREAR ZONA"}
                  </button>
                  {editingZone && (
                    <button 
                      type="button" 
                      onClick={() => { setEditingZone(null); setZoneForm(initialZoneState); }} 
                      className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
                    >
                      CANCELAR EDICIÓN
                    </button>
                  )}
                </div>
              </form>
            </div>
        </div>

        {/* --- LISTA DE ZONAS (A LA DERECHA - Ocupa 3 columnas) --- */}
        <div className="xl:col-span-3 bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-7 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
               <FaParking className="text-emerald-500" /> Zonas Registradas
               <span className="ml-2 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{zonas.length}</span>
            </h3>
            <div className="relative w-full sm:w-64">
              <input 
                type="text" 
                placeholder="Buscar por nombre..." 
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
              <FaSearch className="absolute left-3.5 top-3 text-gray-400" />
            </div>
          </div>
          
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                <tr>
                  <th className="px-6 py-4">Zona</th>
                  <th className="px-6 py-4">Ubicación / Nivel</th>
                  <th className="px-6 py-4">Detalles</th>
                  <th className="px-6 py-4">Capacidad</th>
                  <th className="px-6 py-4">Registro</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredZonas.map(z => (
                  <tr key={z.id_zona} className="hover:bg-emerald-50/10 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{z.nombre}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-black text-emerald-600 uppercase tracking-tighter">
                        {z.nivel_piso === 0 ? 'Planta Baja' : (z.nivel_piso < 0 ? `Sótano ${Math.abs(z.nivel_piso)}` : `Piso ${z.nivel_piso}`)}
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium truncate w-32" title={z.direccion}>
                        {z.direccion || 'Sin dirección'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-600">{z.tipo?.nombre || 'General'}</div>
                      <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${
                        z.estado?.nombre === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {z.estado?.nombre || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-black text-gray-700 text-lg">
                      {z.capacidad_total}
                    </td>
                    <td className="px-6 py-4">
                        <p className="text-[11px] font-bold text-gray-700 truncate w-32" title={z.creador?.persona ? `${z.creador.persona.nombre} ${z.creador.persona.apellido}` : 'Sistema'}>
                            {z.creador?.persona ? `${z.creador.persona.nombre} ${z.creador.persona.apellido}` : 'Sistema'}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {new Date(z.created_at).toLocaleDateString('es-DO')} {new Date(z.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <button onClick={() => handleEditZone(z)} className="text-blue-500 hover:bg-blue-50 p-2.5 rounded-xl transition-all" title="Editar"><FaEdit /></button>
                        <button onClick={() => handleGenerarPlazasExistente(z)} className="text-emerald-500 hover:bg-emerald-50 p-2.5 rounded-xl transition-all" title="Generar Plazas"><FaSyncAlt /></button>
                        <button onClick={() => handleDeleteZone(z.id_zona)} className="text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition-all" title="Eliminar"><FaTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MAPA DE PLAZAS (RESTAURADO A TAMAÑO GRANDE) --- */}
      <div className="mt-12 space-y-8">
        <div className="flex items-center gap-3 border-b pb-4">
           <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic">Mapa de Plazas Físicas</h3>
           <div className="h-px flex-1 bg-gray-100"></div>
        </div>
        
        {zonas.map(zona => {
          const plazasZona = plazas.filter(p => p.id_zona === zona.id_zona);
          return (
            <section key={zona.id_zona} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-8 bg-primary rounded-full"></div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-800 tracking-tight">{zona.nombre}</h4>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{plazasZona.length} de {zona.capacidad_total} Plazas Creadas</p>
                  </div>
                </div>
                <div className={`px-4 py-1.5 rounded-xl font-bold text-xs shadow-sm ${
                  zona.estado?.nombre === 'Activa' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {zona.estado?.nombre}
                </div>
              </div>
              
              <div className="bg-gray-50 p-6 sm:p-8 rounded-2xl shadow-inner relative border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-2 gap-y-10 place-items-center relative z-10 w-full">
                  {plazasZona.map(p => {
                     const isLibre = p.estado_plaza?.nombre === 'Libre';
                     const bgPlaza = p.id_tipo === 3 ? 'bg-blue-50/50 hover:bg-blue-100/50' : 
                                     p.id_tipo === 2 ? 'bg-yellow-50/50 hover:bg-yellow-100/50' :
                                     p.id_tipo === 4 ? 'bg-gray-100/50 hover:bg-gray-200/50' :
                                     p.id_tipo === 5 ? 'bg-emerald-50/50 hover:bg-emerald-100/50' :
                                     'bg-white/60 hover:bg-white/90';
                     const bColor = p.id_tipo === 3 ? 'border-blue-300' : 
                                    p.id_tipo === 2 ? 'border-yellow-300' :
                                    p.id_tipo === 5 ? 'border-emerald-300' :
                                    'border-gray-300';
                     
                     return (
                      <div key={p.id_plaza} className={`relative flex flex-col items-center justify-end text-center w-full max-w-[90px] mx-auto aspect-[1/1.6] border-x-[3px] border-t-[3px] border-b-0 ${bColor} transition-all overflow-hidden pb-1 rounded-t shadow-sm group ${bgPlaza}`}>
                        <span className="absolute top-2 font-bold text-xl text-gray-300 select-none pointer-events-none group-hover:text-gray-400 transition-colors">{p.numero_plaza}</span>

                        {p.id_tipo === 3 && (
                          <FaWheelchair className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-blue-200 pointer-events-none" />
                        )}
                        {p.id_tipo === 2 && (
                          <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-yellow-300/40 select-none pointer-events-none italic tracking-tighter">VIP</span>
                        )}
                        {p.id_tipo === 4 && (
                          <FaTruck className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-gray-300 pointer-events-none" />
                        )}
                        {p.id_tipo === 5 && (
                          <FaBolt className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-emerald-300 pointer-events-none" />
                        )}

                        <span className="relative z-10 text-[8px] font-bold text-gray-500 uppercase mt-auto mb-1 bg-white/80 px-1 rounded-sm shadow-sm">{p.amplitud}x{p.longitud}m</span>
                        
                        <div className="relative z-10 mb-1 h-1 w-8 rounded-full bg-gray-200 overflow-hidden">
                          <div className={`h-full w-full ${isLibre ? 'bg-green-400' : 'bg-red-400'}`}></div>
                        </div>

                        {/* Acciones Hover */}
                        <div className="absolute inset-0 bg-white/95 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity duration-200 z-20">
                            <button onClick={() => openPlazaModal(p)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Editar">
                              <FaEdit size={14} />
                            </button>
                            <button onClick={() => handleDeletePlaza(p)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title="Borrar">
                              <FaTrash size={14} />
                            </button>
                        </div>
                      </div>
                     );
                  })}
                  {plazasZona.length === 0 && (
                     <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-3xl bg-white/50 w-full">
                        <p className="text-sm text-gray-400 font-bold uppercase tracking-widest italic">Aún no se han generado plazas para esta zona</p>
                        <button onClick={() => handleGenerarPlazasExistente(zona)} className="mt-4 text-emerald-500 font-bold text-xs hover:underline flex items-center gap-2">
                          <FaSyncAlt /> GENERAR PLAZAS AHORA
                        </button>
                     </div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* --- MODAL DE PLAZA (Estilo Foto - Verde) --- */}
      {showPlazaModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-7 flex items-center gap-3 text-gray-800">
               <FaParking className="text-emerald-500" /> 
               {editingPlaza ? 'Editar Espacio' : 'Añadir Espacio Manual'}
            </h3>
            
            <form className="space-y-5" onSubmit={handleSubmitPlaza}>
               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Zona Destino</label>
                  <SearchableSelect 
                    options={zonas.map(z => ({ value: z.id_zona, label: z.nombre }))}
                    value={plazaForm.Id_Zona} 
                    onChange={(val) => {
                       if (editingPlaza) setPlazaForm({ ...plazaForm, Id_Zona: val });
                       else handleZonaChange(val);
                    }}
                    disabled={!!editingPlaza}
                    placeholder="— Seleccionar Zona —"
                    focusRingClass="focus:ring-emerald-500"
                    selectedItemClass="bg-emerald-100 text-emerald-800"
                  />
                  {editingPlaza && <p className="text-[9px] text-emerald-500 font-bold mt-1 px-1 opacity-80 uppercase tracking-tighter">Zona bloqueada (con historial)</p>}
               </div>

               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Tipo de Plaza *</label>
                  <SearchableSelect 
                    options={tiposPlaza.map(t => ({ value: t.id_tipo, label: t.nombre }))}
                    value={plazaForm.id_tipo} 
                    onChange={(val) => setPlazaForm({ ...plazaForm, id_tipo: val })}
                    placeholder="— Seleccionar Tipo —"
                    focusRingClass="focus:ring-emerald-500"
                    selectedItemClass="bg-emerald-100 text-emerald-800"
                  />
               </div>

               <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Identificador (Número)</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-100 rounded-xl px-4 py-4 text-2xl font-black text-emerald-600 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 transition-all font-mono tracking-tighter text-center bg-gray-50/30" 
                  placeholder="Ej: A-01"
                  value={plazaForm.Numero_Plaza} 
                  onChange={(e) => setPlazaForm({ ...plazaForm, Numero_Plaza: e.target.value })} 
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest text-center">Amplitud (m)</label>
                  <div className="relative group">
                    <input type="number" step="0.01" className="w-full pl-10 pr-4 py-3 border border-gray-100 rounded-xl text-base font-bold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 transition-all" value={plazaForm.Amplitud} onChange={(e)=>setPlazaForm({...plazaForm, Amplitud: e.target.value})} />
                    <FaArrowsAltH className="absolute left-3.5 top-4 text-gray-300 group-focus-within:text-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block tracking-widest text-center">Longitud (m)</label>
                  <div className="relative group">
                    <input type="number" step="0.01" className="w-full pl-10 pr-4 py-3 border border-gray-100 rounded-xl text-base font-bold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 transition-all" value={plazaForm.Longitud} onChange={(e)=>setPlazaForm({...plazaForm, Longitud: e.target.value})} />
                    <FaArrowsAltV className="absolute left-3.5 top-4 text-gray-300 group-focus-within:text-emerald-500" />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex flex-col gap-3">
                 <button 
                  type="submit" 
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
                 >
                    <FaSave /> {editingPlaza ? 'ACTUALIZAR DATOS' : 'CREAR PLAZA'}
                 </button>
                 <button 
                  type="button" 
                  onClick={() => setShowPlazaModal(false)} 
                  className="w-full py-2 text-[10px] font-bold text-gray-400 hover:text-gray-600 rounded-xl transition-all uppercase tracking-widest"
                 >
                   CERRAR VENTANA
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Mapa Interactivo */}
      {showMapModal && (
        <MapaZona
          latitud={parseFloat(zoneForm.latitud) || null}
          longitud={parseFloat(zoneForm.longitud) || null}
          wkt={zoneForm.area_geografica}
          onClose={() => setShowMapModal(false)}
          onSave={(data) => {
            setZoneForm({
              ...zoneForm,
              latitud: data.latitud.toFixed(8),
              longitud: data.longitud.toFixed(8),
              area_geografica: data.wkt
            });
            setShowMapModal(false);
            Swal.fire({
              title: 'Ubicación Capturada',
              text: 'Las coordenadas y el área se han sincronizado.',
              icon: 'success',
              timer: 2000,
              showConfirmButton: false,
              toast: true,
              position: 'top-end'
            });
          }}
        />
      )}
    </Layout>
  );
}


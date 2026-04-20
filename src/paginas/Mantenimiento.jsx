import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaSearch, FaPlus, FaCheckCircle, FaTools, FaCalendarAlt, FaEdit, FaSync, FaTimesCircle } from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_MANT, ESTADO_PLAZA, ESTADO_ZONA, ESTADO_DISPOSITIVO } from '../lib/constants';

export default function Mantenimiento() {
    const { orgId, orgNombre } = useOrg();
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [dispositivos, setDispositivos] = useState([]);
    const [allDispositivos, setAllDispositivos] = useState([]);
    const [plazasList, setPlazasList] = useState([]);
    const [allPlazas, setAllPlazas] = useState([]);
    const [zonas, setZonas] = useState([]);
    const [allZonas, setAllZonas] = useState([]);
    const [tecnicos, setTecnicos] = useState([]);
    const [tiposMantenimiento, setTiposMantenimiento] = useState([]);
    const [estadosMantenimiento, setEstadosMantenimiento] = useState([]);

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [dispositivosOcupados, setDispositivosOcupados] = useState(new Set());
    const [targetType, setTargetType] = useState('dispositivo'); 

    const [formData, setFormData] = useState({
        descripcion: '',
        id_dispositivo: '',
        id_plaza: '',
        id_zona: '',
        id_empleado: '',
        id_tipo: '',
        id_estado: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: ''
    });

    const [currentPersonaId, setCurrentPersonaId] = useState(null);

    useEffect(() => {
        if (orgId) {
            loadData();
            const channel = supabase.channel('realtime_mantenimiento')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'mantenimiento' }, loadData)
                .subscribe();
            return () => supabase.removeChannel(channel);
        }
    }, [orgId]);

    const loadData = async () => {
        if (!orgId) return;
        setLoading(true);
        setIsRefreshing(true);
        try {
            const [
                { data: mantData, error: mantErr },
                { data: dispData },
                { data: rpcUsers, error: rpcErr },
                { data: allEmps },
                { data: fullZonas },
                { data: fullPlazas },
                { data: tipoData },
                { data: estData }
            ] = await Promise.all([
                supabase.from('mantenimiento').select(`
                    id_mantenimiento, fecha_inicio, fecha_fin, descripcion, id_dispositivo, id_zona, id_plaza, id_empleado, id_tipo, id_estado,
                    estado:estado_mantenimiento ( nombre ),
                    tipo:tipo_mantenimiento ( nombre ),
                    dispositivo ( id_dispositivo, id_plaza, tipo:tipo_dispositivo ( nombre ) ),
                    empleado ( id_empleado, persona ( nombre, apellido ) )
                `).eq('organizacion_id', orgId).order('fecha_inicio', { ascending: false }),
                supabase.from('dispositivo').select('id_dispositivo, id_plaza, id_estado, tipo:tipo_dispositivo(nombre), modelo(nombre, marca(nombre)), plaza:id_plaza(numero_plaza)').eq('organizacion_id', orgId),
                supabase.rpc('get_usuarios_org'),
                supabase.from('empleado').select('id_empleado, id_persona').eq('organizacion_id', orgId),
                supabase.from('zona').select('id_zona, nombre, id_estado, estado:estado_zona(nombre)').eq('organizacion_id', orgId),
                supabase.from('plaza').select('id_plaza, numero_plaza, id_zona, id_estado, estado:estado_plaza(nombre)').eq('organizacion_id', orgId),
                supabase.from('tipo_mantenimiento').select('*').order('nombre'),
                supabase.from('estado_mantenimiento').select('*').order('nombre')
            ]);

            if (mantErr) throw mantErr;
            setMantenimientos(mantData || []);
            setDispositivosOcupados(new Set((mantData || []).filter(m => !m.fecha_fin).map(m => m.id_dispositivo)));

            let users = rpcUsers || [];
            const tecnicosEncontrados = users.filter(u => {
                const rName = (u.nombre_rol || u.rol_nombre || '').toLowerCase();
                const personaId = u.id_persona || u.persona_id;
                return rName.includes('tec') && (allEmps || []).some(e => String(e.id_persona) === String(personaId));
            }).map(u => {
                const personaId = u.id_persona || u.persona_id;
                const emp = (allEmps || []).find(e => String(e.id_persona) === String(personaId));
                return { id_empleado: emp.id_empleado, nombre_label: `${u.nombre || ''} ${u.apellido || ''}`.trim() };
            });

            setTecnicos(tecnicosEncontrados.sort((a,b) => a.nombre_label.localeCompare(b.nombre_label)));
            setAllDispositivos(dispData || []);
            setDispositivos((dispData || []).filter(d => d.id_estado === 1));
            setAllPlazas(fullPlazas || []);
            setPlazasList((fullPlazas || []).filter(p => p.estado?.nombre === 'Libre'));
            setAllZonas(fullZonas || []);
            setZonas((fullZonas || []).filter(z => z.estado?.nombre === 'Activa'));
            setTiposMantenimiento(tipoData || []);
            setEstadosMantenimiento(estData || []);

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
                setCurrentPersonaId(ud?.id_persona);
            }

        } catch (error) { console.error("Error loadData Mantenimiento:", error.message); } 
        finally { setLoading(false); setIsRefreshing(false); }
    };

    const syncEntityStatus = async (target, id, isStarting) => {
        try {
            const statusZon = isStarting ? ESTADO_ZONA.MANTENIMIENTO : ESTADO_ZONA.ACTIVA;
            const statusPla = isStarting ? ESTADO_PLAZA.MANTENIMIENTO : ESTADO_PLAZA.LIBRE;
            const statusDis = isStarting ? ESTADO_DISPOSITIVO.MANTENIMIENTO : ESTADO_DISPOSITIVO.OPERATIVO;

            if (target === 'zona') {
                await supabase.from('zona').update({ id_estado: statusZon }).eq('id_zona', id);
                await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_zona', id);
                const { data: plazas } = await supabase.from('plaza').select('id_plaza').eq('id_zona', id);
                const pIds = (plazas || []).map(p => p.id_plaza);
                if (pIds.length > 0) await supabase.from('dispositivo').update({ id_estado: statusDis }).in('id_plaza', pIds);
            } else if (target === 'plaza') {
                await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_plaza', id);
                await supabase.from('dispositivo').update({ id_estado: statusDis }).eq('id_plaza', id);
            } else if (target === 'dispositivo') {
                await supabase.from('dispositivo').update({ id_estado: statusDis }).eq('id_dispositivo', id);
                const d = allDispositivos.find(x => x.id_dispositivo === id);
                if (d?.id_plaza) await supabase.from('plaza').update({ id_estado: statusPla }).eq('id_plaza', d.id_plaza);
            }
        } catch (err) { console.warn('Error sync:', err.message); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                descripcion: formData.descripcion,
                fecha_inicio: formData.fecha_inicio,
                id_dispositivo: targetType === 'dispositivo' ? parseInt(formData.id_dispositivo) : null,
                id_plaza: targetType === 'plaza' ? parseInt(formData.id_plaza) : null,
                id_zona: targetType === 'zona' ? parseInt(formData.id_zona) : null,
                id_empleado: parseInt(formData.id_empleado),
                id_tipo: parseInt(formData.id_tipo),
                id_estado: editingId ? parseInt(formData.id_estado) : (estadosMantenimiento.find(e => e.nombre?.toLowerCase().includes('pendiente'))?.id_estado || 1),
                fecha_fin: formData.fecha_fin || null,
                organizacion_id: orgId
            };

            const isFinalState = estadosMantenimiento.find(e => e.id_estado === parseInt(payload.id_estado))?.nombre.toLowerCase().includes('completado') || 
                                 estadosMantenimiento.find(e => e.id_estado === parseInt(payload.id_estado))?.nombre.toLowerCase().includes('cancelado');

            if (editingId) {
                await supabase.from('mantenimiento').update(payload).eq('id_mantenimiento', editingId);
            } else {
                await supabase.from('mantenimiento').insert([payload]);
            }

            const tid = payload.id_dispositivo || payload.id_plaza || payload.id_zona;
            if (tid) await syncEntityStatus(targetType, tid, !isFinalState);

            await registrarLog({
                tipo_nombre: editingId ? EVENT_TYPES.CAMBIO_ESTADO : EVENT_TYPES.MANTENIMIENTO_INICIADO,
                descripcion: `${editingId ? 'Cambio' : 'Inicio'} de mantenimiento: ${formData.descripcion}`,
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Mantenimiento'
            });

            Swal.fire('Éxito', editingId ? 'Actualizado' : 'Registrado', 'success');
            setShowModal(false); setEditingId(null);
            loadData();
        } catch (err) { Swal.fire('Error', err.message, 'error'); } 
        finally { setLoading(false); }
    };

    const handleEdit = (item) => {
        setEditingId(item.id_mantenimiento);
        let type = 'dispositivo';
        if (item.id_zona) type = 'zona';
        else if (item.id_plaza) type = 'plaza';
        setTargetType(type);
        setFormData({
            descripcion: item.descripcion || '',
            id_dispositivo: item.id_dispositivo || '',
            id_plaza: item.id_plaza || '',
            id_zona: item.id_zona || '',
            id_empleado: item.id_empleado || '',
            id_tipo: item.id_tipo || '',
            id_estado: item.id_estado || '',
            fecha_inicio: item.fecha_inicio ? item.fecha_inicio.split('T')[0] : '',
            fecha_fin: item.fecha_fin ? item.fecha_fin.split('T')[0] : ''
        });
        setShowModal(true);
    };

    const filtrados = mantenimientos.filter(m => 
        `${m.descripcion} ${m.empleado?.persona?.nombre}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <header className="mb-6 flex justify-between items-center">
                <div>
                   <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><FaTools className="text-blue-600"/> Mantenimiento</h2>
                   <p className="text-gray-500 text-sm mt-1">Gestión de reparaciones y preventivos para {orgNombre}.</p>
                </div>
                <button onClick={() => { setEditingId(null); setFormData({descripcion:'', id_dispositivo:'', id_plaza:'', id_zona:'', id_empleado:'', id_tipo:'', id_estado:'', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin:''}); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-xl font-bold flex items-center gap-2 shadow-md">
                   <FaPlus /> Nuevo Registro
                </button>
            </header>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1">
                    <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                         <div className="relative w-64">
                            <FaSearch className="absolute left-3 top-2.5 text-gray-400" />
                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
                         </div>
                         <button onClick={loadData} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"><FaSync className={isRefreshing ? 'animate-spin' : ''}/></button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4 text-left">Inicio</th>
                                    <th className="px-6 py-4 text-left">Descripción / Objetivo</th>
                                    <th className="px-6 py-4 text-left">Técnico</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                    <th className="px-6 py-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm">
                                {filtrados.map(m => (
                                  <tr key={m.id_mantenimiento} className="hover:bg-gray-50/50">
                                     <td className="px-6 py-4 text-gray-500">{new Date(m.fecha_inicio).toLocaleDateString()}</td>
                                     <td className="px-6 py-4">
                                         <p className="font-bold text-gray-800">{m.descripcion}</p>
                                         <p className="text-[10px] text-blue-500 font-bold uppercase">{m.id_zona ? 'ZONA' : m.id_plaza ? 'PLAZA' : 'DISPOSITIVO'}</p>
                                     </td>
                                     <td className="px-6 py-4 text-gray-600 font-medium">{m.empleado?.persona?.nombre} {m.empleado?.persona?.apellido}</td>
                                     <td className="px-6 py-4 text-center">
                                         <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${m.fecha_fin ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                             {m.estado?.nombre || 'Pendiente'}
                                         </span>
                                     </td>
                                     <td className="px-6 py-4 text-center">
                                         <button onClick={() => handleEdit(m)} className="text-blue-500 hover:scale-110 transition"><FaEdit size={16}/></button>
                                     </td>
                                  </tr>
                                ))}
                            </tbody>
                        </table>
                      </div>
                    </div>
                </div>

                {showModal && (
                   <aside className="w-full lg:w-[380px] flex-shrink-0 animate-in slide-in-from-right-4 fade-in">
                      <div className="bg-white rounded-2xl shadow-2xl border border-blue-50 overflow-hidden sticky top-6">
                        <div className="bg-blue-600 px-5 py-4 flex items-center justify-between text-white font-bold">
                           <span className="flex items-center gap-2"><FaCalendarAlt /> {editingId ? 'Editar' : 'Nuevo'} Mantenimiento</span>
                           <button onClick={() => setShowModal(false)}><FaTimesCircle size={18}/></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                           <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Alcance *</label>
                               <div className="grid grid-cols-3 gap-1">
                                   {['dispositivo','plaza','zona'].map(t => (
                                       <button key={t} type="button" onClick={() => setTargetType(t)} className={`py-1.5 rounded text-[9px] font-black uppercase border transition-all ${targetType === t ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>{t}</button>
                                   ))}
                               </div>
                           </div>
                           <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Entidad Específica *</label>
                               {targetType === 'dispositivo' ? (
                                   <SearchableSelect options={allDispositivos.map(d => ({value: d.id_dispositivo, label: `${d.tipo?.nombre} - ${d.modelo?.nombre || ''} (${d.id_dispositivo})`}))} value={formData.id_dispositivo} onChange={val => setFormData({...formData, id_dispositivo: val})} placeholder="Elegir dispositivo..."/>
                               ) : targetType === 'plaza' ? (
                                   <SearchableSelect options={allPlazas.map(p => ({value: p.id_plaza, label: `Plaza ${p.numero_plaza}`}))} value={formData.id_plaza} onChange={val => setFormData({...formData, id_plaza: val})} placeholder="Elegir plaza..."/>
                               ) : (
                                   <SearchableSelect options={allZonas.map(z => ({value: z.id_zona, label: z.nombre}))} value={formData.id_zona} onChange={val => setFormData({...formData, id_zona: val})} placeholder="Elegir zona..."/>
                               )}
                           </div>
                           <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Técnico Asignado *</label>
                               <select className="w-full border rounded-xl p-2.5 text-sm outline-none" value={formData.id_empleado} onChange={e => setFormData({...formData, id_empleado: e.target.value})} required>
                                   <option value="">— Elegir Técnico —</option>
                                   {tecnicos.map(t => <option key={t.id_empleado} value={t.id_empleado}>{t.nombre_label}</option>)}
                               </select>
                           </div>
                           <div className="grid grid-cols-2 gap-3">
                               <div>
                                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tipo *</label>
                                   <select className="w-full border rounded-xl p-2 text-sm" value={formData.id_tipo} onChange={e => setFormData({...formData, id_tipo: e.target.value})} required>
                                       <option value="">— Tipo —</option>
                                       {tiposMantenimiento.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
                                   </select>
                               </div>
                               <div>
                                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Estado *</label>
                                   <select className="w-full border rounded-xl p-2 text-sm" value={formData.id_estado} onChange={e => setFormData({...formData, id_estado: e.target.value})} required>
                                       <option value="">— Estado —</option>
                                       {estadosMantenimiento.map(s => <option key={s.id_estado} value={s.id_estado}>{s.nombre}</option>)}
                                   </select>
                               </div>
                           </div>
                           <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Descripción del Problema/Tarea *</label>
                               <textarea className="w-full border rounded-xl p-2.5 text-sm h-20 resize-none outline-none focus:ring-2 focus:ring-blue-100" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} required placeholder="Ej: Falla en sensor ultrasónico..."/>
                           </div>
                           <div className="grid grid-cols-2 gap-3">
                               <div>
                                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fecha Inicio</label>
                                   <input type="date" className="w-full border rounded-xl p-2 text-[11px]" value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio:e.target.value})} />
                               </div>
                               <div>
                                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Fecha Fin (Si finalizó)</label>
                                   <input type="date" className="w-full border rounded-xl p-2 text-[11px]" value={formData.fecha_fin} onChange={e => setFormData({...formData, fecha_fin:e.target.value})} />
                               </div>
                           </div>
                           <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-md transition-all active:scale-95">
                               {editingId ? 'ACTUALIZAR REGISTRO' : 'REGISTRAR MANTENIMIENTO'}
                           </button>
                        </form>
                      </div>
                   </aside>
                )}
            </div>
        </Layout>
    );
}

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import {
    FaSearch, FaPlus, FaUserTie, FaTrash, FaSuitcase,
    FaCalendarAlt, FaCar, FaEdit, FaSync, FaTimesCircle,
    FaCheck, FaTimes
} from 'react-icons/fa';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';
import { registrarLog, EVENT_TYPES } from '../utils/logging';
import { ESTADO_PLAZA, ESTADO_ASIGNACION } from '../lib/constants';

export default function Asignaciones() {
    const { orgId, orgNombre } = useOrg();
    const [asignaciones, setAsignaciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentPersonaId, setCurrentPersonaId] = useState(null);

    const [editingAsignacion, setEditingAsignacion] = useState(null);
    const [isPermanent, setIsPermanent] = useState(false);

    const [empleadosList, setEmpleadosList] = useState([]);
    const [empleadosConPlaza, setEmpleadosConPlaza] = useState(new Set());
    const [plazasList, setPlazasList] = useState([]);
    const [estadosAsigList, setEstadosAsigList] = useState([]);
    
    const [changingStatusFor, setChangingStatusFor] = useState(null);
    const [newStatusChoice, setNewStatusChoice] = useState(null);

    const getNowLocalISO = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().slice(0, 16);
    };

    const [formData, setFormData] = useState({
        id_empleado: '',
        id_plaza: '',
        fecha_inicio: getNowLocalISO(),
        fecha_fin: '',
        notas: ''
    });

    useEffect(() => {
        if (orgId) {
            loadData();
            const timer = setInterval(checkExpiredAssignments, 300000);
            const channel = supabase.channel('realtime_asignaciones')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'asignacion' }, loadData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'plaza' }, loadData)
                .subscribe();
            return () => { 
                supabase.removeChannel(channel); 
                clearInterval(timer);
            };
        }
    }, [orgId]);

    const checkExpiredAssignments = async () => {
        if (!orgId) return;
        try {
            const ahora = new Date().toISOString();
            const { data: vencidas } = await supabase
                .from('asignacion')
                .select('id_asignacion, id_plaza')
                .eq('id_estado', 1)
                .eq('organizacion_id', orgId)
                .not('fecha_fin', 'is', null)
                .lt('fecha_fin', ahora);
            
            if (!vencidas || vencidas.length === 0) return;

            const idFinalizada = ESTADO_ASIGNACION.FINALIZADA;
            const idLibre = ESTADO_PLAZA.LIBRE;

            for (const asig of vencidas) {
                await supabase.from('asignacion').update({ id_estado: idFinalizada }).eq('id_asignacion', asig.id_asignacion);
                if (asig.id_plaza) await supabase.from('plaza').update({ id_estado: idLibre }).eq('id_plaza', asig.id_plaza);
            }
            loadData();
        } catch (e) { console.error("[AutoClose] Error:", e.message); }
    };

    const loadData = async () => {
        if (!orgId) return;
        setLoading(true);
        setIsRefreshing(true);
        try {
            const [
                { data: asigData },
                { data: emps },
                { data: plazas },
                { data: catEst }
            ] = await Promise.all([
                supabase.from('asignacion').select('*, plaza:id_plaza(numero_plaza), empleado:id_empleado(id_empleado, persona(nombre, apellido))').eq('organizacion_id', orgId).order('created_at', { ascending: false }),
                supabase.from('empleado').select('id_empleado, persona(nombre, apellido)').eq('organizacion_id', orgId),
                supabase.from('plaza').select('id_plaza, numero_plaza, id_estado, zona:id_zona(estado_zona(nombre))').eq('organizacion_id', orgId),
                supabase.from('estado_asignacion').select('*').order('id_estado')
            ]);

            const empsOrdenados = (emps || []).sort((a,b) => (a.persona?.nombre||'').localeCompare(b.persona?.nombre||''));
            setAsignaciones(asigData || []);
            setEstadosAsigList(catEst || []);
            setEmpleadosList(empsOrdenados);
            
            const ocupados = new Set((asigData || []).filter(a => a.id_estado === 1).map(a => a.id_empleado));
            setEmpleadosConPlaza(ocupados);

            const libres = (plazas || []).filter(p => p.id_estado === 1 && (p.zona?.estado_zona?.nombre || 'Activa') === 'Activa');
            setPlazasList(libres);

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: ud } = await supabase.from('usuario').select('id_persona').eq('id', user.id).maybeSingle();
                setCurrentPersonaId(ud?.id_persona);
            }
        } catch (err) { console.error(err); } 
        finally { setLoading(false); setIsRefreshing(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.id_empleado || !formData.id_plaza) return Swal.fire('Atención','Empleado y Plaza obligatorios.','warning');
        
        setLoading(true);
        try {
            const payload = {
                id_empleado: parseInt(formData.id_empleado),
                id_plaza: parseInt(formData.id_plaza),
                fecha_inicio: new Date(formData.fecha_inicio).toISOString(),
                fecha_fin: isPermanent || !formData.fecha_fin ? null : new Date(formData.fecha_fin).toISOString(),
                notas: formData.notas,
                organizacion_id: orgId
            };

            if (editingAsignacion) {
                await supabase.from('asignacion').update(payload).eq('id_asignacion', editingAsignacion.id_asignacion);
                if (editingAsignacion.id_plaza !== payload.id_plaza) {
                    await supabase.from('plaza').update({ id_estado: 1 }).eq('id_plaza', editingAsignacion.id_plaza);
                    await supabase.from('plaza').update({ id_estado: 4 }).eq('id_plaza', payload.id_plaza);
                }
            } else {
                await supabase.from('asignacion').insert([{ ...payload, id_estado: 1 }]);
                await supabase.from('plaza').update({ id_estado: 4 }).eq('id_plaza', payload.id_plaza);
            }

            await registrarLog({
                tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
                descripcion: `${editingAsignacion ? 'Edición' : 'Nueva'} asignación de plaza #${formData.id_plaza}`,
                id_persona: currentPersonaId,
                organizacion_id: orgId,
                origen: 'Panel Web - Asignaciones'
            });

            Swal.fire('Éxito', 'Operación realizada correctamente.', 'success');
            setShowModal(false); setEditingAsignacion(null);
            loadData();
        } catch (err) { Swal.fire('Error', err.message, 'error'); } 
        finally { setLoading(false); }
    };

    const handleConfirmarCambioEstado = async (asig) => {
        try {
            setLoading(true);
            const nextStatus = parseInt(newStatusChoice);
            const updatePayload = { id_estado: nextStatus };
            if (nextStatus === 2) updatePayload.fecha_fin = new Date().toISOString();

            await supabase.from('asignacion').update(updatePayload).eq('id_asignacion', asig.id_asignacion);
            if (nextStatus === 2 || nextStatus === 3) {
                await supabase.from('plaza').update({ id_estado: 1 }).eq('id_plaza', asig.id_plaza);
            }

            Swal.fire('Actualizado', 'Cambio de estado exitoso.', 'success');
            setChangingStatusFor(null);
            loadData();
        } catch (err) { Swal.fire('Error', err.message, 'error'); } 
        finally { setLoading(false); }
    };

    const filtrados = asignaciones.filter(a => 
        `${a.empleado?.persona?.nombre} ${a.plaza?.numero_plaza}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout>
            <header className="mb-6 flex justify-between items-center">
                <div>
                   <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><FaSuitcase className="text-purple-600"/> Asignaciones Fijas</h2>
                   <p className="text-gray-500 text-sm mt-1">Control de estacionamientos exclusivos para personal.</p>
                </div>
                <button onClick={() => { setEditingAsignacion(null); setFormData({id_empleado:'', id_plaza:'', fecha_inicio:getNowLocalISO(), fecha_fin:'', notas:''}); setIsPermanent(false); setShowModal(true); }} className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-6 rounded-xl font-bold flex items-center gap-2 shadow-md">
                   <FaPlus /> Nueva Asignación
                </button>
            </header>

            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                   <div className="relative w-64">
                      <FaSearch className="absolute left-3 top-2.5 text-gray-400" />
                      <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" />
                   </div>
                   <button onClick={loadData} className="p-2 text-purple-600 hover:bg-purple-50 rounded-full"><FaSync className={isRefreshing ? 'animate-spin' : ''}/></button>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 text-left">Empleado</th>
                                <th className="px-6 py-4 text-center">Plaza</th>
                                <th className="px-6 py-4 text-center">Inicio</th>
                                <th className="px-6 py-4 text-center">Vence</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-sm">
                            {filtrados.map(a => (
                                <tr key={a.id_asignacion} className="hover:bg-purple-50/30">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><FaUserTie /></div>
                                            <span className="font-bold text-gray-800">{a.empleado?.persona?.nombre} {a.empleado?.persona?.apellido}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-black text-purple-700 uppercase">#{a.plaza?.numero_plaza}</td>
                                    <td className="px-6 py-4 text-center text-gray-500">{new Date(a.fecha_inicio).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-center text-gray-500 font-bold">{a.fecha_fin ? new Date(a.fecha_fin).toLocaleDateString() : 'FIJA'}</td>
                                    <td className="px-6 py-4 text-center">
                                        {changingStatusFor === a.id_asignacion ? (
                                            <div className="flex items-center gap-1">
                                                <select value={newStatusChoice} onChange={e => setNewStatusChoice(e.target.value)} className="border rounded px-1 py-1 text-xs">
                                                    {estadosAsigList.map(s => <option key={s.id_estado} value={s.id_estado}>{s.nombre}</option>)}
                                                </select>
                                                <button onClick={() => handleConfirmarCambioEstado(a)} className="bg-green-500 text-white p-1 rounded"><FaCheck size={10}/></button>
                                            </div>
                                        ) : (
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${a.id_estado === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                                {estadosAsigList.find(e => e.id_estado === a.id_estado)?.nombre || 'Indefinido'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                                        <button onClick={() => { setChangingStatusFor(a.id_asignacion); setNewStatusChoice(a.id_estado); }} className="text-purple-500"><FaSync/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-purple-600 text-white p-5 flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><FaSuitcase/> {editingAsignacion ? 'Editar' : 'Nueva'} Asignación</h3>
                            <button onClick={() => setShowModal(false)}><FaTimesCircle/></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Empleado *</label>
                                <SearchableSelect options={empleadosList.map(e => ({value: e.id_empleado, label: `${e.persona?.nombre} ${e.persona?.apellido}`, disabled: !editingAsignacion && empleadosConPlaza.has(e.id_empleado)}))} value={formData.id_empleado} onChange={val => setFormData({...formData, id_empleado: val})} placeholder="Elegir empleado..."/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase">Plaza *</label>
                                <SearchableSelect options={plazasList.map(p => ({value: p.id_plaza, label: `Plaza #${p.numero_plaza}`}))} value={formData.id_plaza} onChange={val => setFormData({...formData, id_plaza: val})} placeholder="Elegir plaza..."/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Fecha Inicio</label>
                                    <input type="datetime-local" className="w-full border rounded-xl p-2 text-xs" value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})} />
                                </div>
                                <div>
                                    <div className="flex justify-between">
                                        <label className="text-[10px] font-black text-gray-400 uppercase">Fecha Fin</label>
                                        <label className="text-[10px] font-black text-purple-600 flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" checked={isPermanent} onChange={e => { setIsPermanent(e.target.checked); if(e.target.checked) setFormData({...formData, fecha_fin:''}); }} /> FIJA
                                        </label>
                                    </div>
                                    <input type="datetime-local" disabled={isPermanent} className="w-full border rounded-xl p-2 text-xs disabled:opacity-30" value={formData.fecha_fin} onChange={e => setFormData({...formData, fecha_fin: e.target.value})} />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-lg uppercase tracking-widest">{editingAsignacion ? 'Actualizar' : 'Asignar'}</button>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
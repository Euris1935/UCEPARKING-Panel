
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaCar, FaSave, FaTrash, FaEdit, FaSyncAlt } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';

export default function Vehiculos() {
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Vehículos', 'crear');
  const canEdit = tienePermiso('Módulo Vehículos', 'editar');
  const canDelete = tienePermiso('Módulo Vehículos', 'eliminar');

  const [loading, setLoading] = useState(false);
  const [vehiculos, setVehiculos] = useState([]);
  const [personasSistema, setPersonasSistema] = useState([]);
  const [listaMarcas, setListaMarcas] = useState([]);
  const [listaModelos, setListaModelos] = useState([]);
  const [listaColores, setListaColores] = useState([]);

  const [vehiculoPersonalForm, setVehiculoPersonalForm] = useState({
    persona_id: '', placa: '', id_marca: '', id_modelo: '', id_color: ''
  });
  const [editandoVehiculo, setEditandoVehiculo] = useState(null);
  const [editVehiculoForm, setEditVehiculoForm] = useState({ placa: '', id_marca: '', id_modelo: '', id_color: '' });

  useEffect(() => {
    loadData();
    const ch = supabase.channel('rt_vehiculos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const loadData = async () => {
    try {
      const { data: vhs } = await supabase
        .from('vehiculos')
        .select('*, marcas_vehiculo(nombre), modelos_vehiculo(nombre), colores_vehiculo(nombre), personas(nombre, apellido)')
        .order('Fecha_Registro', { ascending: false });

      const { data: catMarcas } = await supabase.from('marcas_vehiculo').select('id_marca, nombre').order('nombre');
      const { data: catModelos } = await supabase.from('modelos_vehiculo').select('id_modelo, nombre, id_marca').order('nombre');
      const { data: catColores } = await supabase.from('colores_vehiculo').select('id_color, nombre').order('nombre');

      // Personal del sistema
      const { data: usuariosRaw } = await supabase.from('usuarios').select('id_persona');
      const personaIds = (usuariosRaw || []).filter(u => u.id_persona).map(u => u.id_persona);
      let personasDeUsuarios = [];
      if (personaIds.length > 0) {
        const { data: pData } = await supabase.from('personas').select('id_persona, nombre, apellido').in('id_persona', personaIds);
        personasDeUsuarios = (pData || []).map(p => ({ ...p, rol: 'Usuario' }));
      }
      const { data: empleadosData } = await supabase.from('empleados').select('id_persona, personas(id_persona, nombre, apellido)');
      const personalEmpleados = (empleadosData || []).filter(e => e.personas).map(e => ({ ...e.personas, rol: 'Empleado' }));
      const mapa = new Map();
      personasDeUsuarios.forEach(p => { if (p.id_persona) mapa.set(p.id_persona, p); });
      personalEmpleados.forEach(p => { if (p.id_persona) mapa.set(p.id_persona, p); });

      setVehiculos(vhs || []);
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
      setPersonasSistema(Array.from(mapa.values()));
    } catch (err) { console.error('Error cargando datos:', err); }
  };

  const handleVehiculoPersonalSubmit = async (e) => {
    e.preventDefault();
    const placaLimpia = vehiculoPersonalForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 6) return Swal.fire('Atención', 'La placa no debe superar los 6 caracteres.', 'warning');
    setLoading(true);
    try {
      const { error } = await supabase.from('vehiculos').insert([{
        id_persona: vehiculoPersonalForm.persona_id,
        placa: vehiculoPersonalForm.placa.toUpperCase(),
        id_marca: vehiculoPersonalForm.id_marca ? parseInt(vehiculoPersonalForm.id_marca) : null,
        id_modelo: vehiculoPersonalForm.id_modelo ? parseInt(vehiculoPersonalForm.id_modelo) : null,
        id_color: vehiculoPersonalForm.id_color ? parseInt(vehiculoPersonalForm.id_color) : null
      }]);
      if (error) throw error;
      Swal.fire('Registrado', 'Vehículo vinculado correctamente.', 'success');
      setVehiculoPersonalForm({ persona_id: '', placa: '', id_marca: '', id_modelo: '', id_color: '' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    try {
      const { error, count } = await supabase.from('vehiculos').update(
        { placa: editVehiculoForm.placa.toUpperCase(), id_marca: editVehiculoForm.id_marca ? parseInt(editVehiculoForm.id_marca) : null, id_modelo: editVehiculoForm.id_modelo ? parseInt(editVehiculoForm.id_modelo) : null, id_color: editVehiculoForm.id_color ? parseInt(editVehiculoForm.id_color) : null },
        { count: 'exact' }
      ).eq('id_vehiculo', editandoVehiculo.id_vehiculo);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo actualizar (0 filas). Verifica los permisos UPDATE en Supabase.');
      Swal.fire('Actualizado', 'Vehículo actualizado correctamente.', 'success');
      setEditandoVehiculo(null);
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEliminarVehiculo = async (vehiculo) => {
    const { data: ticketsActivos } = await supabase.from('tickets').select('Id_Ticket').eq('id_vehiculo', vehiculo.id_vehiculo).eq('id_estado', 1);
    if (ticketsActivos && ticketsActivos.length > 0) return Swal.fire('No se puede eliminar', `Este vehículo tiene ${ticketsActivos.length} ticket(s) activo(s). Registre la salida primero.`, 'warning');

    const r = await Swal.fire({ title: '¿Eliminar vehículo?', html: `Placa: <b>${vehiculo.placa}</b><br><small>Se eliminarán también sus registros de acceso históricos.</small>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
    if (!r.isConfirmed) return;

    try {
      await supabase.from('registros_acceso').delete().eq('id_vehiculo', vehiculo.id_vehiculo);
      await supabase.from('tickets').delete().eq('id_vehiculo', vehiculo.id_vehiculo).neq('id_estado', 1);
      const { error, count } = await supabase.from('vehiculos').delete({ count: 'exact' }).eq('id_vehiculo', vehiculo.id_vehiculo);
      if (error) throw error;
      if (count === 0) throw new Error('No se pudo eliminar el vehículo (0 filas). Verifica los permisos en Supabase.');
      Swal.fire('Eliminado', 'Vehículo eliminado correctamente.', 'success');
      loadData();
    } catch (err) { Swal.fire('Error al eliminar', err.message, 'error'); }
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Flota de Vehículos</h2>
        <p className="text-gray-500 mt-1">Registro y gestión de vehículos del personal.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Formulario */}
        {canCreate && (
        <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
          <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-gray-800">
            <FaCar className="text-purple-600" /> Vincular Vehículo Personal
          </h3>
          <form onSubmit={handleVehiculoPersonalSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Propietario *</label>
              <select className="w-full border rounded-lg p-2 text-sm mt-0.5 focus:ring-purple-500" value={vehiculoPersonalForm.persona_id} onChange={e => setVehiculoPersonalForm(f => ({ ...f, persona_id: e.target.value }))} required>
                <option value="">— Seleccionar persona —</option>
                {personasSistema.map(p => <option key={p.id_persona} value={p.id_persona}>{p.nombre} {p.apellido} ({p.rol})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (máx. 6 caracteres)</label>
              <input
                className="w-full border-2 border-purple-200 rounded-lg p-2 text-sm font-mono uppercase tracking-widest text-center text-base mt-0.5"
                placeholder="ABC123" value={vehiculoPersonalForm.placa} maxLength={7}
                onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (val.length <= 6) setVehiculoPersonalForm(f => ({ ...f, placa: val })); }}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={vehiculoPersonalForm.id_marca} onChange={e => setVehiculoPersonalForm(f => ({ ...f, id_marca: e.target.value, id_modelo: '' }))}>
                  <option value="">— Seleccionar —</option>
                  {listaMarcas.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={vehiculoPersonalForm.id_modelo} onChange={e => setVehiculoPersonalForm(f => ({ ...f, id_modelo: e.target.value }))} disabled={!vehiculoPersonalForm.id_marca}>
                  <option value="">— Seleccionar —</option>
                  {listaModelos.filter(m => m.id_marca === parseInt(vehiculoPersonalForm.id_marca)).map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
              <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={vehiculoPersonalForm.id_color} onChange={e => setVehiculoPersonalForm(f => ({ ...f, id_color: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {listaColores.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
              </select>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow">
              <FaSave /> VINCULAR VEHÍCULO
            </button>
          </form>
        </section>
        )}

        {/* Tabla flota */}
        <section className={`${canCreate ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden`}>
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FaCar className="text-purple-600" /> Flota Registrada
              <span className="ml-2 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{vehiculos.length} vehículos</span>
            </h3>
            <button onClick={loadData} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition"><FaSyncAlt /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Propietario</th>
                  <th className="px-5 py-3 text-left">Placa</th>
                  <th className="px-5 py-3 text-left">Marca / Modelo / Color</th>
                  <th className="px-5 py-3 text-left">Registro</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vehiculos.length === 0
                  ? <tr><td colSpan="5" className="text-center py-10 text-gray-400">No hay vehículos registrados.</td></tr>
                  : vehiculos.map(v => (
                    <tr key={v.id_vehiculo} className="hover:bg-gray-50 transition-all">
                      <td className="px-5 py-4 font-medium text-gray-800">{v.personas?.nombre} {v.personas?.apellido}</td>
                      <td className="px-5 py-4"><span className="font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded text-xs">{v.placa}</span></td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{[v.marcas_vehiculo?.nombre, v.modelos_vehiculo?.nombre, v.colores_vehiculo?.nombre].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-5 py-4 text-xs text-gray-400">{new Date(v.Fecha_Registro).toLocaleDateString('es-DO')}</td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          {canEdit && <button onClick={() => { setEditandoVehiculo(v); setEditVehiculoForm({ placa: v.placa, id_marca: v.id_marca || '', id_modelo: v.id_modelo || '', id_color: v.id_color || '' }); }} className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition" title="Editar"><FaEdit size={14} /></button>}
                          {canDelete && <button onClick={() => handleEliminarVehiculo(v)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition" title="Eliminar"><FaTrash size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal Editar */}
      {editandoVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Editar Vehículo</h3>
            <form onSubmit={handleEditarVehiculo} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa *</label>
                <input className="w-full border-2 border-purple-200 rounded-lg p-2 font-mono uppercase tracking-widest text-center text-base mt-0.5" value={editVehiculoForm.placa} maxLength={7} onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (val.length <= 6) setEditVehiculoForm(f => ({ ...f, placa: val })); }} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Marca</label>
                  <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={editVehiculoForm.id_marca} onChange={e => setEditVehiculoForm(f => ({ ...f, id_marca: e.target.value, id_modelo: '' }))}>
                    <option value="">— Seleccionar —</option>
                    {listaMarcas.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                  <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={editVehiculoForm.id_modelo} onChange={e => setEditVehiculoForm(f => ({ ...f, id_modelo: e.target.value }))} disabled={!editVehiculoForm.id_marca}>
                    <option value="">— Seleccionar —</option>
                    {listaModelos.filter(m => m.id_marca === parseInt(editVehiculoForm.id_marca)).map(m => <option key={m.id_modelo} value={m.id_modelo}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                <select className="w-full border rounded-lg p-2 text-sm mt-0.5" value={editVehiculoForm.id_color} onChange={e => setEditVehiculoForm(f => ({ ...f, id_color: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {listaColores.map(c => <option key={c.id_color} value={c.id_color}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditandoVehiculo(null)} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-bold">Cancelar</button>
                <button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold shadow">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

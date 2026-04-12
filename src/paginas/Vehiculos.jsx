
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaCar, FaSave, FaTrash, FaEdit, FaSyncAlt, FaSearch } from 'react-icons/fa';
import { useRbac } from '../contexts/RbacContext';
import { useOrg } from '../contexts/OrgContext';
import SearchableSelect from '../componentes/SearchableSelect';

export default function Vehiculos() {
  const { orgId } = useOrg();
  const { tienePermiso } = useRbac();
  const canCreate = tienePermiso('Módulo Vehículos', 'crear');
  const canEdit = tienePermiso('Módulo Vehículos', 'editar');
  const canDelete = tienePermiso('Módulo Vehículos', 'eliminar');

  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPersonaId, setCurrentPersonaId] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [searchFlota, setSearchFlota] = useState('');
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
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: uData } = await supabase.from('usuario').select('id_persona').eq('id', user.id).single();
        if (uData?.id_persona) setCurrentPersonaId(uData.id_persona);
      }
    };
    init();
    loadData();
    const ch = supabase.channel('rt_vehiculos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculo' }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const { data: vhs } = await supabase
        .from('vehiculo')
        .select('*, marca(nombre), modelo(nombre), color(nombre), persona(nombre, apellido)')
        .order('created_at', { ascending: false });

      const { data: catMarcas } = await supabase.from('marca').select('id_marca, nombre').eq('tipo', 'vehiculo').order('nombre');
      const { data: catModelos } = await supabase.from('modelo').select('id_modelo, nombre, id_marca').eq('tipo', 'vehiculo').order('nombre');
      const { data: catColores } = await supabase.from('color').select('id_color, nombre').order('nombre');

      // Personal del sistema
      const { data: usuariosRaw } = await supabase.from('usuario').select('id_persona');
      const personaIds = (usuariosRaw || []).filter(u => u.id_persona).map(u => u.id_persona);
      let personasDeUsuarios = [];
      if (personaIds.length > 0) {
        const { data: pData } = await supabase.from('persona').select('id_persona, nombre, apellido').in('id_persona', personaIds);
        personasDeUsuarios = (pData || []).map(p => ({ ...p, rol: 'Usuario' }));
      }
      const { data: empleadosData } = await supabase.from('empleado').select('id_persona', 'persona(id_persona, nombre, apellido)');
      const personalEmpleados = (empleadosData || []).filter(e => e.persona).map(e => ({ ...e.persona, rol: 'Empleado' }));
      const mapa = new Map();
      personasDeUsuarios.forEach(p => { if (p.id_persona) mapa.set(p.id_persona, p); });
      personalEmpleados.forEach(p => { if (p.id_persona) mapa.set(p.id_persona, p); });

      setVehiculos(vhs || []);
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
      setPersonasSistema(Array.from(mapa.values()).sort((a, b) =>
        `${a.nombre} ${a.apellido}`.toLowerCase().localeCompare(`${b.nombre} ${b.apellido}`.toLowerCase())
      ));
    } catch (err) { console.error('Error cargando datos:', err); } finally { setIsRefreshing(false); }
  };

  const registrarLog = async (tipo_nombre, descripcion) => {
    if (!currentPersonaId) return;
    try {
      const { data: te } = await supabase.from('tipo').select('id').eq('contexto', 'evento').eq('nombre', tipo_nombre).maybeSingle();
      const { data: oe } = await supabase.from('origen_evento').select('id_origen').eq('nombre', 'Panel Web - Vehículos').maybeSingle();
      await supabase.from('evento').insert([{ 
        fecha_hora: new Date().toISOString(), 
        descripcion: descripcion, 
        id_persona: currentPersonaId, 
        id_tipo: te?.id || null, 
        id_origen_evento: oe?.id_origen || null,
        organizacion_id: orgId
      }]);
    } catch (e) { console.warn('Log error:', e.message); }
  };

  const handleVehiculoPersonalSubmit = async (e) => {
    e.preventDefault();
    if (!vehiculoPersonalForm.persona_id) return Swal.fire('Atención', 'Seleccione un propietario.', 'warning');
    const placaLimpia = vehiculoPersonalForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 6) return Swal.fire('Atención', 'La placa no debe superar los 6 caracteres.', 'warning');
    setLoading(true);
    try {
      const { error } = await supabase.from('vehiculo').insert([{
        id_persona: vehiculoPersonalForm.persona_id,
        placa: vehiculoPersonalForm.placa.toUpperCase(),
        id_marca: vehiculoPersonalForm.id_marca ? parseInt(vehiculoPersonalForm.id_marca) : null,
        id_modelo: vehiculoPersonalForm.id_modelo ? parseInt(vehiculoPersonalForm.id_modelo) : null,
        id_color: vehiculoPersonalForm.id_color ? parseInt(vehiculoPersonalForm.id_color) : null,
        organizacion_id: orgId
      }]);
      if (error) throw error;
      Swal.fire('Registrado', 'Vehículo vinculado correctamente.', 'success');
      const p = personasSistema.find(p => p.id_persona === vehiculoPersonalForm.persona_id);
      registrarLog('Vehículo Registrado', `Vehículo ${vehiculoPersonalForm.placa.toUpperCase()} registrado a nombre de ${p?.nombre} ${p?.apellido}`);
      setVehiculoPersonalForm({ persona_id: '', placa: '', id_marca: '', id_modelo: '', id_color: '' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    try {
      const { error, count } = await supabase.from('vehiculo').update(
        { placa: editVehiculoForm.placa.toUpperCase(), id_marca: editVehiculoForm.id_marca ? parseInt(editVehiculoForm.id_marca) : null, id_modelo: editVehiculoForm.id_modelo ? parseInt(editVehiculoForm.id_modelo) : null, id_color: editVehiculoForm.id_color ? parseInt(editVehiculoForm.id_color) : null },
        { count: 'exact' }
      ).eq('id_vehiculo', editandoVehiculo.id_vehiculo);
      if (error) throw error;
      Swal.fire('Actualizado', 'Datos actualizados correctamente.', 'success');
      registrarLog('Cambio de Estado', `Edición de datos para vehículo con placa ${editVehiculoForm.placa}`);
      setEditandoVehiculo(null);
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEliminarVehiculo = async (vehiculo) => {
    // Buscar si tiene un ticket activo. id_estado para Ticket 'Activo' ahora depende del contexto en tabla estado.
    // Buscamos el ID del estado 'Activo' para 'ticket'.
    const { data: estActivo } = await supabase.from('estado').select('id').eq('contexto', 'ticket').eq('nombre', 'Activo').maybeSingle();
    
    const { data: ticketsActivos } = await supabase.from('ticket').select('id_ticket').eq('id_vehiculo', vehiculo.id_vehiculo).eq('id_estado', estActivo?.id || 1);
    if (ticketsActivos && ticketsActivos.length > 0) return Swal.fire('No se puede eliminar', `Este vehículo tiene ${ticketsActivos.length} ticket(s) activo(s). Registre la salida primero.`, 'warning');

    const result = await Swal.fire({ title: '¿Eliminar vehículo?', html: `Placa: <b>${vehiculo.placa}</b><br><small>Se eliminarán también sus registros de acceso históricos.</small>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
    
    try {
      if (result.isConfirmed) {
        const { error } = await supabase.from('vehiculo').delete().eq('id_vehiculo', vehiculo.id_vehiculo);
        if (error) {
          Swal.fire('Error', error.message, 'error');
        } else {
          Swal.fire('Eliminado', 'Vehículo borrado correctamente.', 'success');
          registrarLog('Vehículo Eliminado', `Vehículo con placa ${vehiculo.placa} eliminado del sistema.`);
          loadData();
        }
      }
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
              <SearchableSelect
                options={personasSistema.map(p => ({ value: p.id_persona, label: `${p.nombre} ${p.apellido} (${p.rol})` }))}
                value={vehiculoPersonalForm.persona_id}
                onChange={(val) => setVehiculoPersonalForm(f => ({ ...f, persona_id: val }))}
                placeholder="— Seleccionar persona —"
              />
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
                <SearchableSelect
                  options={listaMarcas.map(m => ({ value: m.id_marca, label: m.nombre }))}
                  value={vehiculoPersonalForm.id_marca}
                  onChange={(val) => setVehiculoPersonalForm(f => ({ ...f, id_marca: val, id_modelo: '' }))}
                  placeholder="— Seleccionar —"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                <SearchableSelect
                  options={listaModelos.filter(m => m.id_marca === parseInt(vehiculoPersonalForm.id_marca)).map(m => ({ value: m.id_modelo, label: m.nombre }))}
                  value={vehiculoPersonalForm.id_modelo}
                  onChange={(val) => setVehiculoPersonalForm(f => ({ ...f, id_modelo: val }))}
                  disabled={!vehiculoPersonalForm.id_marca}
                  placeholder="— Seleccionar —"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
              <SearchableSelect
                options={listaColores.map(c => ({ value: c.id_color, label: c.nombre }))}
                value={vehiculoPersonalForm.id_color}
                onChange={(val) => setVehiculoPersonalForm(f => ({ ...f, id_color: val }))}
                placeholder="— Seleccionar —"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 shadow">
              <FaSave /> VINCULAR VEHÍCULO
            </button>
          </form>
        </section>
        )}

        {/* Tabla flota */}
        <section className={`${canCreate ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden flex flex-col`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b gap-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FaCar className="text-purple-600" /> Flota Registrada
              <span className="ml-2 bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{vehiculos.length} vehículos</span>
            </h3>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <FaSearch className="absolute left-3 top-2.5 text-gray-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Buscar por placa o propietario..." 
                  className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-purple-500 focus:outline-none"
                  value={searchFlota}
                  onChange={(e) => setSearchFlota(e.target.value)}
                />
              </div>
              <button onClick={loadData} disabled={isRefreshing} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-50">
                <FaSyncAlt className={isRefreshing ? 'animate-spin text-purple-600' : ''} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-5 py-3 text-left">Propietario</th>
                  <th className="px-5 py-3 text-left">Placa</th>
                  <th className="px-5 py-3 text-left">Marca / Modelo / Color</th>
                  <th className="px-5 py-3 text-left">Registro</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vehiculos.filter(v => {
                    const matchName = `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`.toLowerCase().includes(searchFlota.toLowerCase());
                    const matchPlaca = (v.placa || '').toLowerCase().includes(searchFlota.toLowerCase());
                    return matchName || matchPlaca;
                }).length === 0
                  ? <tr><td colSpan="5" className="text-center py-10 text-gray-400">No hay vehículos que coincidan.</td></tr>
                  : vehiculos.filter(v => {
                        const matchName = `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`.toLowerCase().includes(searchFlota.toLowerCase());
                        const matchPlaca = (v.placa || '').toLowerCase().includes(searchFlota.toLowerCase());
                        return matchName || matchPlaca;
                    }).map(v => (
                    <tr key={v.id_vehiculo} className="hover:bg-gray-50 transition-all">
                      <td className="px-5 py-4 font-medium text-gray-800">{v.persona?.nombre} {v.persona?.apellido}</td>
                      <td className="px-5 py-4"><span className="font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded text-xs">{v.placa}</span></td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{[v.marca?.nombre, v.modelo?.nombre, v.color?.nombre].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-5 py-4 text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString('es-DO')}</td>
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
                  <SearchableSelect
                    options={listaMarcas.map(m => ({ value: m.id_marca, label: m.nombre }))}
                    value={editVehiculoForm.id_marca}
                    onChange={(val) => setEditVehiculoForm(f => ({ ...f, id_marca: val, id_modelo: '' }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Modelo</label>
                  <SearchableSelect
                    options={listaModelos.filter(m => m.id_marca === parseInt(editVehiculoForm.id_marca)).map(m => ({ value: m.id_modelo, label: m.nombre }))}
                    value={editVehiculoForm.id_modelo}
                    onChange={(val) => setEditVehiculoForm(f => ({ ...f, id_modelo: val }))}
                    disabled={!editVehiculoForm.id_marca}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                  <SearchableSelect
                    options={listaColores.map(c => ({ value: c.id_color, label: c.nombre }))}
                    value={editVehiculoForm.id_color}
                    onChange={(val) => setEditVehiculoForm(f => ({ ...f, id_color: val }))}
                  />
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

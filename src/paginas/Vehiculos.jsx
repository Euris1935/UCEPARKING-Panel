
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { FaCar, FaSave, FaTrash, FaEdit, FaSyncAlt, FaSearch, FaSync, FaCheck, FaTimes } from 'react-icons/fa';
import { registrarLog, EVENT_TYPES, generarDescripcionCambio } from '../utils/logging';
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

  // Estados para catálogo y edición in-place
  const [estadosVehiculosList, setEstadosVehiculosList] = useState([]);
  const [changingStatusFor, setChangingStatusFor] = useState(null);
  const [newStatusChoice, setNewStatusChoice] = useState('');

  useEffect(() => {
    if (orgId) {
      loadData();
      const ch = supabase.channel('rt_vehiculos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculo' }, loadData)
        .subscribe();
      return () => supabase.removeChannel(ch);
    }
  }, [orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setIsRefreshing(true);
    try {
      const { data: vhs } = await supabase
        .from('vehiculo')
        .select('*, modelo(nombre, marca(nombre)), color(nombre), persona(nombre, apellido)')
        .eq('organizacion_id', orgId)
        .not('id_persona', 'is', null)
        .order('created_at', { ascending: false });

      const [
        { data: catMarcas },
        { data: catModelos },
        { data: catColores },
        { data: catEst }
      ] = await Promise.all([
        supabase.from('marca').select('id_marca, nombre').order('nombre'),
        supabase.from('modelo').select('id_modelo, nombre, id_marca').order('nombre'),
        supabase.from('color').select('id_color, nombre').order('nombre'),
        supabase.from('estado_vehiculo').select('id_estado, nombre').order('id_estado')
      ]);

      // Personal del sistema (RPC optimizado)
      const { data: orgUsers } = await supabase.rpc('get_usuarios_org');
      const personal = (orgUsers || []).map(u => ({
        id_persona: u.id_persona,
        nombre: u.nombre,
        apellido: u.apellido,
        rol: u.tipo || 'Usuario'
      }));

      setVehiculos(vhs || []);
      setListaMarcas(catMarcas || []);
      setListaModelos(catModelos || []);
      setListaColores(catColores || []);
      setEstadosVehiculosList(catEst || []);
      setPersonasSistema(personal.sort((a,b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)));

    } catch (err) { console.error('Error cargando datos:', err); } finally { setIsRefreshing(false); }
  };

  // La función registrarLog local ha sido eliminada para usar la global importada.

  const handleVehiculoPersonalSubmit = async (e) => {
    e.preventDefault();
    if (!orgId) {
      return Swal.fire('Error', 'No se ha detectado el contexto de la organización. Por favor, recargue la página.', 'error');
    }
    if (!vehiculoPersonalForm.persona_id) return Swal.fire('Atención', 'Seleccione un propietario.', 'warning');
    const placaLimpia = vehiculoPersonalForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 7) return Swal.fire('Atención', 'La placa no debe superar los 7 caracteres (1 letra y 6 números).', 'warning');
    setLoading(true);
    try {
      const { error } = await supabase.from('vehiculo').insert([{
        id_persona: vehiculoPersonalForm.persona_id,
        placa: vehiculoPersonalForm.placa.toUpperCase(),
        id_modelo: vehiculoPersonalForm.id_modelo ? parseInt(vehiculoPersonalForm.id_modelo) : null,
        id_color: vehiculoPersonalForm.id_color ? parseInt(vehiculoPersonalForm.id_color) : null,
        id_estado: 1, // Por defecto Habilitado
        organizacion_id: orgId
      }]);
      if (error) throw error;
      Swal.fire('Registrado', 'Vehículo vinculado correctamente.', 'success');
      const p = personasSistema.find(p => p.id_persona === vehiculoPersonalForm.persona_id);
      
      registrarLog({
        tipo_nombre: EVENT_TYPES.VEHICULO_REGISTRADO,
        descripcion: `Vehículo ${vehiculoPersonalForm.placa.toUpperCase()} vinculado a: ${p?.nombre} ${p?.apellido}`,
        id_persona: currentPersonaId,
        organizacion_id: orgId,
        origen: 'Panel Web - Vehículos'
      });
      setVehiculoPersonalForm({ persona_id: '', placa: '', id_marca: '', id_modelo: '', id_color: '' });
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    setLoading(false);
  };

  const handleEditarVehiculo = async (e) => {
    e.preventDefault();
    const placaLimpia = editVehiculoForm.placa.replace(/[^A-Z0-9]/gi, '');
    if (placaLimpia.length > 7) return Swal.fire('Atención', 'La placa no debe superar los 7 caracteres (1 letra y 6 números).', 'warning');
    try {
      const { error, count } = await supabase.from('vehiculo').update(
        { placa: editVehiculoForm.placa.toUpperCase(), id_modelo: editVehiculoForm.id_modelo ? parseInt(editVehiculoForm.id_modelo) : null, id_color: editVehiculoForm.id_color ? parseInt(editVehiculoForm.id_color) : null },
        { count: 'exact' }
      ).eq('id_vehiculo', editandoVehiculo.id_vehiculo);
      if (error) throw error;
      Swal.fire('Actualizado', 'Datos actualizados correctamente.', 'success');
      
      const descCambios = generarDescripcionCambio(editandoVehiculo, editVehiculoForm, `Edición de datos vehículo placa ${editandoVehiculo.placa}`);
      
      registrarLog({
        tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
        descripcion: descCambios,
        id_persona: currentPersonaId,
        organizacion_id: orgId,
        origen: 'Panel Web - Vehículos'
      });
      setEditandoVehiculo(null);
      loadData();
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleConfirmarCambioEstado = async (vehiculo) => {
    if (!orgId) return;
    const oldStatus = vehiculo.id_estado;
    const nextStatus = parseInt(newStatusChoice);

    if (oldStatus === nextStatus) {
        setChangingStatusFor(null);
        return;
    }

    try {
        setLoading(true);
        const { error: upErr } = await supabase
            .from('vehiculo')
            .update({ id_estado: nextStatus })
            .eq('id_vehiculo', vehiculo.id_vehiculo);
        
        if (upErr) throw upErr;

        Swal.fire({
            title: 'Actualizado',
            text: 'Estado del vehículo actualizado correctamente.',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

        const estViejo = estadosVehiculosList.find(e => e.id_estado === oldStatus)?.nombre || oldStatus;
        const estNuevo = estadosVehiculosList.find(e => e.id_estado === nextStatus)?.nombre || nextStatus;

        registrarLog({
            tipo_nombre: EVENT_TYPES.CAMBIO_ESTADO,
            descripcion: `Estatus vehicular de ${vehiculo.placa} modificado: de "${estViejo}" a "${estNuevo}"`,
            id_persona: currentPersonaId,
            organizacion_id: orgId,
            origen: 'Panel Web - Vehículos'
        });
        setChangingStatusFor(null);
        loadData();
    } catch (error) {
        Swal.fire('Error', error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleEliminarVehiculo = async (vehiculo) => {
    // Soft Delete Moderno: Ahora simplemente lo inhabilitamos
    const result = await Swal.fire({ 
        title: '¿Inhabilitar vehículo?', 
        html: `La placa <b>${vehiculo.placa}</b> dejará de estar habilitada pero se conservará en el sistema.`, 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33', 
        confirmButtonText: 'Sí, inhabilitar' 
    });
    
    if (result.isConfirmed) {
        setNewStatusChoice('2'); // ID 2: Inhabilitado
        handleConfirmarCambioEstado({ ...vehiculo });
    }
  };

  return (
    <Layout>
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Flota de Vehículos</h2>
        <p className="text-gray-500 mt-1">Registro y gestión de vehículos del personal.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Formulario */}
        <section className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
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
              <label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (1 Letra + 6 Números)</label>
              <input
                className="w-full border-2 border-purple-200 rounded-lg p-2 font-mono uppercase tracking-widest text-center text-base mt-0.5"
                placeholder="L 010536" value={vehiculoPersonalForm.placa} maxLength={8}
                onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const letterMatch = val.match(/[A-Z]/); let nuevaPlaca = ''; if (letterMatch) { const letter = letterMatch[0]; const digits = val.replace(/[A-Z]/g, '').replace(/[^0-9]/g, '').slice(0, 6); nuevaPlaca = digits ? `${letter} ${digits}` : letter; } setVehiculoPersonalForm(f => ({ ...f, placa: nuevaPlaca })); }}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
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

        {/* Tabla flota */}
        <section className="lg:col-span-4 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b gap-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FaCar className="text-purple-600" /> Flota Registrada
              <div className="flex items-center gap-1.5 ml-2">
                <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  {vehiculos.filter(v => (v.id_estado || 1) === 1).length} Habilitados
                </span>
                <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  {vehiculos.length} Total
                </span>
              </div>
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
                  <th className="px-5 py-3 text-center">Estado</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vehiculos.filter(v => {
                    const matchName = `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`.toLowerCase().includes(searchFlota.toLowerCase());
                    const matchPlaca = (v.placa || '').toLowerCase().includes(searchFlota.toLowerCase());
                    return matchName || matchPlaca;
                }).length === 0
                  ? <tr><td colSpan="6" className="text-center py-10 text-gray-400">No hay vehículos que coincidan.</td></tr>
                  : vehiculos.filter(v => {
                        const matchName = `${v.persona?.nombre || ''} ${v.persona?.apellido || ''}`.toLowerCase().includes(searchFlota.toLowerCase());
                        const matchPlaca = (v.placa || '').toLowerCase().includes(searchFlota.toLowerCase());
                        return matchName || matchPlaca;
                  }).map(v => (
                    <tr key={v.id_vehiculo} className={`transition-all ${(v.id_estado || 1) !== 1 ? 'bg-gray-50/50 opacity-60 grayscale-[0.3]' : 'hover:bg-gray-50'}`}>
                      <td className="px-5 py-4 font-medium text-gray-800">
                        <div className="flex flex-col">
                            <span>{v.persona?.nombre} {v.persona?.apellido}</span>
                            {(v.id_estado || 1) !== 1 && <span className="text-[9px] font-bold text-gray-400 uppercase italic">Registro no operativo</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${(v.id_estado || 1) === 1 ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-300 text-gray-600'}`}>
                            {v.placa}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{[v.modelo?.marca?.nombre, v.modelo?.nombre, v.color?.nombre].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-5 py-4 text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString('es-DO')}</td>
                      
                      <td className="px-5 py-4 text-center">
                        {changingStatusFor === v.id_vehiculo ? (
                            <div className="flex items-center justify-center gap-1 animate-fadeIn">
                                <select 
                                    className="border border-purple-300 rounded-lg px-2 py-1.5 text-[10px] focus:ring-2 focus:ring-purple-200 focus:border-purple-500 outline-none transition-all cursor-pointer bg-white"
                                    value={newStatusChoice}
                                    onChange={e => setNewStatusChoice(e.target.value)}
                                >
                                    {estadosVehiculosList.map(e => (
                                        <option key={e.id_estado} value={e.id_estado}>{e.nombre}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => handleConfirmarCambioEstado(v)} 
                                    className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition shadow-sm"
                                    title="Confirmar"
                                >
                                    {loading ? <FaSync size={10} className="animate-spin" /> : <FaCheck size={10} />}
                                </button>
                                <button 
                                    onClick={() => setChangingStatusFor(null)} 
                                    className="p-1.5 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition"
                                    title="Cancelar"
                                >
                                    <FaTimes size={10} />
                                </button>
                            </div>
                        ) : (
                            <div 
                                className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-default ${
                                    (v.id_estado || 1) === 1 ? 'bg-green-100 text-green-700' :
                                    v.id_estado === 2 ? 'bg-red-100 text-red-700' :
                                    v.id_estado === 3 ? 'bg-orange-100 text-orange-700' :
                                    'bg-gray-100 text-gray-600'
                                }`}
                            >
                                {estadosVehiculosList.find(e => e.id_estado === (v.id_estado || 1))?.nombre || 'Indefinido'}
                            </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                              onClick={() => {
                                  setEditandoVehiculo(v);
                                  const idMarca = v.id_modelo ? listaModelos.find(m => m.id_modelo === v.id_modelo)?.id_marca : '';
                                  setEditVehiculoForm({ placa: v.placa, id_marca: idMarca || '', id_modelo: v.id_modelo || '', id_color: v.id_color || '' });
                              }}
                              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition"
                              title="Editar"
                          >
                              <FaEdit size={14} />
                          </button>
                          <button 
                            onClick={() => {
                                setChangingStatusFor(v.id_vehiculo);
                                setNewStatusChoice((v.id_estado || 1).toString());
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 text-[10px] font-bold transition flex items-center gap-1"
                            title="Cambiar Estado"
                          >
                            <FaSync size={10} /> <span>Estado</span>
                          </button>
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
                <label className="text-[10px] font-bold text-gray-400 uppercase">Placa * (1 Letra + 6 Números)</label>
                <input className="w-full border-2 border-purple-200 rounded-lg p-2 font-mono uppercase tracking-widest text-center text-base mt-0.5" placeholder="L 010536" value={editVehiculoForm.placa} maxLength={8} onChange={e => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const letterMatch = val.match(/[A-Z]/); let nuevaPlaca = ''; if (letterMatch) { const letter = letterMatch[0]; const digits = val.replace(/[A-Z]/g, '').replace(/[^0-9]/g, '').slice(0, 6); nuevaPlaca = digits ? `${letter} ${digits}` : letter; } setEditVehiculoForm(f => ({ ...f, placa: nuevaPlaca })); }} required />
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

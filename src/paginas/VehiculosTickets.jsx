

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Layout from '../componentes/Layout';
import Swal from 'sweetalert2';
import { 
  FaCar, FaTicketAlt, FaUserPlus, FaSearch, 
  FaSave, FaHistory, FaTrash, FaIdCard 
} from 'react-icons/fa';

export default function VehiculosTickets() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('visitantes'); // 'visitantes' o 'personal'
  
  // Listas de datos
  const [tickets, setTickets] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [personasSistema, setPersonasSistema] = useState([]); // Empleados/Regulares
  const [visitantesRegistrados, setVisitantesRegistrados] = useState([]);
  const [plazasLibres, setPlazasLibres] = useState([]);

  // Formulario Visitante Rápido
  const [visitanteForm, setVisitanteForm] = useState({
    id_persona: null, // Si se selecciona uno existente
    nombre: '', apellido: '', telefono: '', sexo: 'M',
    placa: '', marca: '', color: '',
    id_plaza: ''
  });

  // Formulario Vehículo Personal
  const [vehiculoPersonalForm, setVehiculoPersonalForm] = useState({
    persona_id: '', placa: '', marca: '', color: ''
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // 1. Cargar Plazas Libres
      const { data: plazas } = await supabase.from('plazas').select('*').eq('Estado_Actual', 'Libre');
      setPlazasLibres(plazas || []);

      // 2. Cargar Personas (Filtro por roles en la App)
      const { data: allPers } = await supabase.from('personas').select('*');
      const { data: allUsrs } = await supabase.from('usuarios').select('*, roles(Nombre_Rol)');
      
      const listaVisitantes = [];
      const listaPersonal = [];

      allUsrs?.forEach(u => {
        const p = allPers?.find(pers => pers.id === u.persona_id);
        if (p) {
          const data = { ...p, id_usuario: u.id, rol: u.roles?.Nombre_Rol };
          if (data.rol?.toLowerCase() === 'visitante') listaVisitantes.push(data);
          else listaPersonal.push(data);
        }
      });

      setVisitantesRegistrados(listaVisitantes);
      setPersonasSistema(listaPersonal);

      // 3. Cargar Tickets Activos
      const { data: tks } = await supabase.from('tickets').select('*, personas(nombre, apellido), plazas(Numero_Plaza)').eq('Estado', 'Activo');
      setTickets(tks || []);

      // 4. Cargar Vehículos registrados
      const { data: vhs } = await supabase.from('vehiculos').select('*, personas(nombre, apellido)');
      setVehiculos(vhs || []);

    } catch (error) { console.error("Error cargando datos:", error); }
  };

  // FLUJO 1: Registro rápido de Visitante + Vehículo + Ticket
  const handleVisitanteSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let personaId = visitanteForm.id_persona;

      // 1. Si la persona no existe, crear Persona y Usuario Visitante
      if (!personaId) {
        const { data: newP, error: pErr } = await supabase.from('personas').insert([{
          nombre: visitanteForm.nombre, apellido: visitanteForm.apellido,
          telefono: visitanteForm.telefono, sexo: visitanteForm.sexo
        }]).select().single();
        if (pErr) throw pErr;
        personaId = newP.id;

        // Buscar ID del rol visitante
        const { data: rolV } = await supabase.from('roles').select('Id_Rol').ilike('Nombre_Rol', 'visitante').single();
        await supabase.from('usuarios').insert([{ persona_id: personaId, rol_id: rolV.Id_Rol }]);
      }

      // 2. Buscar o crear Vehículo
      let { data: vehiculo } = await supabase.from('vehiculos').select('id').eq('placa', visitanteForm.placa.toUpperCase()).maybeSingle();
      
      if (!vehiculo) {
        const { data: newV, error: vErr } = await supabase.from('vehiculos').insert([{
          placa: visitanteForm.placa.toUpperCase(), Marca: visitanteForm.marca,
          Color: visitanteForm.color, persona_id: personaId
        }]).select().single();
        if (vErr) throw vErr;
        vehiculo = newV;
      }

      // 3. Crear Ticket
      const { error: tErr } = await supabase.from('tickets').insert([{
        Id_Vehiculo: vehiculo.id,
        Placa_Capturada: visitanteForm.placa.toUpperCase(),
        Id_Plaza_Asignada: visitanteForm.id_plaza,
        id_persona: personaId,
        Estado: 'Activo',
        Fecha_Hora_Emision: new Date().toISOString()
      }]);
      if (tErr) throw tErr;

      // 4. Actualizar Plaza a Ocupada
      await supabase.from('plazas').update({ Estado_Actual: 'Ocupada', id_estado: 2 }).eq('Id_Plaza', visitanteForm.id_plaza);

      Swal.fire('Éxito', 'Ticket emitido correctamente', 'success');
      setVisitanteForm({ nombre: '', apellido: '', telefono: '', sexo: 'M', placa: '', marca: '', color: '', id_plaza: '', id_persona: null });
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
    setLoading(false);
  };

  // FLUJO 2: Registrar vehículo permanente para Personal
  const handleVehiculoPersonalSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('vehiculos').insert([{
        persona_id: vehiculoPersonalForm.persona_id,
        placa: vehiculoPersonalForm.placa.toUpperCase(),
        Marca: vehiculoPersonalForm.marca,
        Color: vehiculoPersonalForm.color
      }]);
      if (error) throw error;
      Swal.fire('Registrado', 'Vehículo asociado al usuario', 'success');
      setVehiculoPersonalForm({ persona_id: '', placa: '', marca: '', color: '' });
      loadData();
    } catch (error) { Swal.fire('Error', error.message, 'error'); }
  };

  return (
    <Layout>
      <div className="mb-6 flex gap-4 border-b">
        <button onClick={() => setActiveTab('visitantes')} className={`pb-2 px-4 font-bold ${activeTab === 'visitantes' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>ENTRADA VISITANTES</button>
        <button onClick={() => setActiveTab('personal')} className={`pb-2 px-4 font-bold ${activeTab === 'personal' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-400'}`}>VEHÍCULOS PERSONAL</button>
      </div>

      {activeTab === 'visitantes' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulario de Entrada */}
          <section className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FaUserPlus className="text-blue-600"/> Ticket Visitante</h3>
            <form onSubmit={handleVisitanteSubmit} className="space-y-3">
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <label className="text-xs font-bold text-blue-800 uppercase">¿Ya está registrado?</label>
                <select 
                  className="w-full border p-2 rounded mt-1"
                  onChange={(e) => {
                    const v = visitantesRegistrados.find(vis => vis.id === e.target.value);
                    if (v) setVisitanteForm({ ...visitanteForm, id_persona: v.id, nombre: v.nombre, apellido: v.apellido, telefono: v.telefono, sexo: v.sexo });
                  }}
                >
                  <option value="">-- Nuevo Visitante --</option>
                  {visitantesRegistrados.map(v => <option key={v.id} value={v.id}>{v.nombre} {v.apellido}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nombre" value={visitanteForm.nombre} onChange={e => setVisitanteForm({...visitanteForm, nombre: e.target.value})} className="border p-2 rounded w-full" required disabled={!!visitanteForm.id_persona} />
                <input placeholder="Apellido" value={visitanteForm.apellido} onChange={e => setVisitanteForm({...visitanteForm, apellido: e.target.value})} className="border p-2 rounded w-full" required disabled={!!visitanteForm.id_persona} />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Placa" value={visitanteForm.placa} onChange={e => setVisitanteForm({...visitanteForm, placa: e.target.value})} className="border-2 border-blue-200 p-2 rounded w-full font-bold uppercase" required />
                <select className="border p-2 rounded w-full" value={visitanteForm.id_plaza} onChange={e => setVisitanteForm({...visitanteForm, id_plaza: e.target.value})} required>
                  <option value="">Plaza...</option>
                  {plazasLibres.map(p => <option key={p.Id_Plaza} value={p.Id_Plaza}>{p.Numero_Plaza}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Marca (Opcional)" value={visitanteForm.marca} onChange={e => setVisitanteForm({...visitanteForm, marca: e.target.value})} className="border p-2 rounded w-full" />
                <input placeholder="Color" value={visitanteForm.color} onChange={e => setVisitanteForm({...visitanteForm, color: e.target.value})} className="border p-2 rounded w-full" />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <FaTicketAlt /> {loading ? 'Procesando...' : 'EMITIR TICKET'}
              </button>
              {visitanteForm.id_persona && <button type="button" onClick={() => setVisitanteForm({...visitanteForm, id_persona: null})} className="w-full text-xs text-red-500 underline">Limpiar selección</button>}
            </form>
          </section>

          {/* Lista de Tickets Activos */}
          <section className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4">Visitantes en el Parqueo</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-3">Visitante</th>
                    <th className="p-3">Placa</th>
                    <th className="p-3">Plaza</th>
                    <th className="p-3">Hora Entrada</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.Id_Ticket} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{t.personas?.nombre} {t.personas?.apellido}</td>
                      <td className="p-3"><span className="bg-gray-800 text-white px-2 py-1 rounded font-mono">{t.Placa_Capturada}</span></td>
                      <td className="p-3 font-bold text-blue-600">{t.plazas?.Numero_Plaza}</td>
                      <td className="p-3 text-xs text-gray-500">{new Date(t.Fecha_Hora_Emision).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Registro Vehículo Personal */}
          <section className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FaCar className="text-purple-600"/> Registrar Vehículo Personal</h3>
            <form onSubmit={handleVehiculoPersonalSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Seleccionar Empleado / Usuario</label>
                <select 
                  className="w-full border p-2 rounded mt-1" 
                  value={vehiculoPersonalForm.persona_id} 
                  onChange={e => setVehiculoPersonalForm({...vehiculoPersonalForm, persona_id: e.target.value})}
                  required
                >
                  <option value="">-- Buscar Persona --</option>
                  {personasSistema.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido} ({p.rol})</option>)}
                </select>
              </div>
              <input placeholder="Placa" value={vehiculoPersonalForm.placa} onChange={e => setVehiculoPersonalForm({...vehiculoPersonalForm, placa: e.target.value})} className="w-full border p-2 rounded uppercase font-bold" required />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Marca" value={vehiculoPersonalForm.marca} onChange={e => setVehiculoPersonalForm({...vehiculoPersonalForm, marca: e.target.value})} className="border p-2 rounded w-full" />
                <input placeholder="Color" value={vehiculoPersonalForm.color} onChange={e => setVehiculoPersonalForm({...vehiculoPersonalForm, color: e.target.value})} className="border p-2 rounded w-full" />
              </div>
              <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition flex items-center justify-center gap-2">
                <FaSave /> VINCULAR VEHÍCULO
              </button>
            </form>
          </section>

          {/* Tabla de Vehículos Registrados */}
          <section className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border">
             <h3 className="text-xl font-bold mb-4">Flota Registrada</h3>
             <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-3">Dueño</th>
                    <th className="p-3">Vehículo</th>
                    <th className="p-3">Placa</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vehiculos.map(v => (
                    <tr key={v.id} className="border-b">
                      <td className="p-3">{v.personas?.nombre} {v.personas?.apellido}</td>
                      <td className="p-3 text-gray-500">{v.Marca} {v.Color}</td>
                      <td className="p-3 font-bold uppercase">{v.placa}</td>
                      <td className="p-3">
                         <button className="text-red-500"><FaTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </section>
        </div>
      )}
    </Layout>
  );
}


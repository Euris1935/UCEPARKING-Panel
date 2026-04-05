import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [orgId, setOrgId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // 1. Fetch user to id_persona mapping
      const { data: usr } = await supabase
        .from('usuarios')
        .select('id_persona')
        .eq('id', user.id)
        .single();
        
      if (!usr) { 
        console.warn('OrgContext: No persona found for user', user.id);
        setLoading(false); 
        return; 
      }

      console.log('OrgContext: Persona found', usr.id_persona);

      // 2. Fetch the actual organization for that persona
      const { data: emp } = await supabase
        .from('empleados')
        .select('organizacion_id')
        .eq('id_persona', usr.id_persona)
        .single();

      if (emp && emp.organizacion_id) {
        console.log('OrgContext: Org found', emp.organizacion_id);
        setOrgId(emp.organizacion_id);
        const { data: sus } = await supabase
          .from('suscripciones')
          .select('*, planes(*)')
          .eq('organizacion_id', emp.organizacion_id)
          .in('estado', ['Activa','Trial'])
          .maybeSingle();
        // sus.planes corresponds to the joined table
        if (sus && sus.planes) {
          setPlan(sus.planes);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <OrgContext.Provider value={{ orgId, plan, loadingOrg: loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);

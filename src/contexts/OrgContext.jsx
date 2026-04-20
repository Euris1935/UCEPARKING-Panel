import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const OrgContext = createContext(null);

export function OrgProvider({ children, user }) {
  const [orgId, setOrgId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      if (!user) { 
        setOrgId(null);
        setPlan(null);
        setLoading(false); 
        return; 
      }

      setLoading(true);
      try {
        // 1. Obtener organización directamente del perfil del usuario (pasado por prop)
        const { data: usr, error: usrErr } = await supabase
          .from('usuario')
          .select('id_persona, organizacion_id')
          .eq('id', user.id)
          .maybeSingle();

        if (usrErr) {
          console.error('OrgContext: Error fetching user record:', usrErr);
          setError('Error al conectar con el perfil de usuario.');
        } else if (!usr) {
          console.warn('OrgContext: No records found in "usuario" table for UID:', user.id);
          setError('No se encontró un registro de usuario vinculado a esta cuenta.');
        } else {
          console.log('OrgContext: User metadata found:', usr);
          setError(null);
        }

        const effectiveOrgId = usr?.organizacion_id || null;
        
        if (effectiveOrgId) {
          setOrgId(effectiveOrgId);
          
          // 2. Cargar detalles de suscripción y plan activo
          const { data: sus, error: susErr } = await supabase
            .from('suscripcion')
            .select('*, plan(*), estado_suscripcion!inner(nombre)')
            .eq('organizacion_id', effectiveOrgId)
            .in('estado_suscripcion.nombre', ['Activa', 'Trial'])
            .maybeSingle();

          if (susErr) {
            console.error('OrgContext: Error fetching subscription:', susErr);
          } else if (sus?.plan) {
            setPlan(sus.plan);
          }
        }
      } catch (err) {
        console.error('OrgContext Error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  return (
    <OrgContext.Provider value={{ orgId, plan, loadingOrg: loading, orgError: error }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);

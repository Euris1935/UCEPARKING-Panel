import { useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function TestConnection() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase
        .from('USUARIO')
        .select('*')

      console.log('DATA:', data)
      console.log('ERROR:', error)
    }

    test()
  }, [])

  return <h1>Probando conexión a Supabase...</h1>
}

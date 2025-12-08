import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qvidbkkrxiwcvletaqfp.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWRia2tyeGl3Y3ZsZXRhcWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjM1MjUsImV4cCI6MjA4MDY5OTUyNX0.GoLdf7fcyoTtl7-idGKY3aWkL7h3P7xs-1Qk7Lrgs7A'

export const supabase = createClient(supabaseUrl, supabaseKey)

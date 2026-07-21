/*
 * Configuracion publica de Supabase.
 *
 * SUPABASE_URL y SUPABASE_ANON_KEY son valores PUBLICOS por diseño: viajan
 * en el HTML/JS que llega al navegador de cualquier visitante, igual que
 * la URL de cualquier API publica. La seguridad real no depende de que
 * estos valores sean secretos, sino de las politicas de Row Level Security
 * y las funciones RPC definidas en supabase/schema.sql, que corren en el
 * servidor de Supabase. NUNCA pongas acá la "service_role key" (esa sí es
 * secreta y nunca debe salir del backend/dashboard).
 */
window.SUPABASE_CONFIG = {
  url: 'https://sicgohdvfqyhokcmbfcn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpY2dvaGR2ZnF5aG9rY21iZmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzExMjYsImV4cCI6MjEwMDE0NzEyNn0.qNLJuLiBJ7IOFGwOlR38uJVw4_syZn6fKdAgmdQuAnU',
};

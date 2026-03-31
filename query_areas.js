require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: areas, error } = await supabase.from('areas').select('*');
  const { data: roles } = await supabase.from('roles').select('*');
  console.log('Areas:', areas);
  console.log('Roles:', roles);
}
check();

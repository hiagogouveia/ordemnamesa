const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@ordemnamesa.com.br',
    password: 'Password123!',
  });
  console.log('Login:', data.session ? 'OK' : error);

  const { data: restData, error: restError } = await supabase
    .from('restaurant_users')
    .select(`
      restaurant_id,
      role,
      restaurants (
        id,
        name,
        logo_url,
        slug
      )
    `)
    .eq('active', true);

  console.log('Fetch:', JSON.stringify(restData, null, 2), restError);
}
test();

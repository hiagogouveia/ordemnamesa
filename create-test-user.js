const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function createTestAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Environment variables missing!');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('1. Criando usuário admin@ordemnamesa.com.br...');
  const { data: userAuth, error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@ordemnamesa.com.br',
    password: 'Password123!',
    email_confirm: true
  });

  let userId = null;

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('Usuário já existe, buscando ID...');
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users.users.find(u => u.email === 'admin@ordemnamesa.com.br');
      userId = user.id;
    } else {
      console.error('Erro ao criar usuário', authError);
      return;
    }
  } else {
    userId = userAuth.user.id;
    console.log('Usuário criado:', userId);
  }

  console.log('2. Buscando/Criando Restaurante de Teste...');
  let restId = null;
  const { data: extRest, error: extError } = await supabase.from('restaurants').select('*').limit(1).single();

  if (extRest) {
    restId = extRest.id;
    console.log('Restaurante existente encontrado:', restExt.name);
  } else {
    const { data: rest, error: restError } = await supabase
      .from('restaurants')
      .insert({ name: 'Restaurante Fictício NonProd', slug: 'ficticio-nonprod', owner_id: userId })
      .select()
      .single();
    if (restError) {
      console.error('Erro restaurante:', restError);
      return;
    }
    restId = rest.id;
  }

  console.log('3. Vinculando o usuário ao restaurante como Proprietário...');
  const { error: linkError } = await supabase
    .from('restaurant_users')
    .upsert({
      user_id: userId,
      restaurant_id: restId,
      role: 'owner',
      active: true
    });

  if (linkError) {
    console.error('Erro ao vincular permissão:', linkError);
  } else {
    console.log('✅ Usuário pronto para testes! Login: admin@ordemnamesa.com.br / Senha: Password123!');
  }
}

createTestAdmin();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    let { data: usersData } = await supabase.auth.admin.listUsers();
    let staffUser = usersData.users.find(u => u.email === 'funcionario@teste.com');

    if (!staffUser) {
        console.log('Criando...');
        const res = await supabase.auth.admin.createUser({
            email: 'funcionario@teste.com',
            password: 'Senha123!',
            email_confirm: true
        });
        staffUser = res.data.user;
    } else {
        await supabase.auth.admin.updateUserById(staffUser.id, { password: 'Senha123!' });
    }

    // Inserir na equipe
    const restId = 'f1f1dc6e-27bb-4d34-8f45-a129decce920';
    await supabase.from('restaurant_users').insert({
        user_id: staffUser.id,
        restaurant_id: restId,
        role: 'staff'
    }).catch(e => console.log('Ja vinculado'));

    console.log('Feito! ID Funcionario:', staffUser.id);
}
main();

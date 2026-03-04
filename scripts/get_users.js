require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log('--- ADMIN USERS ---');
    const { data: usersData, error } = await supabase.auth.admin.listUsers();
    if (error) { console.error(error); return; }

    let adminUser = usersData.users.find(u => u.email.includes('admin') || u.email.includes('teste'));
    if (!adminUser && usersData.users.length > 0) {
        adminUser = usersData.users[0]; // pick first user
    }
    console.log('ADMIN: ', adminUser ? adminUser.email : 'Nenhum user admin achado');

    console.log('\n--- CREATE STAFF ---');
    let staffUser = usersData.users.find(u => u.email === 'funcionario@teste.com');
    if (!staffUser) {
        const res = await supabase.auth.admin.createUser({
            email: 'funcionario@teste.com',
            password: 'Senha123!',
            email_confirm: true
        });
        staffUser = res.data.user;
        console.log('Staff User criado!', staffUser.email);
    } else {
        await supabase.auth.admin.updateUserById(staffUser.id, { password: 'Senha123!' });
        console.log('Senha do staff resetada para Senha123!');
    }

    // Now link restaurant
    const { data: employees } = await supabase.from('restaurant_employees').select('restaurant_id, role, user_id');
    const ownerEmp = employees.find(e => e.user_id === adminUser.id);

    if (ownerEmp) {
        const restId = ownerEmp.restaurant_id;
        try {
            await supabase.from('restaurant_employees').insert({
                user_id: staffUser.id,
                restaurant_id: restId,
                role: 'staff'
            });
            console.log('Staff vinculado ao restaurante do admin com sucesso!');
        } catch (e) {
            console.log('Staff já vinculado');
        }
    } else {
        console.log('Admin não possui restaurant_id no employees.');
    }

    console.log('========= DADOS =========');
    console.log('ADMIN LOGIN:', adminUser ? adminUser.email : '?');
    console.log('STAFF LOGIN: funcionario@teste.com');
    console.log('SENHA PADRÃO DE AMBOS:', 'Senha123!');
}

main();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    // 1. Get auth users
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error('Error listing users:', error);
        return;
    }

    console.log('--- ALL USERS ---');
    users.forEach(u => console.log(u.email));

    // 2. See restaurant_employees to see roles
    const { data: employees, error: empError } = await supabase
        .from('restaurant_employees')
        .select(`*, restaurants(name)`);

    if (empError) {
        console.error('Error getting employees:', empError);
        return;
    }

    console.log('\n--- EMPLOYEES ---');
    console.log(employees);

    // Let's create a staff user or look for one
    let staffUser = users.find(u => u.email === 'funcionario@teste.com');
    if (!staffUser) {
        console.log('Criando user staff...');
        const res = await supabase.auth.admin.createUser({
            email: 'funcionario@teste.com',
            password: 'Senha123!',
            email_confirm: true
        });
        staffUser = res.data.user;
        console.log('Staff User criado!', staffUser?.email);
    } else {
        // Reset password just in case
        await supabase.auth.admin.updateUserById(staffUser.id, { password: 'Senha123!' });
        console.log('Senha do staff resetada para Senha123!');
    }

    // Now make sure staffUser is in restaurant_employees with role 'staff'
    // Find restaurant ID of an owner/admin
    const ownerEmp = employees.find(e => e.role === 'owner' || e.role === 'manager');
    if (ownerEmp && staffUser) {
        const restId = ownerEmp.restaurant_id;
        console.log('Owner is at restaurant:', restId);

        const { data: existingStaffLink } = await supabase
            .from('restaurant_employees')
            .select('*')
            .eq('user_id', staffUser.id)
            .eq('restaurant_id', restId)
            .single();

        if (!existingStaffLink) {
            await supabase.from('restaurant_employees').insert({
                user_id: staffUser.id,
                restaurant_id: restId,
                role: 'staff'
            });
            console.log('Linked staff user to restaurant as staff!');
        } else {
            console.log('Staff user already linked to restaurant!');
        }

        // Output some owner details for the prompt
        const ownerUser = users.find(u => u.id === ownerEmp.user_id);
        console.log('\n=== CREDENCIAIS ===');
        console.log('ADMIN Email:', ownerUser?.email);
        console.log('STAFF Email:', staffUser.email, 'Senha: Senha123!');
    }
}

main();

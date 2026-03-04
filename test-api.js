const { createClient } = require('@supabase/supabase-js');

async function testApi() {
    console.log("Starting debug...");
    // Let's create a local test to POST to the real API using headers
    // Actually, I can just use the Supabase client directly to see if I can insert `category` locally.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const testRestId = "f05ca4fa-c6ff-4bd8-99e5-950eed1583ff"; // Just a random UUID but we need a real one
    
    // Let's fetch a real restaurant
    const {data: rest} = await supabase.from('restaurants').select('id, owner_id').limit(1).single();
    if (!rest) return console.log("no rest");
    
    console.log("Found rest", rest.id);
    
    // Insert checklist directly with category
    const { data: newChecklist, error } = await supabase
        .from('checklists')
        .insert({
            restaurant_id: rest.id,
            name: "Test API insertion",
            shift: "any",
            category: "Gerente",
            status: "draft",
            active: true,
            created_by: rest.owner_id
        })
        .select()
        .single();
        
    console.log("Insert result:", error || newChecklist);
}
testApi();

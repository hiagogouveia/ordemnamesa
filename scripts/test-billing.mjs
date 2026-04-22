#!/usr/bin/env node
// Test harness de billing. Cria 2 accounts via /api/signup, executa
// cenários A/B/C/D, faz cleanup. Exige dev server em 3008 + NONPROD.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
            const i = l.indexOf('=')
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
        }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const APP = 'http://localhost:3008'
if (!SUPABASE_URL.includes('mkwxulikizrfdupqpyrn')) {
    console.error('SEGURANÇA: .env.local não aponta para NONPROD. Abortando.')
    process.exit(1)
}
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })

const results = []
const stamp = Date.now()
const mark = (label, got, expect, extra) => {
    const ok = typeof expect === 'function' ? expect(got) : got === expect
    results.push({ label, got, expect, ok, extra })
    console.log(
        `${ok ? '✓' : '✗'} ${label} | got=${JSON.stringify(got)} expect=${
            typeof expect === 'function' ? expect.name || 'fn' : JSON.stringify(expect)
        }${!ok && extra ? ' body=' + JSON.stringify(extra).slice(0, 250) : ''}`,
    )
}

// CNPJs de teste (14 dígitos, validação só verifica comprimento)
const mkCnpj = (n) => String(n).padStart(14, '0')

async function signup(i, email, password, name) {
    const r = await fetch(`${APP}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nome_responsavel: `Owner ${i}`,
            email,
            senha: password,
            nome_fantasia: name,
            cnpj: mkCnpj(Date.now() + i),
            telefone: '11999990000',
            cep: '01310100',
            endereco: 'Av Paulista 1000',
        }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`signup ${email} ${r.status}: ${JSON.stringify(j)}`)
    // Buscar ids via SQL admin
    const { data: users } = await admin.auth.admin.listUsers()
    const uid = users.users.find((u) => u.email === email)?.id
    const { data: au } = await admin.from('account_users').select('account_id').eq('user_id', uid).single()
    const { data: rest } = await admin.from('restaurants').select('id').eq('account_id', au.account_id).single()
    return { uid, account_id: au.account_id, restaurant_id: rest.id }
}

async function login(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ email, password }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`login ${email} ${r.status}: ${JSON.stringify(j)}`)
    return j.access_token
}

const req = async (method, path, token, body) => {
    const headers = { Authorization: `Bearer ${token}` }
    if (body) headers['Content-Type'] = 'application/json'
    const r = await fetch(`${APP}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch { json = { _raw: text } }
    return { status: r.status, body: json }
}

// ── SETUP ────────────────────────────────────────────────
console.log(`\n[SETUP] stamp=${stamp}`)
const A = { email: `billing-a-${stamp}@example.com`, pwd: `TestPwd!${stamp}`, name: `Billing A ${stamp}` }
const B = { email: `billing-b-${stamp}@example.com`, pwd: `TestPwd!${stamp}`, name: `Billing B ${stamp}` }

const ctxA = await signup(1, A.email, A.pwd, A.name)
const ctxB = await signup(2, B.email, B.pwd, B.name)
console.log(`A account=${ctxA.account_id} restaurant=${ctxA.restaurant_id} uid=${ctxA.uid}`)
console.log(`B account=${ctxB.account_id} restaurant=${ctxB.restaurant_id} uid=${ctxB.uid}`)

// Validação do setup (Fase 3)
const { data: subs } = await admin
    .from('subscriptions')
    .select('account_id, status, block_task_exec_on_past_due, plan:plans(code, max_units, max_managers, max_staff_per_unit)')
    .in('account_id', [ctxA.account_id, ctxB.account_id])
mark('SETUP Fase3: 2 subs criadas pelo signup', subs?.length, 2)
mark('SETUP Fase3: subA status=trial', subs?.find(s => s.account_id === ctxA.account_id)?.status, 'trial')
mark('SETUP Fase3: plano A.code=A', subs?.find(s => s.account_id === ctxA.account_id)?.plan?.code, 'A')
mark('SETUP Fase3: flag block default=false', subs?.find(s => s.account_id === ctxA.account_id)?.block_task_exec_on_past_due, false)

const tokenA = await login(A.email, A.pwd)
const tokenB = await login(B.email, B.pwd)

// ── A) SEGURANÇA ────────────────────────────────────────
console.log('\n[A] Segurança cross-account em /api/billing/status')

{
    const r = await req('GET', '/api/billing/status', tokenA)
    mark('A1 own billing 200', r.status, 200, r.body)
    mark('A1 retorna accountA', r.body.account_id, ctxA.account_id)
    mark('A1 status=trial', r.body.subscription?.status, 'trial')
    mark('A1 can_create_resources=true', r.body.access?.can_create_resources, true)
}

// Vincular A como owner em accountB também → usuário com 2 accounts
await admin.from('account_users').insert({
    account_id: ctxB.account_id, user_id: ctxA.uid, role: 'owner', active: true,
})
{
    const r = await req('GET', '/api/billing/status', tokenA)
    mark('A2 multi-account SEM param → 400', r.status, 400, r.body)
}
{
    const r = await req('GET', `/api/billing/status?account_id=${ctxB.account_id}`, tokenA)
    mark('A3 param válido → 200', r.status, 200, r.body)
    mark('A3 retorna accountB', r.body.account_id, ctxB.account_id)
}
{
    const r = await req('GET', `/api/billing/status?account_id=00000000-0000-0000-0000-000000000000`, tokenA)
    mark('A4 param de account alheia → 403', r.status, 403, r.body)
}
{
    const r = await req('GET', `/api/billing/status`, tokenA, undefined)
    const r2 = await fetch(`${APP}/api/billing/status`, {
        headers: { Authorization: `Bearer ${tokenA}`, 'x-account-id': ctxB.account_id },
    })
    const body = await r2.json()
    mark('A5 header x-account-id válido → 200', r2.status, 200, body)
    mark('A5 retorna accountB via header', body.account_id, ctxB.account_id)
    void r
}
// Limpar vínculo extra
await admin.from('account_users').delete().eq('account_id', ctxB.account_id).eq('user_id', ctxA.uid)

// ── B) PAST_DUE ─────────────────────────────────────────
console.log('\n[B] past_due')
await admin.from('subscriptions').update({ status: 'past_due' }).eq('account_id', ctxA.account_id)

{
    const r = await req('GET', `/api/dashboard?restaurant_id=${ctxA.restaurant_id}`, tokenA)
    mark('B1 GET dashboard em past_due → 2xx', r.status, (s) => s >= 200 && s < 300, r.body)
}
{
    const r = await req('GET', '/api/billing/status', tokenA)
    mark('B2 status=past_due', r.body.subscription?.status, 'past_due')
    mark('B2 can_create_resources=false', r.body.access?.can_create_resources, false)
    mark('B2 can_execute_tasks=true (flag default false)', r.body.access?.can_execute_tasks, true)
}
{
    const r = await req('POST', '/api/areas', tokenA, { restaurant_id: ctxA.restaurant_id, name: 'Area X' })
    mark('B3 POST /api/areas em past_due → 402', r.status, 402, r.body)
    mark('B3 reason=past_due_blocks_writes', r.body.reason, 'past_due_blocks_writes')
}

// Criar area + checklist via admin para testar assume (area_id é NOT NULL)
const { data: areaRow, error: areaErr } = await admin
    .from('areas')
    .insert({
        restaurant_id: ctxA.restaurant_id,
        name: 'Area exec teste',
        priority_mode: 'manual',
    })
    .select()
    .single()
if (areaErr || !areaRow) throw new Error('Falha ao criar area teste: ' + JSON.stringify(areaErr))

const { data: chk, error: chkErr } = await admin
    .from('checklists')
    .insert({
        restaurant_id: ctxA.restaurant_id,
        area_id: areaRow.id,
        name: 'Chk exec',
        shift: 'morning',
        status: 'active',
        is_required: true,
        recurrence: 'daily',
        active: true,
        target_role: 'all',
        assignment_type: 'all',
        created_by: ctxA.uid,
    })
    .select()
    .single()
if (chkErr || !chk) throw new Error('Falha ao criar checklist teste: ' + JSON.stringify(chkErr))

// past_due + flag=false → execução permitida
{
    const r = await req('POST', `/api/checklists/${chk.id}/assume`, tokenA, { restaurant_id: ctxA.restaurant_id })
    mark('B4 assume past_due + flag=false → 2xx', r.status, (s) => s >= 200 && s < 300, r.body)
}
// Limpar assumption para próximo teste
await admin.from('checklist_assumptions').delete().eq('checklist_id', chk.id)

// past_due + flag=true → bloqueia execução
await admin.from('subscriptions').update({ block_task_exec_on_past_due: true }).eq('account_id', ctxA.account_id)
{
    const r = await req('POST', `/api/checklists/${chk.id}/assume`, tokenA, { restaurant_id: ctxA.restaurant_id })
    mark('B5 assume past_due + flag=true → 402', r.status, 402, r.body)
    mark('B5 reason=past_due_blocks_execution', r.body.reason, 'past_due_blocks_execution')
}

// ── C) CANCELED ─────────────────────────────────────────
console.log('\n[C] canceled')
await admin
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), block_task_exec_on_past_due: false })
    .eq('account_id', ctxA.account_id)

{
    const t = await login(A.email, A.pwd).catch(() => null)
    mark('C1 login em canceled funciona', typeof t === 'string' && t.length > 20, true)
}
{
    const r = await req('GET', `/api/dashboard?restaurant_id=${ctxA.restaurant_id}`, tokenA)
    mark('C2 GET dashboard em canceled → 2xx', r.status, (s) => s >= 200 && s < 300, r.body)
}
{
    const r = await req('GET', '/api/billing/status', tokenA)
    mark('C3 status=canceled', r.body.subscription?.status, 'canceled')
    mark('C3 can_access_app=true', r.body.access?.can_access_app, true)
    mark('C3 can_create_resources=false', r.body.access?.can_create_resources, false)
    mark('C3 can_execute_tasks=false', r.body.access?.can_execute_tasks, false)
}
{
    const r = await req('POST', '/api/areas', tokenA, { restaurant_id: ctxA.restaurant_id, name: 'Y' })
    mark('C4 POST /api/areas em canceled → 402', r.status, 402, r.body)
    mark('C4 reason=canceled', r.body.reason, 'canceled')
}
await admin.from('checklist_assumptions').delete().eq('checklist_id', chk.id)
{
    const r = await req('POST', `/api/checklists/${chk.id}/assume`, tokenA, { restaurant_id: ctxA.restaurant_id })
    mark('C5 assume em canceled → 402', r.status, 402, r.body)
    mark('C5 reason=canceled', r.body.reason, 'canceled')
}

// ── D) LIMITES (account B continua trial Plano A: 1/1/6) ───
console.log('\n[D] Limites Plano A')

{
    const r = await req('POST', '/api/units', tokenB, { account_id: ctxB.account_id, name: 'Segunda unidade' })
    mark('D1 POST /api/units 2ª → 402', r.status, 402, r.body)
    mark('D1 reason=limit_reached', r.body.reason, 'limit_reached')
    mark('D1 limit_type=units', r.body.limit_type, 'units')
    mark('D1 limit=1', r.body.limit, 1)
}

// 1º manager: permitido. 2º: 402.
{
    const r = await req('POST', '/api/equipe', tokenB, {
        restaurant_id: ctxB.restaurant_id,
        name: 'Manager1',
        email: `mgr1-${stamp}@example.com`,
        password: 'MgrPwd123!',
        role: 'manager',
    })
    mark('D2 1º manager → 2xx', r.status, (s) => s >= 200 && s < 300, r.body)
}
{
    const r = await req('POST', '/api/equipe', tokenB, {
        restaurant_id: ctxB.restaurant_id,
        name: 'Manager2',
        email: `mgr2-${stamp}@example.com`,
        password: 'MgrPwd123!',
        role: 'manager',
    })
    mark('D2 2º manager → 402', r.status, 402, r.body)
    mark('D2 reason=limit_reached', r.body.reason, 'limit_reached')
    mark('D2 limit_type=managers', r.body.limit_type, 'managers')
}

// 6 staff (ok), 7º (402)
let staffOk = 0
for (let i = 1; i <= 6; i++) {
    const r = await req('POST', '/api/equipe', tokenB, {
        restaurant_id: ctxB.restaurant_id,
        name: `Staff${i}`,
        email: `staff-${stamp}-${i}@example.com`,
        password: 'StaffPwd123!',
        role: 'staff',
    })
    if (r.status >= 200 && r.status < 300) staffOk++
    else console.log(`    staff${i} inesperado: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
}
mark('D3 6 staff criados', staffOk, 6)
{
    const r = await req('POST', '/api/equipe', tokenB, {
        restaurant_id: ctxB.restaurant_id,
        name: 'Staff7',
        email: `staff-${stamp}-7@example.com`,
        password: 'StaffPwd123!',
        role: 'staff',
    })
    mark('D3 7º staff → 402', r.status, 402, r.body)
    mark('D3 reason=limit_reached', r.body.reason, 'limit_reached')
    mark('D3 limit_type=staff_per_unit', r.body.limit_type, 'staff_per_unit')
    mark('D3 limit=6', r.body.limit, 6)
}

// ── CLEANUP ─────────────────────────────────────────────
console.log('\n[CLEANUP]')
const cleanup = async (accountId) => {
    const { data: rs } = await admin.from('restaurants').select('id').eq('account_id', accountId)
    const ids = (rs ?? []).map((r) => r.id)
    if (ids.length) {
        for (const tbl of ['restaurant_users','checklist_assumptions','checklist_tasks','checklists','areas','shifts','roles']) {
            await admin.from(tbl).delete().in('restaurant_id', ids).then(() => {}, () => {})
        }
        await admin.from('restaurants').delete().in('id', ids)
    }
    await admin.from('subscriptions').delete().eq('account_id', accountId)
    await admin.from('account_users').delete().eq('account_id', accountId)
    await admin.from('accounts').delete().eq('id', accountId)
}
await cleanup(ctxA.account_id)
await cleanup(ctxB.account_id)

// delete auth users criados (pelo signup + equipe)
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
for (const u of users.users ?? []) {
    if (u.email && (u.email.endsWith(`${stamp}@example.com`) || u.email.includes(`-${stamp}@example.com`) || u.email.includes(`-${stamp}-`))) {
        await admin.auth.admin.deleteUser(u.id)
    }
}

// ── REPORT ──────────────────────────────────────────────
const fail = results.filter((r) => !r.ok)
console.log(`\n===== RESULT =====\nTotal: ${results.length} | PASS: ${results.length - fail.length} | FAIL: ${fail.length}`)
if (fail.length) {
    console.log('\nFALHAS:')
    for (const f of fail) {
        const expStr = typeof f.expect === 'function' ? f.expect.name || 'fn' : JSON.stringify(f.expect)
        console.log(`  ✗ ${f.label} | got=${JSON.stringify(f.got)} expect=${expStr}${f.extra ? ' body=' + JSON.stringify(f.extra).slice(0, 300) : ''}`)
    }
}
process.exit(fail.length ? 1 : 0)

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Resolve o usuário autenticado de forma resiliente a falhas TRANSITÓRIAS do
 * endpoint de Auth do Supabase.
 *
 * `supabase.auth.getUser()` faz um round-trip ao GoTrue e parseia a resposta como
 * JSON. Quando essa resposta vem vazia (hiccup de rede / 5xx do Auth), o parse
 * lança `SyntaxError: Unexpected end of JSON input` e — sem tratamento — o
 * middleware respondia 500 na rota inteira (no Safari isso surge como "Load
 * failed", inclusive em requisições RSC/prefetch).
 *
 * Estratégia: pequena tentativa adicional para absorver o transitório. Se ainda
 * assim não resolver, retorna `null` (fail-closed) — rotas protegidas redirecionam
 * para /login, NUNCA 500. O erro é logado (não mascarado silenciosamente).
 */
async function resolveUser(supabase: SupabaseClient) {
    const MAX_ATTEMPTS = 3
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            return user
        } catch (err) {
            if (attempt === MAX_ATTEMPTS) {
                console.error('[middleware] getUser falhou após retries (fail-closed):', err)
                return null
            }
            // Backoff curto antes de tentar de novo (absorve resposta vazia transitória).
            await new Promise((resolve) => setTimeout(resolve, 120))
        }
    }
    return null
}

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const user = await resolveUser(supabase)

    // ===== admin-leads-control-hub: painel isolado =====
    const PANEL_BASE_PATH = '/control-hub-admin'
    if (request.nextUrl.pathname.startsWith(PANEL_BASE_PATH)) {
        const isLogin = request.nextUrl.pathname.startsWith(`${PANEL_BASE_PATH}/login`)
        if (isLogin) return supabaseResponse
        if (!user) {
            return NextResponse.redirect(new URL(`${PANEL_BASE_PATH}/login`, request.url))
        }
        return supabaseResponse
    }

    // ===== /qualificacao é público (form de lead) =====
    if (request.nextUrl.pathname === '/qualificacao') {
        return supabaseResponse
    }

    // ===== /demo é público (walkthrough isolado, sem auth, sem queries reais) =====
    if (request.nextUrl.pathname === '/demo' || request.nextUrl.pathname.startsWith('/demo/')) {
        return supabaseResponse
    }

    const publicRoutes = ['/', '/login', '/cadastro', '/signup', '/forgot-password', '/reset-password']
    // Rotas de marketing/SEO públicas — precisam ser acessíveis a crawlers
    // (Google, GPTBot, ClaudeBot etc.) sem autenticação.
    const publicPrefixes = ['/blog', '/modelos', '/comparativos', '/execucao-operacional', '/sobre']
    const isPublicRoute =
        publicRoutes.includes(request.nextUrl.pathname) ||
        publicPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))

    // Redirect to login if unauthenticated user tries to access a protected route
    if (!user && !isPublicRoute && !request.nextUrl.pathname.startsWith('/api')) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Redirect to /selecionar-restaurante if authenticated user tries to access /login or /cadastro
    if (user && ['/login', '/cadastro', '/signup'].includes(request.nextUrl.pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/selecionar-restaurante'
        return NextResponse.redirect(url)
    }

    // Redirect logged-in user away from Root
    if (user && request.nextUrl.pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/selecionar-restaurante'
        return NextResponse.redirect(url)
    }

    // Exigir restaurant selecionado para rotas autenticadas
    // Middleware SÓ valida acesso — pages decidem navegação
    const pathnameForContextCheck = request.nextUrl.pathname
    const skipsContextCheck =
        pathnameForContextCheck === '/selecionar-account' ||
        pathnameForContextCheck === '/selecionar-restaurante' ||
        pathnameForContextCheck.startsWith('/api') ||
        publicPrefixes.some((prefix) => pathnameForContextCheck.startsWith(prefix)) ||
        pathnameForContextCheck === '/login' ||
        pathnameForContextCheck === '/cadastro' ||
        pathnameForContextCheck === '/signup'

    if (user && !skipsContextCheck) {
        const restaurantId = request.cookies.get('x-restaurant-id')?.value
        const restaurantMode = request.cookies.get('x-restaurant-mode')?.value

        // Cookie de mode é apenas UX (evita redirect) — autorização real
        // é feita em cada API route via resolveGlobalScope / canUseGlobal.
        if (!restaurantId && restaurantMode !== 'global') {
            const url = request.nextUrl.clone()
            url.pathname = '/selecionar-restaurante'
            return NextResponse.redirect(url)
        }
    }

    // Proteção de rotas por role
    // Rotas exclusivas de admin (owner/manager) — staff é bloqueado
    const adminRoutes = ['/dashboard', '/equipe', '/checklists', '/recebimentos', '/configuracoes', '/relatorios', '/admin']
    const pathname = request.nextUrl.pathname
    const isAdminRoute = adminRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))

    if (user && isAdminRoute) {
        // Autorização server-side: a role NÃO vem mais do cookie x-restaurant-role
        // (que o cliente podia forjar via document.cookie). Resolvemos a role real
        // a partir de restaurant_users para o usuário autenticado. RLS garante que
        // ele só enxerga os próprios vínculos (policy user_id = auth.uid()).
        const restaurantId = request.cookies.get('x-restaurant-id')?.value
        const restaurantMode = request.cookies.get('x-restaurant-mode')?.value

        let roleQuery = supabase
            .from('restaurant_users')
            .select('role')
            .eq('user_id', user.id)
            .eq('active', true)
            .neq('role', 'staff')
            .limit(1)

        // Em modo single, exige owner/manager no restaurante ativo; em modo global,
        // basta ser owner/manager em alguma unidade (o escopo fino é validado nas APIs).
        if (restaurantMode !== 'global' && restaurantId) {
            roleQuery = roleQuery.eq('restaurant_id', restaurantId)
        }

        const { data: adminMembership } = await roleQuery.maybeSingle()

        if (!adminMembership) {
            const url = request.nextUrl.clone()
            url.pathname = '/turno'
            return NextResponse.redirect(url)
        }
    }

    // Limpar cookie de role ao fazer logout (rota de signout)
    // O cookie é limpo automaticamente quando o usuário vai para /login sem restaurante selecionado

    return supabaseResponse
}

export const config = {
    matcher: [
        // Exclui assets e arquivos de SEO/metadata (robots, sitemap, manifest,
        // opengraph-image, ícones) para que crawlers consigam buscá-los sem
        // serem redirecionados para /login pelo middleware de auth.
        '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt|webmanifest)$).*)',
    ],
}

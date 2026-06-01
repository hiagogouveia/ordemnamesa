import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

    const {
        data: { user },
    } = await supabase.auth.getUser()

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
    const publicPrefixes = ['/blog', '/modelos', '/comparativos', '/execucao-operacional']
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
        const userRole = request.cookies.get('x-restaurant-role')?.value
        if (userRole === 'staff') {
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

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const requestUrl = new URL(request.url)
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            cookieStore.set(name, value, options as any)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )

    await supabase.auth.signOut()

    const response = NextResponse.redirect(`${requestUrl.origin}/login`, {
        status: 301,
    })

    // Limpar cookies de contexto ao fazer logout
    response.cookies.set('x-restaurant-role', '', { path: '/', maxAge: 0 })
    response.cookies.set('x-restaurant-id', '', { path: '/', maxAge: 0 })
    response.cookies.set('x-restaurant-name', '', { path: '/', maxAge: 0 })
    response.cookies.set('x-restaurant-slug', '', { path: '/', maxAge: 0 })
    response.cookies.set('x-account-id', '', { path: '/', maxAge: 0 })
    response.cookies.set('x-account-name', '', { path: '/', maxAge: 0 })

    return response
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { AppLayout } from "@/components/layout/app-layout";
import { SessionProvider } from "@/lib/providers/session-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

async function ensureAccountActive() {
    const cookieStore = await cookies();
    const accountId = cookieStore.get("x-account-id")?.value;
    const restaurantId = cookieStore.get("x-restaurant-id")?.value;
    if (!accountId && !restaurantId) return;

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() {
                    /* read-only context */
                },
            },
        }
    );

    let isActive: boolean | null = null;
    if (accountId) {
        const { data } = await supabase
            .from("accounts")
            .select("active")
            .eq("id", accountId)
            .maybeSingle<{ active: boolean }>();
        if (data) isActive = data.active;
    }
    if (isActive === null && restaurantId) {
        const { data } = await supabase
            .from("restaurants")
            .select("accounts(active)")
            .eq("id", restaurantId)
            .maybeSingle<{ accounts: { active: boolean } | null }>();
        if (data?.accounts) isActive = data.accounts.active;
    }

    if (isActive === false) redirect("/conta-suspensa");
}

export default async function AppInternalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await ensureAccountActive();

    return (
        <SessionProvider>
            <AppLayout>{children}</AppLayout>
        </SessionProvider>
    );
}

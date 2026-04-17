import type { Metadata } from "next";
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

export default function AppInternalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SessionProvider>
            <AppLayout>{children}</AppLayout>
        </SessionProvider>
    );
}

import { AppLayout } from "@/components/layout/app-layout";

export default function AppInternalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AppLayout>{children}</AppLayout>;
}

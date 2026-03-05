import { AdminNav } from "@/components/layout/AdminNav";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-background-light dark:bg-[#101d22]">
            <AdminNav />
            {/* Main Content Area */}
            <main className="flex-1 w-full pt-16 md:pl-64 flex flex-col min-h-screen transition-all">
                <div className="flex-1 w-full p-4 sm:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

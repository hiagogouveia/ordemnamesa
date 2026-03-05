import { ColaboradorNav } from "@/components/layout/ColaboradorNav";

export default function ColaboradorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-background-light dark:bg-background-dark">
            <ColaboradorNav />
            {/* Main Content Area - Responsive padding */}
            <main className="flex-1 w-full pb-16 pt-16 md:pb-0 md:pt-0 md:pl-64 flex flex-col min-h-screen">
                <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

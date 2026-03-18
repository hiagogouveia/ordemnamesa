import Image from "next/image";

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
}

export function Logo({ className, width = 48, height = 48 }: LogoProps) {
    return (
        <div className={`relative flex items-center shrink-0 ${className}`}>
            <Image
                src="/logo-icon.png"
                alt="Ordem na Mesa Logo"
                width={width}
                height={height}
                className="object-contain"
            />
        </div>
    );
}

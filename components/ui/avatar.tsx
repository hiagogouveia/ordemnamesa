import Image from 'next/image';

interface AvatarProps {
    src:       string | null | undefined;
    name:      string;
    size?:     number;          // px — padrão 40
    className?: string;         // classes extras no container
    border?:   string;          // classe de borda opcional (ex: 'border-primary')
}

/**
 * Avatar com lazy load via next/image.
 * Quando não há URL, exibe a inicial do nome sobre fundo #233f48.
 */
export function Avatar({ src, name, size = 40, className = '', border = '' }: AvatarProps) {
    const fontSize = Math.max(10, Math.round(size * 0.35));

    if (src) {
        return (
            <div
                className={`relative rounded-full overflow-hidden shrink-0 border ${border || 'border-transparent'} ${className}`}
                style={{ width: size, height: size }}
            >
                <Image
                    src={src}
                    alt={name}
                    fill
                    sizes={`${size}px`}
                    className="object-cover"
                />
            </div>
        );
    }

    return (
        <div
            className={`rounded-full shrink-0 flex items-center justify-center bg-[#233f48] text-white font-bold border ${border || 'border-transparent'} ${className}`}
            style={{ width: size, height: size, fontSize }}
        >
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

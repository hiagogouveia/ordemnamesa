import React, { ButtonHTMLAttributes, ReactNode } from 'react';

interface AsyncButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    isPending?: boolean;
    loadingLabel?: string;
    /** Material symbol name (ex: 'block', 'check_circle'). Trocado por spinner quando isPending. */
    icon?: string;
    iconClassName?: string;
    children: ReactNode;
}

export function AsyncButton({
    isPending = false,
    loadingLabel,
    icon,
    iconClassName,
    children,
    className,
    disabled,
    onClick,
    type = 'button',
    ...rest
}: AsyncButtonProps) {
    const isDisabled = disabled || isPending;
    const label = isPending && loadingLabel ? loadingLabel : children;

    return (
        <button
            type={type}
            disabled={isDisabled}
            aria-busy={isPending || undefined}
            aria-disabled={isDisabled || undefined}
            onClick={(e) => {
                if (isDisabled) return;
                onClick?.(e);
            }}
            className={`${className ?? ''} disabled:opacity-60 disabled:cursor-not-allowed`}
            {...rest}
        >
            {isPending ? (
                <span className={`material-symbols-outlined animate-spin ${iconClassName ?? ''}`}>progress_activity</span>
            ) : (
                icon ? <span className={`material-symbols-outlined ${iconClassName ?? ''}`}>{icon}</span> : null
            )}
            {label}
        </button>
    );
}

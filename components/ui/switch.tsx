"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">;

/** Toggle on/off acessível (checkbox estilizado). Dark theme do Control Hub. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
    { className = "", checked, disabled, ...rest },
    ref
) {
    return (
        <label
            className={`relative inline-flex items-center align-middle ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
        >
            <input
                ref={ref}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className="peer sr-only"
                {...rest}
            />
            <span
                className="h-6 w-11 rounded-full bg-[#325a67] transition-colors duration-200 ease-out
                    peer-checked:bg-[#13b6ec]
                    peer-focus-visible:ring-2 peer-focus-visible:ring-[#13b6ec]/60 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#0a1215]"
            />
            <span
                className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm
                    transition-transform duration-200 ease-out peer-checked:translate-x-5"
            />
        </label>
    );
});

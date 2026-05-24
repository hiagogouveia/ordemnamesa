"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    indeterminate?: boolean;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
    { className = "", indeterminate, checked, disabled, ...rest },
    ref
) {
    return (
        <span
            className={`relative inline-flex items-center justify-center align-middle ${disabled ? "opacity-50" : ""}`}
        >
            <input
                ref={(el) => {
                    if (el) el.indeterminate = !!indeterminate;
                    if (typeof ref === "function") ref(el);
                    else if (ref) ref.current = el;
                }}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className={`peer appearance-none size-[18px] rounded-[5px] border border-[#325a67] bg-[#0a1215]
                    transition-all duration-150 ease-out cursor-pointer
                    hover:border-[#13b6ec] hover:bg-[#13b6ec]/5
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a1215]
                    checked:bg-[#13b6ec] checked:border-[#13b6ec]
                    checked:shadow-[0_0_0_3px_rgba(19,182,236,0.12)]
                    disabled:cursor-not-allowed
                    ${className}`}
                {...rest}
            />
            <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="pointer-events-none absolute size-[12px] text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
            >
                <path
                    d="M3.5 8.5L6.5 11.5L12.5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
            {indeterminate && (
                <span className="pointer-events-none absolute h-[2px] w-[10px] rounded-full bg-white" />
            )}
        </span>
    );
});

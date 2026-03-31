"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  disabled,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const isActive = Boolean(value);

  const toggleDropdown = () => {
    if (disabled || !buttonRef.current) return;
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 160),
    });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const buttonLabel = isActive && selectedOption
    ? `${label}: ${selectedOption.label}`
    : label;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        disabled={disabled}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isActive
            ? "bg-[#13b6ec]/15 border-[#13b6ec]/40 text-[#13b6ec]"
            : "bg-[#16262c] border-[#233f48] text-[#92bbc9] hover:border-[#13b6ec]/40 hover:text-white",
        ].join(" ")}
      >
        <span>{buttonLabel}</span>
        <span
          className={[
            "material-symbols-outlined text-base transition-transform duration-150",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          style={{ fontSize: "16px" }}
        >
          expand_more
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              minWidth: position.width,
              zIndex: 9999,
            }}
            className="bg-[#16262c] border border-[#233f48] rounded-lg shadow-xl py-1 overflow-hidden"
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={[
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  option.value === value
                    ? "bg-[#13b6ec]/15 text-[#13b6ec]"
                    : "text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white",
                ].join(" ")}
              >
                {option.label}
                {option.value === value && (
                  <span
                    className="material-symbols-outlined float-right text-[#13b6ec]"
                    style={{ fontSize: "14px" }}
                  >
                    check
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

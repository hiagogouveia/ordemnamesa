"use client";

import { useId, type ReactNode } from "react";

interface IphoneMockupProps {
    children: ReactNode;
}

/**
 * SVG dimensions: viewBox="0 0 390 844"
 * Phone body: x=0 y=0 w=390 h=844 rx=55
 * Screen area: x=10 y=15 w=370 h=815 rx=42
 *
 * Content div absolute positioning (% of container):
 *   top:    15/844  = 1.78%
 *   left:   10/390  = 2.56%
 *   right:  10/390  = 2.56%
 *   bottom: 14/844  = 1.66%   (844 - 830 = 14)
 *   border-radius: 11.35% / 5.15%  (42/370, 42/815)
 *
 * Dynamic Island: x=133 y=21 w=124 h=37
 *   Covers 43px from top of screen → spacer = h-14 (56px) is safe clearance
 */
export function IphoneMockup({ children }: IphoneMockupProps) {
    const id = useId();
    const maskId = `iphone-mask-${id}`;
    const gradId = `iphone-grad-${id}`;
    const shineId = `iphone-shine-${id}`;

    return (
        <>
            {/* ─── Mobile: plain content, no mockup ─── */}
            <div className="md:hidden w-full">
                {children}
            </div>

            {/* ─── Desktop: realistic iPhone frame ─── */}
            <div
                className="hidden md:block relative mx-auto"
                style={{
                    width: "100%",
                    maxWidth: "360px",
                    filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(255,255,255,0.08))",
                }}
            >
                {/* Screen content — behind SVG frame */}
                <div
                    className="absolute bg-[#101d22] flex flex-col overflow-hidden"
                    style={{
                        top: "1.78%",
                        left: "2.56%",
                        right: "2.56%",
                        bottom: "1.66%",
                        borderRadius: "11.35% / 5.15%",
                    }}
                >
                    {/* Dynamic Island clearance (≈56px at 360px width) */}
                    <div className="shrink-0 h-14" />

                    {/* Scrollable app content */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        {children}
                    </div>
                </div>

                {/* iPhone SVG frame — on top, non-interactive */}
                <svg
                    viewBox="0 0 390 844"
                    xmlns="http://www.w3.org/2000/svg"
                    className="relative block w-full pointer-events-none"
                    aria-hidden="true"
                >
                    <defs>
                        {/* Mask: phone body shape minus screen cutout */}
                        <mask id={maskId}>
                            <rect width="390" height="844" rx="55" ry="55" fill="white" />
                            <rect x="10" y="15" width="370" height="815" rx="42" ry="42" fill="black" />
                        </mask>

                        {/* Frame base gradient — dark titanium */}
                        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#6e6e73" />
                            <stop offset="40%" stopColor="#48484a" />
                            <stop offset="100%" stopColor="#2c2c2e" />
                        </linearGradient>

                        {/* Subtle shine overlay */}
                        <linearGradient id={shineId} x1="0" y1="0" x2="0.5" y2="1">
                            <stop offset="0%" stopColor="white" stopOpacity="0.18" />
                            <stop offset="55%" stopColor="white" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* ── Bezel ── */}
                    <rect
                        width="390" height="844"
                        rx="55" ry="55"
                        fill={`url(#${gradId})`}
                        mask={`url(#${maskId})`}
                    />
                    <rect
                        width="390" height="844"
                        rx="55" ry="55"
                        fill={`url(#${shineId})`}
                        mask={`url(#${maskId})`}
                    />

                    {/* Outer edge line */}
                    <rect
                        width="390" height="844"
                        rx="55" ry="55"
                        fill="none"
                        stroke="#767676"
                        strokeWidth="0.8"
                    />

                    {/* Screen inner border */}
                    <rect
                        x="10" y="15"
                        width="370" height="815"
                        rx="42" ry="42"
                        fill="none"
                        stroke="#111"
                        strokeWidth="1"
                    />

                    {/* ── Dynamic Island ── */}
                    <rect
                        x="133" y="21"
                        width="124" height="37"
                        rx="18.5" ry="18.5"
                        fill="#1a1a1a"
                    />
                    {/* Camera lens */}
                    <circle cx="237" cy="39.5" r="5.5" fill="#0d0d0d" />
                    <circle cx="237" cy="39.5" r="2.5" fill="#1a1a1a" opacity="0.6" />

                    {/* ── Home indicator ── */}
                    <rect
                        x="143" y="818"
                        width="104" height="5"
                        rx="2.5" ry="2.5"
                        fill="white" fillOpacity="0.28"
                    />

                    {/* ── Left side buttons (within bezel) ── */}
                    {/* Silent toggle */}
                    <rect x="1" y="134" width="3.5" height="28" rx="1.75" fill="#555" />
                    {/* Volume up */}
                    <rect x="1" y="176" width="3.5" height="60" rx="1.75" fill="#555" />
                    {/* Volume down */}
                    <rect x="1" y="250" width="3.5" height="60" rx="1.75" fill="#555" />

                    {/* ── Right side — power button ── */}
                    <rect x="385.5" y="196" width="3.5" height="82" rx="1.75" fill="#555" />
                </svg>
            </div>
        </>
    );
}

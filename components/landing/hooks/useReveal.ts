"use client";

import { useEffect, useRef, useState } from "react";

interface UseRevealOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.05,
  rootMargin = "0px 0px 15% 0px",
}: UseRevealOptions = {}) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin }
    );

    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible } as const;
}

'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/**
 * Sonner picks a theme of its own unless told, which means the server and the
 * client can disagree about what it renders. Reading the resolved theme here
 * keeps both sides on the same answer.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      richColors
      closeButton
      position="bottom-right"
      theme={(resolvedTheme as 'light' | 'dark') ?? 'light'}
    />
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a phone number for WhatsApp/Baileys.
 * Strips all non-digits, then normalizes Indian (+91) numbers:
 * - 10-digit Indian mobile → prepend 91
 * - 11-digit starting with 0 → strip leading 0 → treat as 10-digit → prepend 91
 * - 12-digit starting with 91 → already in international format
 * - 11-digit starting with 91 → already has country code (keep as-is)
 * - Anything else → return raw digits (server/Baileys will handle)
 */
export function formatWhatsAppPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');

  // 10-digit Indian number → add 91 country code
  if (clean.length === 10) return `91${clean}`;

  // 12-digit starting with 91 → already in international format (e.g. 919876543210)
  if (clean.length === 12 && clean.startsWith('91')) return clean;

  // 11-digit starting with 0 → strip leading 0, treat as 10-digit Indian number
  if (clean.length === 11 && clean.startsWith('0')) return `91${clean.slice(1)}`;

  // 11-digit starting with 91 → already has country code (edge case)
  if (clean.length === 11 && clean.startsWith('91')) return clean;

  // Anything else → return raw digits
  return clean;
}

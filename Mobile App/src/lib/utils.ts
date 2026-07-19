/**
 * Format a date as a relative time string (e.g., "3m ago", "2h ago", "5d ago")
 */
export const formatRelativeTime = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'Just now';
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

export const formatCurrency = (n: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

export const formatWhatsAppPhone = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) return `91${clean}`;
  if (clean.length === 12 && clean.startsWith('91')) return clean;
  if (clean.length === 11 && clean.startsWith('0')) return `91${clean.slice(1)}`;
  if (clean.length === 11 && clean.startsWith('91')) return clean;
  return clean;
};

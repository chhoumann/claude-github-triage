/**
 * Format a date as relative time (e.g., "2d ago", "1w ago", "3mo ago")
 * Returns a compact string suitable for table display
 */
export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return "—";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return "just now";
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else if (diffWeeks < 5) {
      return `${diffWeeks}w ago`;
    } else if (diffMonths < 12) {
      return `${diffMonths}mo ago`;
    } else {
      return `${diffYears}y ago`;
    }
  } catch {
    return "—";
  }
}

/**
 * Format a date as a compact absolute date (e.g., "Oct 11" or "Jan 2024")
 * Returns a short string suitable for table display
 */
export function formatCompactDate(dateString: string | undefined): string {
  if (!dateString) return "—";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();

    const month = date.toLocaleString('en', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();

    if (sameYear) {
      return `${month} ${day}`;
    } else {
      return `${month} ${year}`;
    }
  } catch {
    return "—";
  }
}

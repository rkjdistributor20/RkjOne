/** Cutoff order: 1 hari sebelum production, jam 10 malam (MYT) */

export function formatOrderCutoff(cutoffAt: string): string {
 return new Date(cutoffAt).toLocaleString('ms-MY', {
 weekday: 'short',
 day: 'numeric',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 timeZone: 'Asia/Kuala_Lumpur',
 });
}

export function getOrderWindowCountdown(cutoffAt: string): string | null {
 const ms = new Date(cutoffAt).getTime() - Date.now();
 if (ms <= 0) return null;
 const hours = Math.floor(ms / 3600000);
 const mins = Math.floor((ms % 3600000) / 60000);
 if (hours >= 24) {
 const days = Math.floor(hours / 24);
 return `${days} hari ${hours % 24} jam lagi`;
 }
 return `${hours}j ${mins}m lagi`;
}

export function isCutoffPassed(cutoffAt: string): boolean {
 return Date.now() >= new Date(cutoffAt).getTime();
}

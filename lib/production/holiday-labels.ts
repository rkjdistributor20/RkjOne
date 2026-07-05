/** Label jenis cuti Malaysia untuk paparan HQ */
export const MALAYSIA_HOLIDAY_TYPE_LABELS: Record<string, string> = {
 CUTI_UMUM: 'Cuti Umum',
 CUTI_NEGERI: 'Cuti Negeri',
 CUTI_SEKOLAH: 'Cuti Sekolah',
 CUTI_FESTIF: 'Cuti Festif',
 CUTI_BALIK_KAMPUNG: 'Balik Kampung',
};

export function formatHolidayType(type: string): string {
 return MALAYSIA_HOLIDAY_TYPE_LABELS[type] ?? type;
}

export function formatHolidayDate(iso: string): string {
 const d = new Date(iso + 'T12:00:00');
 return d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
}

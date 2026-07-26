import type { Metadata } from 'next';
import { UserManualCenter } from '@/components/manual/user-manual-center';

export const metadata: Metadata = {
 title: 'Panduan Pengguna | RKJ One',
 description: 'Manual sistem, tanggungjawab dan SOP kerja pengguna RKJ One.',
};

export default function ManualPage() {
 return <UserManualCenter />;
}

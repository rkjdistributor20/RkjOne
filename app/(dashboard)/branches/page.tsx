import { redirect } from 'next/navigation';

/** Cawangan diurus dalam Tetapan — elak pautan 404 dari sidebar */
export default function BranchesRedirectPage() {
  redirect('/settings?tab=branches');
}

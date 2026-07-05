import { permanentRedirect } from 'next/navigation';

/** Alias lama - halaman inventori AM kini di /inventory (server pilih komponen) */
export default function LegacyAreaInventoryRedirect() {
 permanentRedirect('/inventory');
}

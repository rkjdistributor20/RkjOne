import { profileNeedsAvatar } from '@/lib/profile/requirements';

export type ProfileCompletionField = {
  key: string;
  label: string;
  complete: boolean;
  required: boolean;
};

export type ProfileCompletion = {
  percent: number;
  complete: boolean;
  fields: ProfileCompletionField[];
  missingRequired: string[];
};

type ProfileRow = {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  ic_number?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

function filled(v: string | null | undefined) {
  return Boolean(v?.trim());
}

export function computeProfileCompletion(row: ProfileRow): ProfileCompletion {
  const fields: ProfileCompletionField[] = [
    { key: 'full_name', label: 'Nama penuh', complete: filled(row.full_name), required: true },
    { key: 'phone', label: 'No. telefon', complete: filled(row.phone), required: true },
    { key: 'avatar', label: 'Gambar profil', complete: !profileNeedsAvatar({ avatar_url: row.avatar_url ?? null }), required: false },
    { key: 'ic_number', label: 'No. IC / Passport', complete: filled(row.ic_number), required: true },
    { key: 'date_of_birth', label: 'Tarikh lahir', complete: filled(row.date_of_birth), required: true },
    { key: 'gender', label: 'Jantina', complete: filled(row.gender), required: true },
    { key: 'nationality', label: 'Warganegara', complete: filled(row.nationality), required: true },
    { key: 'address', label: 'Alamat', complete: filled(row.address_line1), required: true },
    { key: 'city', label: 'Bandar', complete: filled(row.city), required: true },
    { key: 'state', label: 'Negeri', complete: filled(row.state), required: true },
    { key: 'postcode', label: 'Poskod', complete: filled(row.postcode), required: true },
    {
      key: 'emergency',
      label: 'Hubungan kecemasan',
      complete: filled(row.emergency_contact_name) && filled(row.emergency_contact_phone),
      required: true,
    },
  ];

  const requiredFields = fields.filter((f) => f.required);
  const doneRequired = requiredFields.filter((f) => f.complete).length;
  const percent = Math.round((doneRequired / requiredFields.length) * 100);
  const missingRequired = requiredFields.filter((f) => !f.complete).map((f) => f.label);

  return {
    percent,
    complete: missingRequired.length === 0,
    fields,
    missingRequired,
  };
}

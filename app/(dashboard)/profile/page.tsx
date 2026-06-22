import { Suspense } from 'react';
import { ProfileSettingsForm } from '@/components/profile/profile-settings-form';

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          Memuatkan profil…
        </div>
      }
    >
      <ProfileSettingsForm />
    </Suspense>
  );
}

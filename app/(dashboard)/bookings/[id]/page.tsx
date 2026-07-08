import { BookingDetailPage } from '@/components/bookings/booking-detail-page';

type PageProps = {
 params: Promise<{ id: string }>;
};

export default async function BookingDetailRoute({ params }: PageProps) {
 const { id } = await params;
 return <BookingDetailPage bookingId={id} />;
}

import { redirect } from 'next/navigation';

export default function OldExceptionPage({ params }: { params: { id: string } }) {
  redirect(`/exceptions?exception=${params.id}`);
}

import { redirect } from 'next/navigation';

export default async function OldExceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/exceptions?exception=${id}`);
}

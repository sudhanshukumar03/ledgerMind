import { redirect } from 'next/navigation';

export default function ExceptionRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/exceptions?exception=${params.id}`);
}

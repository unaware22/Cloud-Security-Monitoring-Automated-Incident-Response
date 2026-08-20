import { redirect } from 'next/navigation';

interface Props {
  params: { slug: string };
}

export default async function ProductDetailPage({ params }: Props) {
  // Direct Buy-Now flow straight to the high-converting checkout page
  redirect(`/checkout/${params.slug}`);
}

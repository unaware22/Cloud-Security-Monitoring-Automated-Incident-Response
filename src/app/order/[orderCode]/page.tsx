import { redirect } from 'next/navigation';

export default function OrderRedirectPage({ params }: { params: { orderCode: string } }) {
  redirect(`/order/success/${params.orderCode}`);
}

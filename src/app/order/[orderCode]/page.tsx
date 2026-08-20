import { redirect } from 'next/navigation';

export default function OrderRedirectPage({ params }: { params: { orderCode: string } }) {
  redirect(`/check-order?order_code=${params.orderCode}`);
}

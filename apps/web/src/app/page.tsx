import { redirect } from 'next/navigation';
import { HOME } from '@/lib/route-guard';

export default function IndexPage(): never {
  redirect(HOME);
}

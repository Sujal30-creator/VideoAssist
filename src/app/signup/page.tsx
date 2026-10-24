import { redirect } from 'next/navigation';

export default function SignUpPage() {
  // Redirect to /login which contains the integrated tabbed sign-up interface
  redirect('/login');
}

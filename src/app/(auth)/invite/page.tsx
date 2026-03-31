import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { acceptInvitation } from "@/app/(dashboard)/dashboard/actions";
import { Logo } from "@/components/logo";
import Link from "next/link";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?invite_token=${encodeURIComponent(token)}`);
  }

  const result = await acceptInvitation(token);

  if (!result.error) {
    redirect("/dashboard");
  }

  // Email mismatch: sign out and redirect to login with the invite token
  // so the user can sign in with the correct account
  if (result.error === "email_mismatch") {
    await supabase.auth.signOut();
    redirect(`/login?invite_token=${encodeURIComponent(token)}`);
  }

  // Show error state for other errors
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-[400px] rounded-3xl border border-[#3a3a3c] bg-[#1c1c1e] p-10">
        <div className="text-center mb-6">
          <Logo size="lg" className="mb-1" />
        </div>
        <div className="text-center space-y-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10">
            <span className="text-red-400 text-lg">!</span>
          </div>
          <h2 className="text-[16px] font-semibold text-white">
            Invitation Error
          </h2>
          <p className="text-[13px] text-[#aeaeb2]">{result.error}</p>
          <Link
            href="/dashboard"
            className="inline-block mt-4 rounded-xl bg-white text-[#1c1c1e] px-6 py-2.5 text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

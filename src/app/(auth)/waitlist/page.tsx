import { createClient } from "@/lib/supabase/server";
import { Clock } from "lucide-react";

import { redirect } from "next/navigation";

export default async function WaitlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: approved } = await supabase.rpc("is_approved");
  if (approved) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-[400px] rounded-3xl border border-[#3a3a3c] bg-[#1c1c1e] p-10 text-center">
        <Clock className="mx-auto h-8 w-8 text-[#8e8e93] mb-4" />
        <h1 className="text-[20px] font-semibold mb-2">You&apos;re on the list</h1>
        <p className="text-[13px] text-[#aeaeb2] mb-6">
          Thanks for signing up, {user.user_metadata?.full_name || user.email}.
          We&apos;ll notify you when your account is approved.
        </p>
        <p className="text-[11px] text-[#8e8e93]">DaPipe is in early access.</p>
      </div>
    </div>
  );
}

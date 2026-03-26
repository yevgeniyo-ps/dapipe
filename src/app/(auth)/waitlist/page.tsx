import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock } from "lucide-react";
import { redirect } from "next/navigation";

export default async function WaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If already approved, go to dashboard
  const { data: approved } = await supabase.rpc("is_approved");
  if (approved) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/10">
            <Clock className="h-6 w-6 text-yellow-500" />
          </div>
          <CardTitle className="text-2xl">You&apos;re on the list</CardTitle>
          <CardDescription>
            Thanks for signing up, {user.user_metadata?.full_name || user.email}!
            We&apos;ll notify you when your account is approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            DaPipe is in early access. We&apos;re onboarding organizations
            gradually to ensure a great experience.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

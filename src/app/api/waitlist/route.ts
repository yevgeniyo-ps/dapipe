import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { WaitlistRequest } from "@/lib/types/api";

export async function POST(request: Request) {
  try {
    const body: WaitlistRequest = await request.json();

    if (!body.email || !body.email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from("waitlist").upsert(
      {
        email: body.email.toLowerCase().trim(),
        company: body.company || null,
        use_case: body.use_case || null,
      },
      { onConflict: "email" }
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to join waitlist" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

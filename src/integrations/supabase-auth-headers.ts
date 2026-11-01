import { supabase } from "@/integrations/client";

export async function getSupabaseAuthHeaders(): Promise<HeadersInit> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(
      `Could not read the Supabase sign-in session: ${error.message}`,
    );
  }
  if (!data.session?.access_token) {
    throw new Error(
      "Sign in to VroomLink before opening this protected workspace.",
    );
  }

  return { Authorization: `Bearer ${data.session.access_token}` };
}

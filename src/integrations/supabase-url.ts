export function normalizeSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Invalid Supabase URL. Use the project URL root, such as https://<project-ref>.supabase.co, without /auth/v1 or /rest/v1.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      "Supabase URL must use HTTPS (HTTP is allowed for local development).",
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      "Supabase URL must not include a query string or fragment.",
    );
  }

  url.pathname = url.pathname
    .replace(/\/(?:auth|rest)\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  return url.toString().replace(/\/+$/, "");
}

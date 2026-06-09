"use server";

import { AuthError } from "next-auth";
import { signIn, signOut, credentialsSchema } from "./auth";

export type LoginState = { error?: string };

/** Server action for the login form (useActionState). */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Validate at the boundary with the same schema the provider re-checks server-side.
  const parsed = credentialsSchema.safeParse({
    mobile: formData.get("mobile"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your mobile number and password." };
  }
  const { mobile, password } = parsed.data;

  try {
    await signIn("credentials", { mobile, password, redirectTo: "/dashboard" });
    return {};
  } catch (error) {
    // signIn throws a redirect on success — rethrow it; only swallow auth errors.
    if (error instanceof AuthError) {
      return { error: "Invalid mobile number or password." };
    }
    throw error;
  }
}

/**
 * Clear the session WITHOUT redirecting. The redirect throws a NEXT_REDIRECT
 * control-flow signal which a client try/catch would swallow; instead the caller
 * (SignOutButton) navigates to /login after this resolves.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
}

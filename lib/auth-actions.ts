"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "./auth";

export type LoginState = { error?: string };

/** Server action for the login form (useActionState). */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const mobile = String(formData.get("mobile") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!mobile || !password) {
    return { error: "Enter your mobile number and password." };
  }

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

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

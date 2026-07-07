"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Indtast en gyldig emailadresse." };
  }
  if (!password) {
    return { error: "Udfyld din adgangskode." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Forkert email eller adgangskode." };
  }

  // admin_users-medlemskab tjekkes i (protected)/layout.tsx — hvis brugeren
  // ikke er admin, bliver de sendt tilbage hertil med en fejlbesked derfra.
  redirect("/freelancers");
}

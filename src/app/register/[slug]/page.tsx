import { getCurrentProfile } from "@/lib/auth/session";
import {
  loadAdminRegistrationPreview,
  loadPublicRegistrationForm,
} from "@/lib/registration/actions";
import {
  PublicRegistrationForm,
  RegistrationClosed,
} from "@/components/registration/PublicRegistrationForm";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const previewRequested = query.preview === "1";
  const { profile } = await getCurrentProfile();
  const isAdminPreview = previewRequested && profile?.role === "admin";

  const form = isAdminPreview
    ? ((await loadAdminRegistrationPreview(slug)) ?? (await loadPublicRegistrationForm(slug)))
    : await loadPublicRegistrationForm(slug);

  if (!form || (form.status !== "active" && !isAdminPreview)) {
    return <RegistrationClosed />;
  }

  return <PublicRegistrationForm form={form} preview={isAdminPreview} />;
}

export const metadata = {
  title: "Student registration",
};

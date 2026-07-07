// Auth-cookien skal deles på tværs af alle *.pepo.team-subdomæner (Pepo
// selv, alle kundevirksomheder og admin.pepo.team), så én login-session
// virker overalt. Lokalt (localhost) sættes intet domæne — browsere
// afviser en "Domain"-attribut på localhost, og *.localhost virker fint
// uden den, fordi det allerede er samme browserprofil.
export function cookieDomainOptions(): { domain?: string } {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "pepo.team";
  if (process.env.NODE_ENV !== "production") return {};
  return { domain: `.${rootDomain}` };
}

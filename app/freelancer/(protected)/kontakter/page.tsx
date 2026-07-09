import { createClient } from "@/lib/supabase/server";
import { getPrimaryCompany } from "@/lib/freelancer";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * MVP-version: viser kontaktoplysninger på virksomheden, freelanceren
 * arbejder for. Kunde-/venue-kontakter for konkrete vagter vises allerede
 * på Vagtplan-siden under den enkelte vagt — denne side er tænkt som det
 * generelle "hvem kontakter jeg, hvis noget går galt"-sted, og kan
 * udbygges med en liste over kolleger/andre kontakter senere.
 */
export default async function FreelancerKontakterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const company = await getPrimaryCompany(user.id);
  const { data: companyDetails } = company
    ? await supabase
        .from("companies")
        .select("name, contact_person, contact_phone, contact_email")
        .eq("id", company.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="px-5 pt-4 pb-6">
      <div className="text-[20px] font-bold text-pepo-t1 mb-4 pepo-rise">Kontakter</div>

      <div className="bg-pepo-wh border border-pepo-bd rounded-[14px] p-4 pepo-rise">
        <div className="text-[11.5px] font-semibold text-pepo-t3 uppercase tracking-wide mb-2">
          {companyDetails?.name ?? company?.name ?? "Virksomheden"}
        </div>
        {companyDetails?.contact_person && (
          <div className="text-[14px] font-medium text-pepo-t1">{companyDetails.contact_person}</div>
        )}
        <div className="flex flex-col gap-2 mt-3">
          {companyDetails?.contact_phone && (
            <a href={`tel:${companyDetails.contact_phone}`} className="flex items-center gap-2.5 text-[13px] text-pepo-p font-medium">
              <Icon name="phone" size={16} />
              {companyDetails.contact_phone}
            </a>
          )}
          {companyDetails?.contact_email && (
            <a href={`mailto:${companyDetails.contact_email}`} className="flex items-center gap-2.5 text-[13px] text-pepo-p font-medium">
              <Icon name="mail" size={16} />
              {companyDetails.contact_email}
            </a>
          )}
          {!companyDetails?.contact_phone && !companyDetails?.contact_email && (
            <div className="text-[13px] text-pepo-t3">Ingen kontaktoplysninger tilføjet endnu.</div>
          )}
        </div>
      </div>

      <div className="text-[12.5px] text-pepo-t3 text-center mt-4">
        Kontaktoplysninger på kunder og mødesteder finder du under den enkelte vagt på Vagtplan.
      </div>
    </div>
  );
}

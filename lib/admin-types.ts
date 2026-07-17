export type ApplicationStatus = "pending" | "approved" | "rejected";

// En priskategori ejer timelønnen — én eller flere jobfunktioner kan tilhøre
// den samme priskategori og dermed dele løn. En jobfunktion uden groupId (se
// CategoryListItem.groupId) vises samlet under "Ikke tildelt priskategori".
export type CategoryGroupListItem = {
  id: string;
  name: string;
  clientRatePerHour: number;
  freelancerRatePerHour: number;
};

export type CategoryListItem = {
  id: string;
  name: string;
  freelancerCount: number;
  groupId: string | null;
  icon: string | null;
};

export type ClientListItem = {
  id: string;
  name: string | null; // firmanavn — tom for privatkunder
  cvrNumber: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: string;
  // En kunde kan have flere fysiske arbejdssteder (venues) — det er IKKE
  // nødvendigvis det samme som kundens fakturerings-/kontaktadresse.
  venues: VenueItem[];
};

export type FreelancerListItem = {
  id: string;
  fullName: string;
  gender: string | null;
  birthDate: string; // ISO date
  location: string | null;
  phone: string;
  email: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  socialMediaUrl: string | null;
  applicationStatus: ApplicationStatus;
  appliedAt: string; // ISO timestamp
  lastActiveAt: string | null; // ISO date, kun kalenderdag — se lastActiveLabel i lib/format.ts
  categories: { id: string; name: string; icon: string | null }[];
  hasLicense: boolean;
};

export type ShiftStatus = "open" | "for_resale" | "assigned" | "cancelled";
export type InterestStatus = "pending" | "accepted" | "declined";

export type VenueItem = {
  id: string;
  clientId: string;
  name: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
};

export type ShiftInterestItem = {
  freelancerId: string;
  freelancerName: string;
  status: InterestStatus;
};

export type ShiftListItem = {
  id: string;
  eventId: string;
  categoryId: string;
  category: string; // jobfunktionens navn
  categoryIcon: string | null; // jobfunktionens ikon (Tabler-navn)
  shiftDate: string; // ISO dato — denormaliseret kopi af eventets dato
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  status: ShiftStatus;
  previousStatus: ShiftStatus | null; // til "fortryd sletning"
  assignedFreelancerId: string | null;
  assignedFreelancerName: string | null;
  interests: ShiftInterestItem[];
  // Stempel-ur-data til Vagtdetaljer ("Stemplet ind"/"Stemplet ud"-felterne,
  // kun vist når vagten er startet). `clockEntryId` er null, hvis
  // freelanceren aldrig har stemplet ind på vagten — admin kan i så fald
  // stadig udfylde tiderne manuelt, hvilket opretter en ny time_clock_entries-
  // række i stedet for at opdatere en eksisterende (se updateShiftClockTimes).
  clockEntryId: string | null;
  clockedInAt: string | null; // ISO-timestamp
  clockedOutAt: string | null; // ISO-timestamp
};

export type EventAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
};

export type EventListItem = {
  id: string;
  title: string;
  eventDate: string; // ISO dato
  description: string | null;
  clientId: string;
  clientName: string;
  venueId: string | null;
  venueLabel: string | null; // fx "Havnelokale — Islands Brygge 26, 2300 København S"
  attachments: EventAttachment[];
  shifts: ShiftListItem[];
  // Køreafstand fra virksomhedens adresse til eventets venue (cached på
  // client_venues.distance_from_company_km) — vist for sig selv ("Afstand:
  // X km.") ud over selve transporttillægget, så admin kan se grundlaget
  // for beløbet. `null` hvis venuens adresse endnu ikke er geokodet.
  venueDistanceKm: number | null;
  // Transporttillæg: venueDistanceKm × virksomhedens kr./km-takst × antal
  // tildelte freelancere på eventet. `null` hvis venuens adresse endnu ikke
  // er geokodet (fx ingen adresse angivet, eller opslaget hos Google
  // fejlede) — vis da ingenting i stedet for et forkert 0 kr.
  transportSurchargeKr: number | null;
};

export type ClientOption = {
  id: string;
  name: string | null; // firmanavn — tom for privatkunder
  cvrNumber: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  venues: VenueItem[];
};

export type CategoryOption = {
  id: string;
  name: string;
  icon?: string | null;
};

export type FreelancerOption = {
  id: string;
  fullName: string;
  categories: string[];
};

export type DashboardEventRole = {
  category: string;
  assigned: number;
  open: number;
  forResale: number;
};

export type DashboardEventItem = {
  id: string;
  title: string;
  eventDate: string; // ISO dato
  roles: DashboardEventRole[];
  /**
   * Summeret over eventets ikke-annullerede vagter (samme beregning som
   * monthlyFinancials, se lib/dashboard.ts) — bruges af "Senest afviklede
   * events" på Dashboard til at vise et lille økonomisk overblik pr. event
   * i stedet for jobfunktions-badges.
   */
  hours: number;
  revenue: number;
  expense: number;
};

export type MonthlyFinancials = { revenue: number; expense: number };

export type MessageRecipientItem = {
  freelancerId: string;
  freelancerName: string;
  read: boolean;
};

export type MessageListItem = {
  id: string;
  subject: string;
  body: string;
  sentToAll: boolean;
  targetCategoryId: string | null;
  targetCategoryName: string | null;
  sentAt: string; // ISO
  senderName: string | null;
  recipients: MessageRecipientItem[];
};

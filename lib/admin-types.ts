export type ApplicationStatus = "pending" | "approved" | "rejected";

export type CategoryListItem = {
  id: string;
  name: string;
  freelancerCount: number;
  clientRatePerHour: number;
  freelancerRatePerHour: number;
};

export type ClientListItem = {
  id: string;
  name: string | null; // firmanavn — tom for privatkunder
  cvrNumber: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: string;
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
  categories: string[];
};

export type ShiftStatus = "open" | "for_resale" | "assigned" | "completed" | "cancelled";
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
  shiftDate: string; // ISO dato — denormaliseret kopi af eventets dato
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  status: ShiftStatus;
  previousStatus: ShiftStatus | null; // til "fortryd sletning"
  assignedFreelancerId: string | null;
  assignedFreelancerName: string | null;
  interests: ShiftInterestItem[];
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

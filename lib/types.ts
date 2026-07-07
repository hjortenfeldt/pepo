export type WorkCategory = {
  id: string;
  name: string;
};

export type RegistrationFormData = {
  fullName: string;
  gender: string;
  birthDate: string;
  postalOrCity: string;
  email: string;
  phone: string;
  categoryIds: string[];
  bio: string;
  socialMediaUrl: string;
};

export type RegistrationResult =
  | { success: true }
  | { success: false; error: string };

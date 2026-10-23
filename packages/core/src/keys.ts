/**
 * The eleven facts, spelled once and shared by every form.
 *
 * The key is what makes the second form cheaper than the first. It is
 * deliberately not the form's label: "Contact number", "Mobile", and
 * "Phone (primary)" all resolve to `person.phone.mobile`.
 */

export const KEY = {
  personName: "person.full_name",
  personDob: "person.dob",
  personNationality: "person.nationality",
  personPhone: "person.phone.mobile",
  personEmail: "person.email",

  addressLine1: "address.current.line1",
  addressCity: "address.current.city",
  addressPostcode: "address.current.postcode",
  addressPrevious: "address.previous.line1",

  identityNumber: "identity.id_number",
  identityIssued: "identity.id_issued",
  identityExpiry: "identity.id_expiry",

  educationInstitution: "education.institution",
  educationProgramme: "education.programme",
  educationYear: "education.year",
  educationGpa: "education.gpa",

  employmentEmployer: "employment.employer",
  employmentRole: "employment.role",
  employmentIncome: "employment.income_annual",

  financeBank: "finance.bank_name",
  financeAccount: "finance.account_number",
  financeStatementDate: "finance.statement_date",

  refereeName: "referee.1.name",
  refereePhone: "referee.1.phone",

  skills: "skills.list",
  certifications: "certifications.list",
  summary: "person.summary",
  /** Free text a person wrote about themselves. Attested only; no form asks for it. */
  context: "person.context",
} as const;

export type KeyName = (typeof KEY)[keyof typeof KEY];

/** Human labels for the index view. The ask card uses the form's wording instead. */
export const KEY_LABEL: Record<string, string> = {
  [KEY.personName]: "Full name",
  [KEY.personDob]: "Date of birth",
  [KEY.personNationality]: "Nationality",
  [KEY.personPhone]: "Mobile number",
  [KEY.personEmail]: "Email address",
  [KEY.addressLine1]: "Address",
  [KEY.addressCity]: "City",
  [KEY.addressPostcode]: "Postcode",
  [KEY.addressPrevious]: "Previous address",
  [KEY.identityNumber]: "ID number",
  [KEY.identityIssued]: "ID issued",
  [KEY.identityExpiry]: "ID expires",
  [KEY.educationInstitution]: "Institution",
  [KEY.educationProgramme]: "Programme",
  [KEY.educationYear]: "Year of study",
  [KEY.educationGpa]: "GPA",
  [KEY.employmentEmployer]: "Employer",
  [KEY.employmentRole]: "Role",
  [KEY.employmentIncome]: "Annual income",
  [KEY.financeBank]: "Bank",
  [KEY.financeAccount]: "Account number",
  [KEY.financeStatementDate]: "Statement date",
  [KEY.refereeName]: "Referee name",
  [KEY.refereePhone]: "Referee phone",
  [KEY.skills]: "Skills",
  [KEY.certifications]: "Certifications",
  [KEY.summary]: "Short summary",
  [KEY.context]: "About you",
};

/**
 * Which keys are dates, and whether the date is a deadline.
 * `expires` keys are rejected once they are in the past.
 */
export const DATE_KEYS: Record<string, "expires" | "plain"> = {
  [KEY.personDob]: "plain",
  [KEY.identityIssued]: "plain",
  [KEY.identityExpiry]: "expires",
  [KEY.financeStatementDate]: "plain",
};

/** Keys that a document has to be recent to prove. */
export const RECENCY_KEYS: string[] = [KEY.addressLine1, KEY.addressCity, KEY.addressPostcode];

/** Keys only an income document may supply. */
export const INCOME_KEYS: string[] = [KEY.employmentIncome, KEY.employmentEmployer, KEY.employmentRole];

/**
 * What a document of each kind would normally carry, if it had been readable.
 *
 * This is what lets the app say "there is a reference letter in your folder, but
 * it is a photograph and I cannot read the name on it" instead of pretending the
 * file is not there.
 */
export const KIND_KEYS: Record<string, string[]> = {
  identity: [KEY.personName, KEY.personDob, KEY.personNationality, KEY.identityNumber, KEY.identityIssued, KEY.identityExpiry],
  address_proof: [KEY.personName, KEY.addressLine1, KEY.addressCity, KEY.addressPostcode],
  income_proof: [KEY.personName, KEY.employmentEmployer, KEY.employmentRole, KEY.employmentIncome],
  education: [KEY.personName, KEY.educationInstitution, KEY.educationProgramme, KEY.educationYear, KEY.educationGpa],
  reference: [KEY.refereeName, KEY.refereePhone],
  resume: [
    KEY.personName,
    KEY.personEmail,
    KEY.personPhone,
    KEY.educationInstitution,
    KEY.educationProgramme,
    KEY.educationGpa,
    KEY.skills,
    KEY.certifications,
  ],
  other: [KEY.personName],
};

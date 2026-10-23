import { KEY } from "./keys.js";

/**
 * The fallback when no model is available, and the sanity check when one is.
 *
 * Ordered, because "Referee mobile" must not be read as the applicant's mobile
 * number. A form the rules have never seen is where the model earns its place;
 * a form whose labels are these words does not need one.
 */
const HINTS: [RegExp, string][] = [
  [/attach.*(identity|id|passport)/i, "documents.identity"],
  [/attach.*(address|utility|residence)/i, "documents.address_proof"],
  [/attach.*(income|salary|payslip)/i, "documents.income_proof"],
  [/attach.*(marksheet|transcript|grade|education)/i, "documents.education"],
  [/attach/, "documents.other"],

  [/referee.*(phone|mobile|tel|contact)/i, KEY.refereePhone],
  [/referee|reference|recommend/i, KEY.refereeName],

  [/previous.*(address|residence)/i, KEY.addressPrevious],

  [/(full|legal|given)?\s*name|surname/i, KEY.personName],
  [/date of birth|\bdob\b|birth date/i, KEY.personDob],
  [/nationality|citizen/i, KEY.personNationality],

  [/(mobile|phone|telephone|\btel\b|contact number)/i, KEY.personPhone],
  [/e-?mail/i, KEY.personEmail],

  [/(post|zip)\s*code/i, KEY.addressPostcode],
  [/(city|town|locality)/i, KEY.addressCity],
  [/(residential|home|current|mailing)?\s*address/i, KEY.addressLine1],

  [/identity.*(number|no\b|#)|document number|passport number/i, KEY.identityNumber],
  [/identity.*(expiry|expires|valid until)|expiry/i, KEY.identityExpiry],

  [/(institution|university|college|school)/i, KEY.educationInstitution],
  [/programme|program\b|course|degree/i, KEY.educationProgramme],
  [/year of study|current year|study year/i, KEY.educationYear],
  [/\bgpa\b|grade point|grade average/i, KEY.educationGpa],

  [/(employer|company|organisation|organization)/i, KEY.employmentEmployer],
  [/(occupation|job title|role|designation|position)/i, KEY.employmentRole],
  [/(income|salary|earnings|compensation)/i, KEY.employmentIncome],

  [/\bbank\b/i, KEY.financeBank],
  [/account number/i, KEY.financeAccount],
  [/statement date/i, KEY.financeStatementDate],

  [/skills?/i, KEY.skills],
  [/summary|profile|about you|introduction/i, KEY.summary],
];

/**
 * Questions that contain a word the rules look for but are not that field.
 * "How did you hear about this role?" is not a job title; a form that reads it
 * as one would put a sentence into an occupation.
 */
const NOT_FIELDS: RegExp[] = [
  /how did you hear|hear about (this|the) (role|job|position)|referral source/i,
  /captcha|leave this (field )?blank|do not fill/i,
];

export function guessKey(label: string): string | null {
  for (const re of NOT_FIELDS) if (re.test(label)) return null;
  for (const [re, key] of HINTS) if (re.test(label)) return key;
  return null;
}

/** True when a value looks like a key this project knows. */
export function isKnownKey(key: string): boolean {
  return Object.values(KEY).includes(key as never) || key.startsWith("documents.") || key.startsWith("essay.");
}

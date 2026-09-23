import { CONTACT_INFO } from '@/data/resumeData';

/** The phone number in any formatting: 479-283-4454, (479) 283 4454, 4792834454. */
export const PHONE = new RegExp((CONTACT_INFO.phone.match(/\d+/g) ?? []).join('\\D{0,3}'));

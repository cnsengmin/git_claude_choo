export type MvpAdminLegalLink = {
  adminCode: string;
  legalCode: string;
  legalName: string;
  createdAt: string;
};

/**
 * Current Anyang administrative-dong -> legal-dong links extracted from the
 * verified KIKmix.20260720 snapshot. The relation is many-to-many: one
 * administrative dong can cover more than one legal dong, and many
 * administrative dongs can point to the same legal dong.
 */
export const MVP_ADMIN_LEGAL_LINKS: MvpAdminLegalLink[] = [
  { adminCode: "4117151000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117152000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117153000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117154000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117155000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117156000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117157000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117158200", legalCode: "4117110100", legalName: "안양동", createdAt: "2026-07-01" },
  { adminCode: "4117158300", legalCode: "4117110100", legalName: "안양동", createdAt: "2026-07-01" },
  { adminCode: "4117159000", legalCode: "4117110100", legalName: "안양동", createdAt: "1996-12-31" },
  { adminCode: "4117159000", legalCode: "4117110200", legalName: "석수동", createdAt: "1992-10-01" },
  { adminCode: "4117160000", legalCode: "4117110200", legalName: "석수동", createdAt: "1992-10-01" },
  { adminCode: "4117161100", legalCode: "4117110200", legalName: "석수동", createdAt: "2024-01-01" },
  { adminCode: "4117164000", legalCode: "4117110300", legalName: "박달동", createdAt: "2025-07-01" },
  { adminCode: "4117165000", legalCode: "4117110300", legalName: "박달동", createdAt: "2025-07-01" },
  { adminCode: "4117351000", legalCode: "4117110100", legalName: "안양동", createdAt: "1992-10-01" },
  { adminCode: "4117351000", legalCode: "4117310100", legalName: "비산동", createdAt: "1992-10-01" },
  { adminCode: "4117352000", legalCode: "4117310100", legalName: "비산동", createdAt: "1992-10-01" },
  { adminCode: "4117353000", legalCode: "4117310100", legalName: "비산동", createdAt: "1992-10-01" },
  { adminCode: "4117354000", legalCode: "4117310100", legalName: "비산동", createdAt: "1992-10-01" },
  { adminCode: "4117354600", legalCode: "4117310100", legalName: "비산동", createdAt: "1993-05-20" },
  { adminCode: "4117355200", legalCode: "4117310200", legalName: "관양동", createdAt: "2024-01-01" },
  { adminCode: "4117355900", legalCode: "4117310200", legalName: "관양동", createdAt: "2024-01-01" },
  { adminCode: "4117356600", legalCode: "4117310200", legalName: "관양동", createdAt: "1993-01-15" },
  { adminCode: "4117357000", legalCode: "4117310300", legalName: "평촌동", createdAt: "1992-10-01" },
  { adminCode: "4117357600", legalCode: "4117310300", legalName: "평촌동", createdAt: "1993-01-15" },
  { adminCode: "4117357800", legalCode: "4117310300", legalName: "평촌동", createdAt: "1994-07-10" },
  { adminCode: "4117358000", legalCode: "4117310400", legalName: "호계동", createdAt: "1992-10-01" },
  { adminCode: "4117359000", legalCode: "4117310400", legalName: "호계동", createdAt: "1992-10-01" },
  { adminCode: "4117360000", legalCode: "4117310400", legalName: "호계동", createdAt: "1992-10-01" },
  { adminCode: "4117361000", legalCode: "4117310400", legalName: "호계동", createdAt: "1992-10-01" },
  { adminCode: "4117362000", legalCode: "4117310400", legalName: "호계동", createdAt: "1993-01-15" },
  { adminCode: "4117363000", legalCode: "4117310400", legalName: "호계동", createdAt: "1993-05-20" },
];

export function getMvpAdminLegalLinks(adminCode: string) {
  return MVP_ADMIN_LEGAL_LINKS.filter((link) => link.adminCode === adminCode);
}

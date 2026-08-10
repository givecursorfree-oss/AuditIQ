import { serviceLabel } from './clientRequestHelpers.js';

export function mapClientRequestRow<
  T extends {
    selectedServices: unknown;
    financialYears: unknown;
    engagements?: {
      id: string;
      title: string;
      serviceCode: string | null;
      letterStatus: string;
      requestStatus: string | null;
      status: string;
    }[];
    engagement?: {
      id: string;
      title: string;
      letterStatus: string;
      requestStatus: string | null;
    } | null;
  },
>(row: T) {
  const services = row.selectedServices as string[];
  const years = row.financialYears as string[];
  const engagements = row.engagements ?? (row.engagement ? [row.engagement] : []);
  return {
    ...row,
    selectedServices: services,
    financialYears: years,
    serviceLabels: services.map(serviceLabel),
    engagements,
    /** @deprecated use engagements[0] */
    engagement: engagements[0] ?? null,
  };
}

import * as organizationRepository from "@/repositories/organization-repository";
import type { OrganizationTimezoneInfo } from "@/repositories/organization-repository";

export async function listActiveOrganizationIds(): Promise<string[]> {
  return organizationRepository.listActiveOrganizationIds();
}

export async function listOrganizationTimezones(): Promise<OrganizationTimezoneInfo[]> {
  return organizationRepository.listOrganizationTimezones();
}

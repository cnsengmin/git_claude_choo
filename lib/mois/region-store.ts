import { getMvpAdminLegalLinks, type MvpAdminLegalLink } from "./mvp-crosswalk";
import {
  getMvpRegion,
  getMvpRegionPath,
  listMvpRegionChildren,
  MVP_REGION_SNAPSHOT,
  type MvpRegionNode,
} from "./mvp-regions";

export type RegionStoreSnapshot = {
  sourceDatasetId: string;
  snapshotDate: string;
  scope: string;
  limitation: string;
  runtimeMode: "fixture" | "generated" | "database";
};

export interface RegionStore {
  getSnapshot(): RegionStoreSnapshot;
  getRegion(code: string): MvpRegionNode | null;
  getPath(code: string): MvpRegionNode[];
  listChildren(parentCode: string | null): Array<MvpRegionNode & { hasChildren: boolean }>;
  getAdminLegalLinks(adminCode: string): MvpAdminLegalLink[];
}

/**
 * Current MVP adapter.
 *
 * The API/UI depends only on RegionStore. When the generated national KIK
 * artifacts are connected, replace this adapter rather than rewriting the
 * RegionPicker or /api/regions response contract.
 */
export const fixtureRegionStore: RegionStore = {
  getSnapshot() {
    return {
      ...MVP_REGION_SNAPSHOT,
      runtimeMode: "fixture",
    };
  },
  getRegion(code) {
    return getMvpRegion(code);
  },
  getPath(code) {
    return getMvpRegionPath(code);
  },
  listChildren(parentCode) {
    return listMvpRegionChildren(parentCode);
  },
  getAdminLegalLinks(adminCode) {
    return getMvpAdminLegalLinks(adminCode);
  },
};

/**
 * Runtime selector kept deliberately boring for the MVP.
 * A later national adapter can be selected by environment/config without
 * changing call sites. Until that adapter is verified, fixture remains the
 * safe default rather than pretending national runtime data is available.
 */
export function getRegionStore(): RegionStore {
  return fixtureRegionStore;
}

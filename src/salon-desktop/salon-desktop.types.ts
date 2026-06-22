export interface DesktopReleaseManifest {
  version: string;
  installerUrl: string;
  installerFileName: string;
  minWindowsVersion: string;
  publishedAt: string;
  changelog: string[];
  releaseNotesUrl?: string;
}

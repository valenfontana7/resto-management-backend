import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DesktopReleaseManifest } from './salon-desktop.types';

const DEFAULT_MANIFEST: DesktopReleaseManifest = {
  version: '0.2.1',
  installerUrl: 'https://bentoo.com.ar/downloads/BentooSalon-Win7-Setup.exe',
  installerFileName: 'BentooSalon-Win7-Setup.exe',
  minWindowsVersion: '6.1',
  publishedAt: '2026-06-20T00:00:00.000Z',
  changelog: [
    'Instalador unificado Desktop + Salon Local para Windows 7 SP1+',
    'Aviso de actualización al iniciar el terminal de salón',
  ],
  releaseNotesUrl: 'https://bentoo.com.ar/downloads/desktop-latest.json',
};

@Injectable()
export class SalonDesktopService {
  constructor(private readonly config: ConfigService) {}

  getLatestRelease(): DesktopReleaseManifest {
    const version =
      this.config.get<string>('DESKTOP_RELEASE_VERSION')?.trim() ||
      DEFAULT_MANIFEST.version;
    const installerUrl =
      this.config.get<string>('DESKTOP_RELEASE_INSTALLER_URL')?.trim() ||
      DEFAULT_MANIFEST.installerUrl;
    const installerFileName =
      this.config.get<string>('DESKTOP_RELEASE_INSTALLER_FILE')?.trim() ||
      DEFAULT_MANIFEST.installerFileName;
    const publishedAt =
      this.config.get<string>('DESKTOP_RELEASE_PUBLISHED_AT')?.trim() ||
      DEFAULT_MANIFEST.publishedAt;
    const releaseNotesUrl =
      this.config.get<string>('DESKTOP_RELEASE_NOTES_URL')?.trim() ||
      DEFAULT_MANIFEST.releaseNotesUrl;

    const changelogRaw =
      this.config.get<string>('DESKTOP_RELEASE_CHANGELOG')?.trim() || '';
    const changelog = changelogRaw
      ? changelogRaw
          .split('|')
          .map((line) => line.trim())
          .filter(Boolean)
      : DEFAULT_MANIFEST.changelog;

    return {
      version,
      installerUrl,
      installerFileName,
      minWindowsVersion:
        this.config.get<string>('DESKTOP_RELEASE_MIN_WINDOWS')?.trim() ||
        DEFAULT_MANIFEST.minWindowsVersion,
      publishedAt,
      changelog,
      releaseNotesUrl,
    };
  }
}

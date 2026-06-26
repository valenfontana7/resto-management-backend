import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DesktopReleaseManifest } from './salon-desktop.types';

const DEFAULT_MANIFEST_URL =
  'https://bentoo.com.ar/downloads/desktop-latest.json';

const DEFAULT_MANIFEST: DesktopReleaseManifest = {
  version: '0.2.8',
  installerUrl: 'https://bentoo.com.ar/downloads/BentooSalon-Win7-Setup.exe',
  installerFileName: 'BentooSalon-Win7-Setup.exe',
  minWindowsVersion: '6.1',
  publishedAt: '2026-06-27T00:00:00.000Z',
  changelog: [
    'Bentoo Salón Desktop v0.2.8',
    'Sync operativo: mesas, menú, sesiones y pedidos desde la nube en cada poll',
    'Bootstrap refresca caja y catálogo; sync background cada 15 s',
  ],
  releaseNotesUrl: DEFAULT_MANIFEST_URL,
};

const REMOTE_CACHE_TTL_MS = 5 * 60 * 1000;
const REMOTE_FETCH_TIMEOUT_MS = 12_000;

@Injectable()
export class SalonDesktopService {
  private readonly logger = new Logger(SalonDesktopService.name);
  private remoteCache: {
    manifest: DesktopReleaseManifest;
    fetchedAt: number;
  } | null = null;

  constructor(private readonly config: ConfigService) {}

  async getLatestRelease(): Promise<DesktopReleaseManifest> {
    const pinnedVersion =
      this.config.get<string>('DESKTOP_RELEASE_VERSION')?.trim() ?? '';
    if (pinnedVersion) {
      return this.buildFromEnv(DEFAULT_MANIFEST);
    }

    const remote = await this.fetchCachedRemoteManifest();
    if (remote) {
      return this.applyEnvOverrides(remote);
    }

    return this.buildFromEnv(DEFAULT_MANIFEST);
  }

  private async fetchCachedRemoteManifest(): Promise<DesktopReleaseManifest | null> {
    const now = Date.now();
    if (
      this.remoteCache &&
      now - this.remoteCache.fetchedAt < REMOTE_CACHE_TTL_MS
    ) {
      return this.remoteCache.manifest;
    }

    const url =
      this.config.get<string>('DESKTOP_RELEASE_MANIFEST_URL')?.trim() ||
      DEFAULT_MANIFEST_URL;

    const manifest = await this.fetchRemoteManifest(url);
    if (!manifest) return null;

    this.remoteCache = { manifest, fetchedAt: now };
    return manifest;
  }

  private async fetchRemoteManifest(
    url: string,
  ): Promise<DesktopReleaseManifest | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REMOTE_FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.warn(
          `desktop manifest ${url} responded ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as Partial<DesktopReleaseManifest>;
      return this.normalizeManifest(body);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown fetch error';
      this.logger.warn(`desktop manifest fetch failed (${url}): ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeManifest(
    raw: Partial<DesktopReleaseManifest>,
  ): DesktopReleaseManifest | null {
    const version = raw.version?.trim() ?? '';
    const installerUrl = raw.installerUrl?.trim() ?? '';
    if (!version || !installerUrl) return null;

    const changelog = Array.isArray(raw.changelog)
      ? raw.changelog.map((line) => String(line).trim()).filter(Boolean)
      : DEFAULT_MANIFEST.changelog;

    return {
      version,
      installerUrl,
      installerFileName:
        raw.installerFileName?.trim() || DEFAULT_MANIFEST.installerFileName,
      minWindowsVersion:
        raw.minWindowsVersion?.trim() || DEFAULT_MANIFEST.minWindowsVersion,
      publishedAt: raw.publishedAt?.trim() || DEFAULT_MANIFEST.publishedAt,
      changelog,
      releaseNotesUrl:
        raw.releaseNotesUrl?.trim() || DEFAULT_MANIFEST.releaseNotesUrl,
      ...(raw.installerSha256?.trim()
        ? { installerSha256: raw.installerSha256.trim() }
        : {}),
    };
  }

  private applyEnvOverrides(
    base: DesktopReleaseManifest,
  ): DesktopReleaseManifest {
    return this.buildFromEnv(base);
  }

  private buildFromEnv(
    fallback: DesktopReleaseManifest,
  ): DesktopReleaseManifest {
    const version =
      this.config.get<string>('DESKTOP_RELEASE_VERSION')?.trim() ||
      fallback.version;
    const installerUrl =
      this.config.get<string>('DESKTOP_RELEASE_INSTALLER_URL')?.trim() ||
      fallback.installerUrl;
    const installerFileName =
      this.config.get<string>('DESKTOP_RELEASE_INSTALLER_FILE')?.trim() ||
      fallback.installerFileName;
    const publishedAt =
      this.config.get<string>('DESKTOP_RELEASE_PUBLISHED_AT')?.trim() ||
      fallback.publishedAt;
    const releaseNotesUrl =
      this.config.get<string>('DESKTOP_RELEASE_NOTES_URL')?.trim() ||
      fallback.releaseNotesUrl;
    const installerSha256 =
      this.config.get<string>('DESKTOP_RELEASE_INSTALLER_SHA256')?.trim() ||
      fallback.installerSha256;

    const changelogRaw =
      this.config.get<string>('DESKTOP_RELEASE_CHANGELOG')?.trim() || '';
    const changelog = changelogRaw
      ? changelogRaw
          .split('|')
          .map((line) => line.trim())
          .filter(Boolean)
      : fallback.changelog;

    return {
      version,
      installerUrl,
      installerFileName,
      minWindowsVersion:
        this.config.get<string>('DESKTOP_RELEASE_MIN_WINDOWS')?.trim() ||
        fallback.minWindowsVersion,
      publishedAt,
      changelog,
      releaseNotesUrl,
      ...(installerSha256 ? { installerSha256 } : {}),
    };
  }
}
